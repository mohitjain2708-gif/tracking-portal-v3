import json

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User

OWNER_EMAIL = "owner@trackingportal.app"
OWNER_PASSWORD = "PortalOwner@2026"


def ensure_user_schema(db: Session) -> None:
    inspector = inspect(db.bind)
    columns = {column["name"] for column in inspector.get_columns("users")}
    if "is_admin" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
        db.commit()
        columns.add("is_admin")
    if "password_reset_required" not in columns:
        db.execute(text("ALTER TABLE users ADD COLUMN password_reset_required BOOLEAN NOT NULL DEFAULT 0"))
        db.commit()


def ensure_owner_account(db: Session) -> str:
    ensure_user_schema(db)
    owner = db.execute(select(User).where(User.email == OWNER_EMAIL)).scalar_one_or_none()
    password_hash = hash_password(OWNER_PASSWORD)
    if not owner:
        owner = User(email=OWNER_EMAIL, password_hash=password_hash, is_admin=True, password_reset_required=False)
        db.add(owner)
        db.commit()
        return OWNER_EMAIL

    updated = False
    if not owner.is_admin:
        owner.is_admin = True
        updated = True
    if owner.password_hash != password_hash:
        owner.password_hash = password_hash
        updated = True
    if owner.password_reset_required:
        owner.password_reset_required = False
        updated = True
    if updated:
        db.commit()
    return OWNER_EMAIL


def seed_test_users(db: Session) -> list[str]:
    ensure_user_schema(db)
    raw_value = (settings.seed_test_users or "").strip()
    if not raw_value:
        return []

    try:
        accounts = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise RuntimeError("SEED_TEST_USERS must be valid JSON.") from exc

    if not isinstance(accounts, list):
        raise RuntimeError("SEED_TEST_USERS must be a JSON array.")

    seeded: list[str] = []
    for item in accounts:
        if not isinstance(item, dict):
            continue
        email = str(item.get("email") or "").strip().lower()
        password = str(item.get("password") or "").strip()
        is_admin = bool(item.get("is_admin"))
        if not email or not password:
            continue
        existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing:
            if is_admin and not existing.is_admin:
                existing.is_admin = True
                db.commit()
            continue
        user = User(email=email, password_hash=hash_password(password), is_admin=is_admin, password_reset_required=False)
        db.add(user)
        seeded.append(email)

    if seeded:
        db.commit()

    return seeded
