import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User


def seed_test_users(db: Session) -> list[str]:
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
        if not email or not password:
            continue
        existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing:
            continue
        user = User(email=email, password_hash=hash_password(password))
        db.add(user)
        seeded.append(email)

    if seeded:
        db.commit()

    return seeded
