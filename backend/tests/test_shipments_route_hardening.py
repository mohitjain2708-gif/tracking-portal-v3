from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.api.routes.shipments as shipments_module
from app.core.database import Base
from app.deps import get_current_admin
from app.models.shipment import Shipment
from app.models.user import User


class ShipmentsRouteHardeningTests(unittest.TestCase):
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

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_legacy_bootstrap_returns_immediately_when_no_rows_exist(self) -> None:
        original_load_state = shipments_module._load_state
        try:
            shipments_module._load_state = lambda: {"shipments": []}

            class UnexpectedDatabaseAccess:
                def __getattr__(self, name):
                    raise AssertionError(f"bootstrap should not touch the database when no legacy rows exist: {name}")

            shipments_module._bootstrap_shipments_from_legacy_state(UnexpectedDatabaseAccess())
        finally:
            shipments_module._load_state = original_load_state

    def test_system_status_route_requires_admin_dependency(self) -> None:
        route = next(
            route
            for route in shipments_module.router.routes
            if getattr(route, "path", "") == "/system/status"
        )
        dependency_calls = [dependency.call for dependency in route.dependant.dependencies]
        self.assertIn(get_current_admin, dependency_calls)

    def test_read_sheet_closes_workbook_after_preview_extraction(self) -> None:
        original_load_workbook = shipments_module.load_workbook
        original_select_sheet_by_name = shipments_module._select_sheet_by_name
        original_sheet_rows_with_merged_fill = shipments_module._sheet_rows_with_merged_fill
        original_pick_header_row = shipments_module._pick_header_row
        original_build_row_object = shipments_module._build_row_object
        closed = {"value": False}

        class FakeSheet:
            title = "Tracking"

        class FakeWorkbook:
            sheetnames = ["Tracking"]

            def close(self):
                closed["value"] = True

        try:
            shipments_module.load_workbook = lambda *args, **kwargs: FakeWorkbook()
            shipments_module._select_sheet_by_name = lambda workbook, preferred_sheet: FakeSheet()
            shipments_module._sheet_rows_with_merged_fill = lambda sheet: [
                ["Container", "BL"],
                ["MSBU1891823", "FRE/CCU/0126/976"],
            ]
            shipments_module._pick_header_row = lambda rows: (0, ["Container", "BL"])
            shipments_module._build_row_object = lambda headers, row: dict(zip(headers, row))

            result = shipments_module._read_sheet(Path("ignored.xlsx"))

            self.assertEqual(result[0], "Tracking")
            self.assertTrue(closed["value"])
        finally:
            shipments_module.load_workbook = original_load_workbook
            shipments_module._select_sheet_by_name = original_select_sheet_by_name
            shipments_module._sheet_rows_with_merged_fill = original_sheet_rows_with_merged_fill
            shipments_module._pick_header_row = original_pick_header_row
            shipments_module._build_row_object = original_build_row_object

    def test_resolve_group_shipments_returns_all_rows_for_normalized_bl(self) -> None:
        primary = Shipment(
            user_id=self.user.id,
            customer_name="Grouped Customer",
            container_number="MRKU5778966",
            bl_number="BL123456",
            shipment_status="active",
        )
        sibling = Shipment(
            user_id=self.user.id,
            customer_name="Grouped Customer",
            container_number="MRKU5778967",
            bl_number="BL123456",
            shipment_status="completed",
        )
        unrelated = Shipment(
            user_id=self.user.id,
            customer_name="Other Customer",
            container_number="MRKU5778999",
            bl_number="BL999999",
            shipment_status="active",
        )
        self.db.add_all([primary, sibling, unrelated])
        self.db.commit()

        resolved = shipments_module._resolve_group_shipments(
            self.db,
            self.user,
            bl_number="BL 123456",
            container_numbers=["MRKU5778966"],
            include_archived=True,
        )

        self.assertEqual({shipment.container_number for shipment in resolved}, {"MRKU5778966", "MRKU5778967"})


if __name__ == "__main__":
    unittest.main()
