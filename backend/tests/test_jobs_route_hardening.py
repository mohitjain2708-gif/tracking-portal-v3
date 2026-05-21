from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.api.routes.jobs as jobs_module
from app.core.database import Base
from app.models.job import Job
from app.models.upload_session import UploadSession
from app.models.user import User
from app.schemas.job import ProcessJobRequest


class JobsRouteHardeningTests(unittest.TestCase):
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
        self.user = User(email="auditor@example.com", password_hash="hashed-password", is_admin=False)
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)
        self.upload = UploadSession(
            user_id=self.user.id,
            original_filename="shipments.xlsx",
            stored_path="C:\\temp\\shipments.xlsx",
            detected_sheet="Tracking",
            detected_header_row=1,
            available_columns_json=["Container Number"],
            preview_rows_json=[{"container_number": "MRKU5778966"}],
            status="uploaded",
        )
        self.db.add(self.upload)
        self.db.commit()
        self.db.refresh(self.upload)

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_process_job_marks_upload_failed_when_mapping_raises(self) -> None:
        original_process = jobs_module.process_with_mapping
        try:
            jobs_module.process_with_mapping = lambda **kwargs: (_ for _ in ()).throw(RuntimeError("mapping exploded"))

            response = jobs_module.process_job(
                ProcessJobRequest(upload_id=self.upload.id, mapping_json={"container_number": "Container Number"}),
                db=self.db,
                current_user=self.user,
            )
        finally:
            jobs_module.process_with_mapping = original_process

        failed_job = self.db.get(Job, response.id)
        refreshed_upload = self.db.get(UploadSession, self.upload.id)

        self.assertEqual(response.status, "failed")
        self.assertEqual(response.error_message, "mapping exploded")
        self.assertIsNotNone(failed_job)
        self.assertEqual(failed_job.status, "failed")
        self.assertEqual(refreshed_upload.status, "failed")

    def test_process_job_recovers_from_success_commit_failure(self) -> None:
        original_process = jobs_module.process_with_mapping
        original_enrich = jobs_module._enrich_rows
        original_commit = self.db.commit
        commit_count = {"value": 0}

        def commit_with_failure():
            commit_count["value"] += 1
            if commit_count["value"] == 2:
                raise RuntimeError("commit broke")
            return original_commit()

        try:
            jobs_module.process_with_mapping = lambda **kwargs: {
                "headers": ["container_number"],
                "rows": [{"container_number": "MRKU5778966"}],
                "total_rows": 1,
            }
            jobs_module._enrich_rows = lambda rows: rows
            self.db.commit = commit_with_failure

            response = jobs_module.process_job(
                ProcessJobRequest(upload_id=self.upload.id, mapping_json={"container_number": "Container Number"}),
                db=self.db,
                current_user=self.user,
            )
        finally:
            jobs_module.process_with_mapping = original_process
            jobs_module._enrich_rows = original_enrich
            self.db.commit = original_commit

        failed_job = self.db.get(Job, response.id)
        refreshed_upload = self.db.get(UploadSession, self.upload.id)

        self.assertEqual(response.status, "failed")
        self.assertEqual(response.error_message, "commit broke")
        self.assertIsNotNone(failed_job)
        self.assertEqual(failed_job.status, "failed")
        self.assertEqual(refreshed_upload.status, "failed")


if __name__ == "__main__":
    unittest.main()
