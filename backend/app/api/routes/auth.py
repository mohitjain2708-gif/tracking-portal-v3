import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.bootstrap import ensure_owner_account, ensure_user_schema
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.api.routes.shipments import _shipment_to_dict
from app.deps import get_current_admin, get_current_user
from app.models.audit_log import AuditLog
from app.models.job import Job
from app.models.shipment import Shipment
from app.models.shipment_source import (
    RawSourceRow,
    ShipmentBatch,
    ShipmentSource,
    SourceConnection,
    SourceMappingProfile,
)
from app.models.template import Template
from app.models.upload_session import UploadSession
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


def _log_auth_audit_event(db: Session, user: User, action: str, details: dict | None = None) -> None:
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            shipment_status="",
            details_json=json.dumps(details or {}),
        )
    )
    db.commit()


def _group_owner_shipments(shipments: list[Shipment]) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    for shipment in shipments:
        row = _shipment_to_dict(shipment)
        normalized_bl = "".join(str(row.get("bl_number", "") or "").upper().split())
        group_key = f"BL:{normalized_bl}" if normalized_bl else f"SHIP:{row['id']}"
        grouped.setdefault(group_key, []).append(row)

    rows: list[dict] = []
    for group_key, entries in grouped.items():
        lead = max(
            entries,
            key=lambda item: (
                item.get("shipment_status") == "active",
                item.get("shipment_status") == "completed",
                item.get("latest_time", ""),
                item.get("id", 0),
            ),
        )
        container_numbers = sorted(
            {
                str(item.get("container_number", "") or "").strip()
                for item in entries
                if str(item.get("container_number", "") or "").strip()
            }
        )
        rows.append(
            {
                "group_key": group_key,
                "id": lead.get("id"),
                "customer_name": lead.get("customer_name", ""),
                "bl_number": lead.get("bl_number", ""),
                "shipment_status": lead.get("shipment_status", "active"),
                "movement_category": lead.get("movement_category", ""),
                "latest_location": lead.get("latest_location", ""),
                "latest_time": lead.get("latest_time", ""),
                "movement_since_date": min(
                    [item.get("movement_since_date", "") for item in entries if item.get("movement_since_date", "")] or [""]
                ),
                "container_numbers": container_numbers,
                "container_count": len(container_numbers),
                "action_required": any(bool(item.get("action_required")) for item in entries),
                "do_date": next((item.get("do_date", "") for item in entries if item.get("do_date", "")), ""),
                "document_status": next(
                    (item.get("document_status", "") for item in entries if item.get("document_status", "")),
                    "",
                ),
                "clearance_doc_number": next(
                    (item.get("clearance_doc_number", "") for item in entries if item.get("clearance_doc_number", "")),
                    "",
                ),
            }
        )

    return sorted(
        rows,
        key=lambda item: (
            item.get("shipment_status") != "active",
            item.get("shipment_status") != "completed",
            item.get("latest_time", ""),
            item.get("customer_name", ""),
        ),
    )


def _remove_user_data(db: Session, user: User) -> dict[str, int]:
    upload_sessions = list(db.execute(select(UploadSession).where(UploadSession.user_id == user.id)).scalars())
    deleted_counts = {
        "shipments": int(db.execute(delete(Shipment).where(Shipment.user_id == user.id)).rowcount or 0),
        "audit_events": int(db.execute(delete(AuditLog).where(AuditLog.user_id == user.id)).rowcount or 0),
        "jobs": int(db.execute(delete(Job).where(Job.user_id == user.id)).rowcount or 0),
        "raw_source_rows": int(db.execute(delete(RawSourceRow).where(RawSourceRow.user_id == user.id)).rowcount or 0),
        "shipment_batches": int(db.execute(delete(ShipmentBatch).where(ShipmentBatch.user_id == user.id)).rowcount or 0),
        "source_connections": int(db.execute(delete(SourceConnection).where(SourceConnection.user_id == user.id)).rowcount or 0),
        "mapping_profiles": int(db.execute(delete(SourceMappingProfile).where(SourceMappingProfile.user_id == user.id)).rowcount or 0),
        "shipment_sources": int(db.execute(delete(ShipmentSource).where(ShipmentSource.user_id == user.id)).rowcount or 0),
        "templates": int(db.execute(delete(Template).where(Template.user_id == user.id)).rowcount or 0),
        "upload_sessions": int(db.execute(delete(UploadSession).where(UploadSession.user_id == user.id)).rowcount or 0),
    }
    db.delete(user)
    db.commit()

    for session in upload_sessions:
        stored_path = str(getattr(session, "stored_path", "") or "").strip()
        if not stored_path:
            continue
        try:
            path = Path(stored_path)
            if path.exists():
                path.unlink()
        except OSError:
            pass

    return deleted_counts

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
    _log_auth_audit_event(db, user, "portal_signup", {"email": user.email})

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

    _log_auth_audit_event(db, user, "portal_login", {"email": user.email})
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
    last_activity_by_user = {
        user_id: created_at
        for user_id, created_at in db.execute(
            select(AuditLog.user_id, func.max(AuditLog.created_at)).group_by(AuditLog.user_id)
        ).all()
    }
    last_login_by_user = {
        user_id: created_at
        for user_id, created_at in db.execute(
            select(AuditLog.user_id, func.max(AuditLog.created_at))
            .where(AuditLog.action == "portal_login")
            .group_by(AuditLog.user_id)
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
                "last_activity_at": (
                    last_activity_by_user[user.id].isoformat()
                    if last_activity_by_user.get(user.id)
                    else ""
                ),
                "last_login_at": (
                    last_login_by_user[user.id].isoformat()
                    if last_login_by_user.get(user.id)
                    else ""
                ),
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


@router.get("/admin/users/{user_id}/shipments")
def admin_user_shipments(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    shipments = list(
        db.execute(
            select(Shipment)
            .where(Shipment.user_id == user.id)
            .order_by(Shipment.created_at.desc(), Shipment.id.desc())
        ).scalars()
    )
    grouped_rows = _group_owner_shipments(shipments)
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "is_admin": bool(user.is_admin),
            "created_at": user.created_at.isoformat() if user.created_at else "",
        },
        "metrics": {
            "shipment_groups": len(grouped_rows),
            "shipment_rows": len(shipments),
            "live_shipments": sum(1 for row in grouped_rows if row.get("shipment_status") == "active"),
            "completed_shipments": sum(1 for row in grouped_rows if row.get("shipment_status") == "completed"),
            "archived_shipments": sum(1 for row in grouped_rows if row.get("shipment_status") == "archived"),
        },
        "shipments": grouped_rows,
    }


@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Use your own account settings instead of removing the owner account")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be removed from this view")

    deleted_counts = _remove_user_data(db, user)
    return {
        "deleted": True,
        "email": user.email,
        "removed": deleted_counts,
    }
