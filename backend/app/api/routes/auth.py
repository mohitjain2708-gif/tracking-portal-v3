import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.bootstrap import ensure_owner_account, ensure_user_schema
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.deps import get_current_admin, get_current_user
from app.models.audit_log import AuditLog
from app.models.shipment import Shipment
from app.models.shipment_source import ShipmentBatch
from app.models.user import User
from app.schemas.auth import (
    AdminResetPasswordRequest,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()

@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    ensure_user_schema(db)
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=payload.email, password_hash=hash_password(payload.password), is_admin=False, password_reset_required=False)
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(str(user.id)))

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    ensure_owner_account(db)
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if settings.allow_demo_account_bootstrap and payload.email == settings.demo_email:
        if not user:
            user = User(email=settings.demo_email, password_hash=hash_password(settings.demo_password))
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not verify_password(settings.demo_password, user.password_hash):
            user.password_hash = hash_password(settings.demo_password)
            db.commit()
            db.refresh(user)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return TokenResponse(access_token=create_access_token(str(user.id)))

@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        is_admin=bool(current_user.is_admin),
        password_reset_required=bool(current_user.password_reset_required),
    )


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    current_user.password_reset_required = False
    db.commit()
    return {"updated": True}


@router.post("/admin/reset-password")
def admin_reset_password(
    payload: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if current_user.id == payload.user_id:
        raise HTTPException(status_code=400, detail="Use the normal change-password flow for your own account")
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.temporary_password)
    user.password_reset_required = True
    db.commit()
    return {"updated": True}


@router.get("/admin/overview")
def admin_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    users = list(db.execute(select(User).order_by(User.created_at.desc())).scalars())
    user_ids = [user.id for user in users]

    shipment_counts = {
        user_id: count
        for user_id, count in db.execute(
            select(Shipment.user_id, func.count(Shipment.id)).group_by(Shipment.user_id)
        ).all()
    }
    live_counts = {
        user_id: count
        for user_id, count in db.execute(
            select(Shipment.user_id, func.count(Shipment.id))
            .where(Shipment.shipment_status == "active")
            .group_by(Shipment.user_id)
        ).all()
    }
    batch_counts = {
        user_id: count
        for user_id, count in db.execute(
            select(ShipmentBatch.user_id, func.count(ShipmentBatch.id)).group_by(ShipmentBatch.user_id)
        ).all()
    }

    recent_audit_entries = list(
        db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(12)).scalars()
    )

    return {
        "owner": {
            "email": current_user.email,
        },
        "metrics": {
            "total_users": len(users),
            "admin_users": len([user for user in users if user.is_admin]),
            "total_shipments": int(db.execute(select(func.count(Shipment.id))).scalar() or 0),
            "live_shipments": int(
                db.execute(select(func.count(Shipment.id)).where(Shipment.shipment_status == "active")).scalar() or 0
            ),
            "completed_shipments": int(
                db.execute(select(func.count(Shipment.id)).where(Shipment.shipment_status == "completed")).scalar() or 0
            ),
            "archived_shipments": int(
                db.execute(select(func.count(Shipment.id)).where(Shipment.shipment_status == "archived")).scalar() or 0
            ),
            "source_batches": int(db.execute(select(func.count(ShipmentBatch.id))).scalar() or 0),
            "audit_events": int(db.execute(select(func.count(AuditLog.id))).scalar() or 0),
        },
        "users": [
            {
                "id": user.id,
                "email": user.email,
                "is_admin": bool(user.is_admin),
                "password_reset_required": bool(user.password_reset_required),
                "created_at": user.created_at.isoformat() if user.created_at else "",
                "shipment_count": int(shipment_counts.get(user.id, 0)),
                "live_shipment_count": int(live_counts.get(user.id, 0)),
                "source_batch_count": int(batch_counts.get(user.id, 0)),
            }
            for user in users
        ],
        "recent_activity": [
            {
                "id": entry.id,
                "email": next((user.email for user in users if user.id == entry.user_id), ""),
                "action": entry.action,
                "shipment_status": entry.shipment_status,
                "bl_number": entry.bl_number,
                "container_number": entry.container_number,
                "details": json.loads(entry.details_json or "{}"),
                "created_at": entry.created_at.isoformat() if entry.created_at else "",
            }
            for entry in recent_audit_entries
        ],
    }
