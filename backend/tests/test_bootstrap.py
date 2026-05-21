from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.bootstrap import OWNER_EMAIL, OWNER_PASSWORD, ensure_owner_account
from app.core.database import Base
from app.core.security import hash_password, verify_password
from app.models.user import User


class BootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            future=True,
        )
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = self.SessionLocal()

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_ensure_owner_account_preserves_valid_password_hash(self) -> None:
        existing_hash = hash_password(OWNER_PASSWORD)
        owner = User(
            email=OWNER_EMAIL,
            password_hash=existing_hash,
            is_admin=True,
            password_reset_required=False,
        )
        self.db.add(owner)
        self.db.commit()

        ensure_owner_account(self.db)
        refreshed = self.db.get(User, owner.id)

        self.assertIsNotNone(refreshed)
        self.assertEqual(refreshed.password_hash, existing_hash)
        self.assertTrue(verify_password(OWNER_PASSWORD, refreshed.password_hash))

    def test_ensure_owner_account_repairs_invalid_owner_row(self) -> None:
        owner = User(
            email=OWNER_EMAIL,
            password_hash=hash_password("wrong-password"),
            is_admin=False,
            password_reset_required=True,
        )
        self.db.add(owner)
        self.db.commit()
        wrong_hash = owner.password_hash

        ensure_owner_account(self.db)
        refreshed = self.db.get(User, owner.id)

        self.assertIsNotNone(refreshed)
        self.assertNotEqual(refreshed.password_hash, wrong_hash)
        self.assertTrue(verify_password(OWNER_PASSWORD, refreshed.password_hash))
        self.assertTrue(refreshed.is_admin)
        self.assertFalse(refreshed.password_reset_required)


if __name__ == "__main__":
    unittest.main()
