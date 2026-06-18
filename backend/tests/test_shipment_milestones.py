from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.api.routes.shipments as shipments_module
from app.api.routes.shipments import (
    _group_dashboard_rows,
    _group_dashboard_rows_from_items,
    _get_refresh_job,
    _run_refresh_all_job,
    _apply_group_status_transition,
    update_group_bl_surrender_status,
    _build_tracking_payload,
    _containers_from_import_row,
    _dashboard_identifiers,
    _derive_ldb_milestones,
    _extract_concor_wagon_signal,
    _effective_shipment_location,
    _movement_category,
    _movement_since_date,
    _normalize_bl_number,
    _normalize_destuffing_label,
    _should_use_pristine_arrival_override,
    _shipments_to_dicts,
    _should_ignore_stale_concor_data,
    _should_ignore_stale_ldb_data,
    _should_ignore_stale_pristine_data,
    _summarize_import_rows,
    _shipment_needs_action,
    update_group_payment_status,
)
import app.models  # noqa: F401
from app.core.database import Base
from app.models.shipment import Shipment
from app.schemas.shipment import ShipmentGroupBlStatusUpdateRequest, ShipmentGroupPaymentStatusUpdateRequest
from app.models.user import User


def _entry(event_name: str, location: str, timestamp: str) -> dict[str, str]:
    return {
        "eventName": event_name,
        "currentLocation": location,
        "timestampTimezone": timestamp,
    }


class ShipmentMilestoneTests(unittest.TestCase):
    def test_group_dashboard_rows_from_items_matches_model_grouping(self) -> None:
        shipments = [
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                birgunj_arrival_date="14-05-2026",
                latest_time="14-05-2026",
            ),
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                departure="13-05-2026",
                latest_time="13-05-2026",
            ),
            Shipment(
                customer_name="Solo Customer",
                container_number="MRKU5509972",
                bl_number="123456789",
                shipment_status="active",
                movement_category="At Port",
                latest_location="VISAKHAPATNAM",
                port_arrival_date="22-02-2026",
                latest_time="22-02-2026",
            ),
        ]

        grouped_from_models = _group_dashboard_rows(shipments)
        grouped_from_items = _group_dashboard_rows_from_items(_shipments_to_dicts(shipments))

        self.assertEqual(grouped_from_models, grouped_from_items)

    def test_group_dashboard_rows_include_bl_surrender_status(self) -> None:
        shipments = [
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                bl_surrender_status="pending",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                latest_time="14-05-2026",
            ),
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                bl_surrender_status="pending",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                latest_time="13-05-2026",
            ),
        ]

        grouped_rows = _group_dashboard_rows(shipments)

        self.assertEqual(len(grouped_rows), 1)
        self.assertEqual(grouped_rows[0]["bl_surrender_status"], "pending")

    def test_group_dashboard_rows_include_payment_status(self) -> None:
        shipments = [
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                payment_status="paid_by_agency",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                latest_time="14-05-2026",
            ),
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                payment_status="paid_by_agency",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                latest_time="13-05-2026",
            ),
        ]

        grouped_rows = _group_dashboard_rows(shipments)

        self.assertEqual(len(grouped_rows), 1)
        self.assertEqual(grouped_rows[0]["payment_status"], "paid_by_agency")

    def test_dashboard_identifiers_count_shipment_groups_not_containers(self) -> None:
        today_text = datetime.now().strftime("%d-%m-%Y")
        recent_rail_text = (datetime.now() - timedelta(days=2)).strftime("%d-%m-%Y")
        shipments = [
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                birgunj_arrival_date=today_text,
                departure=recent_rail_text,
            ),
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                birgunj_arrival_date=today_text,
                departure=recent_rail_text,
            ),
            Shipment(
                customer_name="Approaching Customer",
                container_number="MSMU3793687",
                bl_number="OTHER/BL/1",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                departure=recent_rail_text,
            ),
            Shipment(
                customer_name="Approaching Customer",
                container_number="MSNU1703477",
                bl_number="OTHER/BL/1",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                departure=recent_rail_text,
            ),
        ]

        identifiers = _dashboard_identifiers(shipments)

        self.assertEqual(identifiers["total_at_icd_birgunj"], 1)
        self.assertEqual(identifiers["today_arrivals"], 1)
        self.assertEqual(identifiers["approaching_birgunj"], 1)
        self.assertEqual(identifiers["railed_out_this_week"], 1)
        self.assertEqual(identifiers["today_arrival_customers"][0]["shipment_count"], 1)
        self.assertEqual(identifiers["approaching_birgunj_customers"][0]["shipment_count"], 1)

    def test_reopen_completed_shipment_cycle_returns_to_active(self) -> None:
        engine = create_engine("sqlite:///:memory:", future=True)
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(engine)

        db = SessionLocal()
        user = User(email="completed@example.com", password_hash="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        completed_shipments = [
            Shipment(
                user_id=user.id,
                customer_name="Cycle Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                shipment_status="completed",
                clearance_doc_number="M-1234",
            ),
            Shipment(
                user_id=user.id,
                customer_name="Cycle Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                shipment_status="completed",
                clearance_doc_number="M-1234",
            ),
        ]
        db.add_all(completed_shipments)
        db.commit()

        reopened, effective_doc = _apply_group_status_transition(
            db,
            user,
            bl_number="FRE/CCU/0126/976",
            container_numbers=["MSBU1891823"],
            next_status="active",
        )
        db.commit()

        self.assertEqual(effective_doc, "M-1234")
        self.assertEqual(
            sorted(shipment.container_number for shipment in reopened),
            ["MSBU1891823", "MSBU1904849"],
        )
        self.assertTrue(all(shipment.shipment_status == "active" for shipment in reopened))

        db.close()
        engine.dispose()

    def test_restore_to_live_recovers_full_archived_bl_cycle(self) -> None:
        engine = create_engine("sqlite:///:memory:", future=True)
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(engine)

        db = SessionLocal()
        user = User(email="restore@example.com", password_hash="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        archived_shipments = [
            Shipment(
                user_id=user.id,
                customer_name="Cycle Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                shipment_status="archived",
                clearance_doc_number="M-1234",
            ),
            Shipment(
                user_id=user.id,
                customer_name="Cycle Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                shipment_status="archived",
                clearance_doc_number="M-1234",
            ),
            Shipment(
                user_id=user.id,
                customer_name="Cycle Customer",
                container_number="MSMU3793687",
                bl_number="FRE/CCU/0126/976",
                shipment_status="archived",
                clearance_doc_number="M-1234",
            ),
        ]
        db.add_all(archived_shipments)
        db.commit()

        restored, effective_doc = _apply_group_status_transition(
            db,
            user,
            bl_number="FRE/CCU/0126/976",
            container_numbers=["MSBU1891823"],
            next_status="active",
        )
        db.commit()

        self.assertEqual(effective_doc, "M-1234")
        self.assertEqual(
            sorted(shipment.container_number for shipment in restored),
            ["MSBU1891823", "MSBU1904849", "MSMU3793687"],
        )
        self.assertTrue(all(shipment.shipment_status == "active" for shipment in restored))

        db.close()
        engine.dispose()

    def test_update_group_bl_surrender_status_updates_full_cycle(self) -> None:
        engine = create_engine("sqlite:///:memory:", future=True)
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(engine)

        db = SessionLocal()
        user = User(email="blstatus@example.com", password_hash="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add_all(
            [
                Shipment(
                    user_id=user.id,
                    customer_name="Cycle Customer",
                    container_number="MSBU1891823",
                    bl_number="FRE/CCU/0126/976",
                    shipment_status="active",
                ),
                Shipment(
                    user_id=user.id,
                    customer_name="Cycle Customer",
                    container_number="MSBU1904849",
                    bl_number="FRE/CCU/0126/976",
                    shipment_status="active",
                ),
            ]
        )
        db.commit()

        original_scope_ready = shipments_module._ensure_user_scope_ready
        try:
            shipments_module._ensure_user_scope_ready = lambda db, current_user: None
            response = update_group_bl_surrender_status(
                ShipmentGroupBlStatusUpdateRequest(
                    bl_number="FRE/CCU/0126/976",
                    container_numbers=["MSBU1891823"],
                    bl_surrender_status="pending",
                ),
                db=db,
                current_user=user,
            )
        finally:
            shipments_module._ensure_user_scope_ready = original_scope_ready

        self.assertTrue(response["updated"])
        self.assertEqual(response["bl_surrender_status"], "pending")
        refreshed = list(db.query(Shipment).all())
        self.assertTrue(all(shipment.bl_surrender_status == "pending" for shipment in refreshed))

        db.close()
        engine.dispose()

    def test_update_group_payment_status_updates_full_cycle(self) -> None:
        engine = create_engine("sqlite:///:memory:", future=True)
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(engine)

        db = SessionLocal()
        user = User(email="paymentstatus@example.com", password_hash="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add_all(
            [
                Shipment(
                    user_id=user.id,
                    customer_name="Cycle Customer",
                    container_number="MSBU1891823",
                    bl_number="FRE/CCU/0126/976",
                    shipment_status="active",
                ),
                Shipment(
                    user_id=user.id,
                    customer_name="Cycle Customer",
                    container_number="MSBU1904849",
                    bl_number="FRE/CCU/0126/976",
                    shipment_status="active",
                ),
            ]
        )
        db.commit()

        original_scope_ready = shipments_module._ensure_user_scope_ready
        try:
            shipments_module._ensure_user_scope_ready = lambda db, current_user: None
            response = update_group_payment_status(
                ShipmentGroupPaymentStatusUpdateRequest(
                    bl_number="FRE/CCU/0126/976",
                    container_numbers=["MSBU1891823"],
                    payment_status="paid by agency",
                ),
                db=db,
                current_user=user,
            )
        finally:
            shipments_module._ensure_user_scope_ready = original_scope_ready

        self.assertTrue(response["updated"])
        self.assertEqual(response["payment_status"], "paid_by_agency")
        refreshed = list(db.query(Shipment).all())
        self.assertTrue(all(shipment.payment_status == "paid_by_agency" for shipment in refreshed))

        db.close()
        engine.dispose()

    def test_bl_normalization_removes_integral_decimal_suffix(self) -> None:
        self.assertEqual(_normalize_bl_number("265295208.0"), "265295208")
        self.assertEqual(_normalize_bl_number(265295208.0), "265295208")
        self.assertEqual(_normalize_bl_number("ONEYSZPG19965507"), "ONEYSZPG19965507")

    def test_pristine_confirmed_birgunj_locks_effective_location(self) -> None:
        shipment = Shipment(
            customer_name="A & A International",
            container_number="NYKU9734848",
            bl_number="ONEYTPEF98416400",
            latest_location="MUZAFFARPUR JN., Sonpur Division",
            movement_category="On Rail",
            tracking_source="ldb+pristine",
            birgunj_arrival_date="26-03-2026",
        )

        self.assertEqual(_effective_shipment_location(shipment), "ICD BIRGANJ, Samastipur")

    def test_pristine_booking_date_marks_birgunj_shipment_for_action(self) -> None:
        shipment = Shipment(
            customer_name="A & A International",
            container_number="NYKU9734848",
            bl_number="ONEYTPEF98416400",
            latest_location="ICD BIRGANJ, Samastipur",
            movement_category="Arrived Birgunj",
            tracking_source="ldb+pristine",
            birgunj_arrival_date="26-03-2026",
            pristine_booking_date="30-03-2026",
        )

        self.assertTrue(_shipment_needs_action(shipment))

    def test_pristine_booking_date_before_birgunj_arrival_does_not_mark_action(self) -> None:
        shipment = Shipment(
            customer_name="A & A International",
            container_number="NYKU9734848",
            bl_number="ONEYTPEF98416400",
            latest_location="ICD BIRGANJ, Samastipur",
            movement_category="Arrived Birgunj",
            tracking_source="ldb+pristine",
            birgunj_arrival_date="30-03-2026",
            pristine_booking_date="26-03-2026",
        )

        self.assertFalse(_shipment_needs_action(shipment))

    def test_pristine_source_alone_does_not_count_as_birgunj_arrival(self) -> None:
        shipment = Shipment(
            customer_name="A & A International",
            container_number="MRKU4837426",
            bl_number="123456789",
            latest_location="MMLP-VISAKHAPATNAM",
            movement_category="At Port",
            tracking_source="ldb+pristine",
            birgunj_arrival_date="",
            pristine_booking_date="09-05-2026",
        )

        self.assertFalse(_shipment_needs_action(shipment))

    def test_obviously_old_pristine_record_is_ignored_without_other_live_signals(self) -> None:
        self.assertTrue(
            _should_ignore_stale_pristine_data(
                {
                    "arrival_date": "07-12-2023",
                    "booking_date": "07-12-2023",
                    "empty_date": "",
                    "rake_departure_date": "",
                },
                {},
                {},
            )
        )

    def test_old_pristine_record_is_ignored_when_ldb_shows_current_port_cycle(self) -> None:
        self.assertTrue(
            _should_ignore_stale_pristine_data(
                {
                    "arrival_date": "07-12-2023",
                    "booking_date": "07-12-2023",
                },
                {
                    "latest_time": "09-05-2026",
                    "port_arrival_date": "08-05-2026",
                    "birgunj_arrival_date": "",
                },
                {},
            )
        )

    def test_obviously_old_ldb_record_is_ignored_without_other_live_signals(self) -> None:
        self.assertTrue(
            _should_ignore_stale_ldb_data(
                {
                    "latest_location": "ICD BIRGANJ, Samastipur",
                    "latest_time": "02-01-2024",
                    "port_arrival_date": "04-12-2023",
                    "birgunj_arrival_date": "04-12-2023",
                },
                {},
                {},
            )
        )

    def test_obviously_old_concor_record_is_ignored_without_other_live_signals(self) -> None:
        self.assertTrue(
            _should_ignore_stale_concor_data(
                {
                    "departure": "02-01-2024",
                    "wagon_loaded_date": "03-01-2024",
                    "concor_location_code": "WGN",
                },
                {},
                {},
            )
        )

    def test_current_pristine_birgunj_arrival_is_not_ignored(self) -> None:
        today_text = datetime.now().strftime("%d-%m-%Y")
        self.assertFalse(
            _should_ignore_stale_pristine_data(
                {
                    "arrival_date": today_text,
                    "booking_date": today_text,
                },
                {},
                {},
            )
        )

    def test_current_pristine_arrival_can_override_live_sources_that_have_not_caught_up(self) -> None:
        today_text = datetime.now().strftime("%d-%m-%Y")
        self.assertTrue(
            _should_use_pristine_arrival_override(
                {
                    "arrival_date": today_text,
                    "booking_date": today_text,
                },
                {
                    "latest_time": today_text,
                    "port_arrival_date": today_text,
                    "birgunj_arrival_date": "",
                },
                {},
            )
        )

    def test_pristine_arrival_does_not_override_newer_live_source_dates(self) -> None:
        pristine_arrival = (datetime.now() - timedelta(days=2)).strftime("%d-%m-%Y")
        fresher_live_date = datetime.now().strftime("%d-%m-%Y")
        self.assertFalse(
            _should_use_pristine_arrival_override(
                {
                    "arrival_date": pristine_arrival,
                    "booking_date": pristine_arrival,
                },
                {
                    "latest_time": fresher_live_date,
                    "port_arrival_date": fresher_live_date,
                    "birgunj_arrival_date": "",
                },
                {},
            )
        )

    def test_build_tracking_payload_drops_stale_pristine_override_and_keeps_hi_seas(self) -> None:
        original_fetch_ldb = shipments_module._fetch_ldb
        original_fetch_concor = shipments_module._fetch_concor
        original_fetch_pristine = shipments_module._fetch_pristine_arrival
        original_cache_get = shipments_module._get_cached_data
        original_cache_save = shipments_module._save_to_cache
        try:
            shipments_module._fetch_ldb = lambda container_number: {}
            shipments_module._fetch_concor = lambda container_number: {}
            shipments_module._fetch_pristine_arrival = lambda container_number: {
                "arrival_date": "07-12-2023",
                "booking_date": "07-12-2023",
                "location": "ICD BIRGANJ, Samastipur",
            }
            shipments_module._get_cached_data = lambda container_number: None
            shipments_module._save_to_cache = lambda container_number, data: None

            payload = _build_tracking_payload("MRKU4837426", use_cache=False)
        finally:
            shipments_module._fetch_ldb = original_fetch_ldb
            shipments_module._fetch_concor = original_fetch_concor
            shipments_module._fetch_pristine_arrival = original_fetch_pristine
            shipments_module._get_cached_data = original_cache_get
            shipments_module._save_to_cache = original_cache_save

        self.assertEqual(payload["data"]["movement_category"], "Hi Seas")
        self.assertEqual(payload["data"]["tracking_source"], "")
        self.assertEqual(payload["data"]["birgunj_arrival_date"], "")
        self.assertEqual(payload["data"]["pristine_booking_date"], "")

    def test_build_tracking_payload_drops_stale_ldb_birgunj_cycle_and_keeps_hi_seas(self) -> None:
        original_fetch_ldb = shipments_module._fetch_ldb
        original_fetch_concor = shipments_module._fetch_concor
        original_fetch_pristine = shipments_module._fetch_pristine_arrival
        original_cache_get = shipments_module._get_cached_data
        original_cache_save = shipments_module._save_to_cache
        try:
            shipments_module._fetch_ldb = lambda container_number: {
                "latest_location": "ICD BIRGANJ, Samastipur",
                "latest_time": "02-01-2024",
                "port_arrival_date": "04-12-2023",
                "birgunj_arrival_date": "04-12-2023",
                "rail_status": "Arrived Birgunj",
            }
            shipments_module._fetch_concor = lambda container_number: {}
            shipments_module._fetch_pristine_arrival = lambda container_number: {
                "arrival_date": "07-12-2023",
                "booking_date": "07-12-2023",
                "location": "ICD BIRGANJ, Samastipur",
            }
            shipments_module._get_cached_data = lambda container_number: None
            shipments_module._save_to_cache = lambda container_number, data: None

            payload = _build_tracking_payload("MRKU4837426", use_cache=False)
        finally:
            shipments_module._fetch_ldb = original_fetch_ldb
            shipments_module._fetch_concor = original_fetch_concor
            shipments_module._fetch_pristine_arrival = original_fetch_pristine
            shipments_module._get_cached_data = original_cache_get
            shipments_module._save_to_cache = original_cache_save

        self.assertEqual(payload["data"]["movement_category"], "Hi Seas")
        self.assertEqual(payload["data"]["latest_location"], "")
        self.assertEqual(payload["data"]["tracking_source"], "")
        self.assertEqual(payload["data"]["birgunj_arrival_date"], "")

    def test_build_tracking_payload_uses_pristine_arrival_when_live_sources_have_not_caught_up(self) -> None:
        today_text = datetime.now().strftime("%d-%m-%Y")
        original_fetch_ldb = shipments_module._fetch_ldb
        original_fetch_concor = shipments_module._fetch_concor
        original_fetch_pristine = shipments_module._fetch_pristine_arrival
        original_cache_get = shipments_module._get_cached_data
        original_cache_save = shipments_module._save_to_cache
        try:
            shipments_module._fetch_ldb = lambda container_number: {
                "latest_location": "MMLP-VISAKHAPATNAM",
                "latest_time": today_text,
                "port_arrival_date": today_text,
                "birgunj_arrival_date": "",
                "rail_status": "At Port",
            }
            shipments_module._fetch_concor = lambda container_number: {}
            shipments_module._fetch_pristine_arrival = lambda container_number: {
                "arrival_date": today_text,
                "booking_date": today_text,
                "location": "ICD BIRGANJ, Samastipur",
            }
            shipments_module._get_cached_data = lambda container_number: None
            shipments_module._save_to_cache = lambda container_number, data: None

            payload = _build_tracking_payload("MRKU4837426", use_cache=False)
        finally:
            shipments_module._fetch_ldb = original_fetch_ldb
            shipments_module._fetch_concor = original_fetch_concor
            shipments_module._fetch_pristine_arrival = original_fetch_pristine
            shipments_module._get_cached_data = original_cache_get
            shipments_module._save_to_cache = original_cache_save

        self.assertEqual(payload["data"]["movement_category"], "Arrived Birgunj")
        self.assertEqual(payload["data"]["latest_location"], "ICD BIRGANJ, Samastipur")
        self.assertEqual(payload["data"]["birgunj_arrival_date"], today_text)
        self.assertEqual(payload["data"]["pristine_booking_date"], today_text)

    def test_pristine_booking_mode_is_normalized_to_known_destuffing_labels(self) -> None:
        self.assertEqual(_normalize_destuffing_label(" factory destuffing "), "Factory Destuffing")
        self.assertEqual(_normalize_destuffing_label("ICD Destuffing"), "ICD Destuffing")
        self.assertEqual(_normalize_destuffing_label("Warehouse Destuffing"), "Warehouse Destuffing")
        self.assertEqual(_normalize_destuffing_label("Unknown Mode"), "")

    def test_build_tracking_payload_keeps_live_source_when_it_is_newer_than_pristine_arrival(self) -> None:
        live_date = datetime.now().strftime("%d-%m-%Y")
        pristine_arrival = (datetime.now() - timedelta(days=2)).strftime("%d-%m-%Y")
        original_fetch_ldb = shipments_module._fetch_ldb
        original_fetch_concor = shipments_module._fetch_concor
        original_fetch_pristine = shipments_module._fetch_pristine_arrival
        original_cache_get = shipments_module._get_cached_data
        original_cache_save = shipments_module._save_to_cache
        try:
            shipments_module._fetch_ldb = lambda container_number: {
                "latest_location": "MMLP-VISAKHAPATNAM",
                "latest_time": live_date,
                "port_arrival_date": live_date,
                "birgunj_arrival_date": "",
                "rail_status": "At Port",
            }
            shipments_module._fetch_concor = lambda container_number: {}
            shipments_module._fetch_pristine_arrival = lambda container_number: {
                "arrival_date": pristine_arrival,
                "booking_date": pristine_arrival,
                "location": "ICD BIRGANJ, Samastipur",
            }
            shipments_module._get_cached_data = lambda container_number: None
            shipments_module._save_to_cache = lambda container_number, data: None

            payload = _build_tracking_payload("MRSU7039715", use_cache=False)
        finally:
            shipments_module._fetch_ldb = original_fetch_ldb
            shipments_module._fetch_concor = original_fetch_concor
            shipments_module._fetch_pristine_arrival = original_fetch_pristine
            shipments_module._get_cached_data = original_cache_get
            shipments_module._save_to_cache = original_cache_save

        self.assertEqual(payload["data"]["movement_category"], "At Port")
        self.assertEqual(payload["data"]["latest_location"], "MMLP-VISAKHAPATNAM")
        self.assertEqual(payload["data"]["birgunj_arrival_date"], "")

    def test_group_dashboard_rows_preserve_action_needed_when_one_container_qualifies(self) -> None:
        shipments = [
            Shipment(
                customer_name="A & A International",
                container_number="NYKU9734848",
                bl_number="ONEYTPEF98416400",
                shipment_status="active",
                latest_location="ICD BIRGANJ, Samastipur",
                movement_category="Arrived Birgunj",
                tracking_source="ldb+pristine",
                birgunj_arrival_date="26-03-2026",
                pristine_booking_date="30-03-2026",
            ),
            Shipment(
                customer_name="A & A International",
                container_number="NYKU9734849",
                bl_number="ONEYTPEF98416400",
                shipment_status="active",
                latest_location="ICD BIRGANJ, Samastipur",
                movement_category="Arrived Birgunj",
                tracking_source="ldb",
                birgunj_arrival_date="26-03-2026",
                pristine_booking_date="",
            ),
        ]

        rows = _group_dashboard_rows(shipments)

        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["action_required"])
        self.assertEqual(rows[0]["action_required_reason"], "Pristine booking date is after Birgunj arrival")

    def test_group_dashboard_rows_mark_destuffing_ready_only_when_all_containers_have_labels(self) -> None:
        shipments = [
            Shipment(
                customer_name="Cycle Customer",
                container_number="FFAU7543044",
                bl_number="BL-DESTUFF-1",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                pristine_booking_mode="Factory Destuffing",
            ),
            Shipment(
                customer_name="Cycle Customer",
                container_number="MSMU2636596",
                bl_number="BL-DESTUFF-1",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                pristine_booking_mode="ICD Destuffing",
            ),
        ]

        rows = _group_dashboard_rows(shipments)

        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["destuffing_ready"])
        self.assertTrue(rows[0]["action_required"])
        self.assertEqual(rows[0]["action_required_summary"], "Destuffing follow-through ready")
        self.assertEqual(
            rows[0]["container_details"],
            [
                {"number": "FFAU7543044", "destuffing_label": "Factory Destuffing"},
                {"number": "MSMU2636596", "destuffing_label": "ICD Destuffing"},
            ],
        )

    def test_group_dashboard_rows_keep_partial_destuffing_at_container_level_without_group_ready(self) -> None:
        shipments = [
            Shipment(
                customer_name="Cycle Customer",
                container_number="FFAU7543044",
                bl_number="BL-DESTUFF-2",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                pristine_booking_mode="Factory Destuffing",
            ),
            Shipment(
                customer_name="Cycle Customer",
                container_number="MSMU2636596",
                bl_number="BL-DESTUFF-2",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                pristine_booking_mode="",
            ),
        ]

        rows = _group_dashboard_rows(shipments)

        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0]["destuffing_ready"])
        self.assertFalse(rows[0]["action_required"])
        self.assertEqual(rows[0]["action_required_summary"], "")
        self.assertEqual(
            rows[0]["container_details"],
            [
                {"number": "FFAU7543044", "destuffing_label": "Factory Destuffing"},
                {"number": "MSMU2636596", "destuffing_label": ""},
            ],
        )

    def test_concor_wgn_signal_marks_shipment_as_on_rail(self) -> None:
        movement = _movement_category(
            "MMLP-VISAKHAPATNAM",
            "",
            "",
            0,
            "WGN",
        )

        self.assertEqual(movement, "On Rail")

    def test_concor_wgn_since_date_becomes_rail_start_date(self) -> None:
        self.assertEqual(
            _movement_since_date("On Rail", "14-04-2026", "19-03-2026", "", "", "13-04-2026"),
            "13-04-2026",
        )

    def test_extract_concor_wagon_signal_parses_wgn_since_date(self) -> None:
        location_code, wagon_loaded_date = _extract_concor_wagon_signal(
            "Arrived at MMLP-VISAKHAPATNAM on 19/03/2026 14:20:00 and currently at location WGN since (13/04/2026 19:31:00)",
            "",
        )

        self.assertEqual(location_code, "WGN")
        self.assertEqual(wagon_loaded_date, "13-04-2026")

    def test_at_port_uses_first_port_entry_not_latest_internal_move(self) -> None:
        last_event = _entry(
            "PORT IN",
            "Vishakapatnam/Visakha Container Terminal",
            "2026-04-08T15:26:20.000+00:00",
        )
        track_log = [
            _entry("PORT IN", "Vishakapatnam/Visakha Container Terminal", "2026-04-08T15:26:20.000+00:00"),
            _entry("TOLL PLAZA CROSSED", "Vishakapatnam/Sheelanagar Toll Plaza, NH5, Visakhapatnam", "2026-04-08T14:22:53.000+00:00"),
            _entry("CFS OUT", "Vishakapatnam/VPL Integral CFS , Vizag", "2026-04-01T12:46:21.000+00:00"),
            _entry("CFS IN", "Vishakapatnam/VPL Integral CFS , Vizag", "2026-04-01T12:09:53.000+00:00"),
            _entry("TOLL PLAZA CROSSED", "Vishakapatnam/Sheelanagar Toll Plaza, NH5, Visakhapatnam", "2026-03-24T05:00:04.000+00:00"),
            _entry("ICD IN", "Vishakapatnam/MMLP VISHAKAPATNAM", "2026-03-24T04:55:40.000+00:00"),
            _entry("PORT OUT", "VPT, Vizag", "2026-03-24T03:54:17.000+00:00"),
            _entry("PORT IN", "Vishakapatnam/Visakha Container Terminal", "2026-03-17T07:00:16.000+00:00"),
        ]

        milestones = _derive_ldb_milestones(last_event, track_log)

        self.assertEqual(milestones["latest_time"], "08-04-2026")
        self.assertEqual(milestones["port_arrival_date"], "17-03-2026")
        self.assertEqual(
            _movement_since_date("At Port", milestones["latest_time"], milestones["port_arrival_date"], "", ""),
            "17-03-2026",
        )

    def test_arrived_birgunj_uses_first_arrival_not_later_movement(self) -> None:
        last_event = _entry(
            "STATION CROSSED",
            "MUZAFFARPUR JN., Sonpur Division",
            "2026-04-08T20:00:00.000+00:00",
        )
        track_log = [
            _entry("PORT IN", "VPT, Vizag", "2026-03-01T10:47:40.000+00:00"),
            _entry("PORT OUT", "VPT, Vizag", "2026-03-05T14:38:13.000+00:00"),
            _entry("ICD IN", "Vishakapatnam/MMLP VISHAKAPATNAM", "2026-03-05T16:26:37.000+00:00"),
            _entry("ICD OUT", "Vishakapatnam/MMLP VISHAKAPATNAM", "2026-03-29T12:04:31.000+00:00"),
            _entry("STATION CROSSED", "ICD BIRGANJ, Samastipur", "2026-04-07T02:10:00.000+00:00"),
            _entry("STATION CROSSED", "RAXAUL JN., Samastipur", "2026-04-07T02:30:00.000+00:00"),
            _entry("STATION CROSSED", "MUZAFFARPUR JN., Sonpur Division", "2026-04-08T20:00:00.000+00:00"),
        ]

        milestones = _derive_ldb_milestones(last_event, track_log)

        self.assertEqual(milestones["birgunj_arrival_date"], "07-04-2026")
        self.assertEqual(
            _movement_since_date("Arrived Birgunj", milestones["latest_time"], milestones["port_arrival_date"], milestones["birgunj_arrival_date"], "29-03-2026"),
            "07-04-2026",
        )

    def test_new_cycle_after_old_birgunj_resets_port_arrival(self) -> None:
        last_event = _entry(
            "PORT IN",
            "Kolkata/Syama Prasad Mookerjee Port",
            "2026-05-14T09:30:00.000+00:00",
        )
        track_log = [
            _entry("PORT IN", "VPT, Vizag", "2026-01-02T09:00:00.000+00:00"),
            _entry("STATION CROSSED", "ICD BIRGANJ, Samastipur", "2026-01-20T11:00:00.000+00:00"),
            _entry("PORT IN", "Kolkata/Syama Prasad Mookerjee Port", "2026-05-14T09:30:00.000+00:00"),
            _entry("PORT OUT", "Kolkata/Syama Prasad Mookerjee Port", "2026-05-17T08:00:00.000+00:00"),
        ]

        milestones = _derive_ldb_milestones(last_event, track_log)

        self.assertEqual(milestones["port_arrival_date"], "14-05-2026")
        self.assertEqual(milestones["birgunj_arrival_date"], "")

    def test_milestone_logic_is_stable_under_repeat_runs(self) -> None:
        last_event = _entry(
            "PORT IN",
            "Vishakapatnam/Visakha Container Terminal",
            "2026-04-08T15:26:20.000+00:00",
        )
        track_log = [
            _entry("PORT IN", "Vishakapatnam/Visakha Container Terminal", "2026-04-08T15:26:20.000+00:00"),
            _entry("ICD IN", "Vishakapatnam/MMLP VISHAKAPATNAM", "2026-03-24T04:55:40.000+00:00"),
            _entry("PORT IN", "Vishakapatnam/Visakha Container Terminal", "2026-03-17T07:00:16.000+00:00"),
        ]

        for _ in range(150):
            milestones = _derive_ldb_milestones(last_event, track_log)
            self.assertEqual(milestones["port_arrival_date"], "17-03-2026")
            self.assertEqual(
                _movement_since_date("At Port", milestones["latest_time"], milestones["port_arrival_date"], milestones["birgunj_arrival_date"], ""),
                "17-03-2026",
            )

    def test_import_row_splits_multiple_containers_from_one_cell(self) -> None:
        row_obj = {
            "PARTY NAME": "Shubha Shiddhi Traders PVT. LTD.",
            "BL NO": "FRE/CCU/0126/976",
            "CONTAINER NO": "MSBU1891823\nMSBU1904849\nMSMU3793687\nMSNU1703477",
        }

        valid, invalid, raw_value = _containers_from_import_row(row_obj, "CONTAINER NO")

        self.assertEqual(
            valid,
            ["MSBU1891823", "MSBU1904849", "MSMU3793687", "MSNU1703477"],
        )
        self.assertEqual(invalid, [])
        self.assertIn("MSBU1891823", raw_value)

    def test_import_summary_counts_multiline_container_cell_as_multiple_shipments(self) -> None:
        normalized_rows = [
            {
                "__source_row_number": 2,
                "PARTY NAME": "Shubha Shiddhi Traders PVT. LTD.",
                "BL NO": "FRE/CCU/0126/976",
                "CONTAINER NO": "MSBU1891823\nMSBU1904849\nMSMU3793687",
            }
        ]

        review = _summarize_import_rows(normalized_rows, "PARTY NAME", "CONTAINER NO", "BL NO")

        self.assertEqual(review["invalid_count"], 0)
        self.assertEqual(review["valid_count"], 3)
        self.assertEqual(review["skipped_blank_count"], 0)

    def test_dashboard_identifiers_count_rail_start_from_wagon_loaded_date(self) -> None:
        now = datetime.now()
        within_week = (now - timedelta(days=2)).strftime("%d-%m-%Y")
        older = (now - timedelta(days=20)).strftime("%d-%m-%Y")

        shipment_one = Shipment(
            customer_name="Rail One",
            container_number="MSBU1891823",
            bl_number="BL-RAIL-1",
            shipment_status="active",
            movement_category="On Rail",
            latest_location="MUZAFFARPUR JN., Sonpur Division",
            latest_time=within_week,
            wagon_loaded_date=within_week,
            departure="",
        )
        shipment_two = Shipment(
            customer_name="Rail One",
            container_number="MSBU1904849",
            bl_number="BL-RAIL-1",
            shipment_status="active",
            movement_category="On Rail",
            latest_location="MUZAFFARPUR JN., Sonpur Division",
            latest_time=within_week,
            wagon_loaded_date=within_week,
            departure="",
        )
        shipment_three = Shipment(
            customer_name="Rail Two",
            container_number="MSMU3793687",
            bl_number="BL-RAIL-2",
            shipment_status="active",
            movement_category="On Rail",
            latest_location="SAMASTIPUR",
            latest_time=older,
            wagon_loaded_date=older,
            departure="",
        )

        identifiers = _dashboard_identifiers([shipment_one, shipment_two, shipment_three])

        self.assertEqual(identifiers["railed_out_this_week"], 1)
        self.assertEqual(
            identifiers["railed_out_this_week_customers"],
            [{"customer_name": "Rail One", "shipment_count": 1, "container_count": 1}],
        )

    def test_refresh_all_only_targets_live_shipments(self) -> None:
        engine = create_engine("sqlite:///:memory:", future=True)
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(engine)

        db = SessionLocal()
        user = User(email="refresh@example.com", password_hash="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add_all(
            [
                Shipment(user_id=user.id, customer_name="Live One", container_number="MSBU1891823", bl_number="BL-1", shipment_status="active"),
                Shipment(user_id=user.id, customer_name="Done One", container_number="MSBU1904849", bl_number="BL-2", shipment_status="completed"),
                Shipment(user_id=user.id, customer_name="Archive One", container_number="MSMU3793687", bl_number="BL-3", shipment_status="archived"),
            ]
        )
        db.commit()

        built_for: list[str] = []
        original_builder = shipments_module._build_tracking_payload
        original_apply = shipments_module._apply_tracking_payload
        original_log = shipments_module._log_audit_event
        original_scope_ready = shipments_module._ensure_user_scope_ready
        try:
            shipments_module._ensure_user_scope_ready = lambda db, current_user: None
            shipments_module._build_tracking_payload = lambda container_number, use_cache=False: built_for.append(container_number) or {
                "data": {},
                "status": "success",
                "error": "",
                "cached": False,
                "has_data": False,
            }
            shipments_module._apply_tracking_payload = lambda shipment, payload: None
            shipments_module._log_audit_event = lambda *args, **kwargs: None

            result = shipments_module.refresh_all(db, user)
        finally:
            shipments_module._ensure_user_scope_ready = original_scope_ready
            shipments_module._build_tracking_payload = original_builder
            shipments_module._apply_tracking_payload = original_apply
            shipments_module._log_audit_event = original_log

        self.assertEqual(result["refreshed_count"], 1)
        self.assertEqual(built_for, ["MSBU1891823"])

        db.close()
        engine.dispose()

    def test_background_refresh_job_skips_completed_and_archived_shipments(self) -> None:
        with NamedTemporaryFile(suffix=".db", delete=False) as handle:
            db_path = handle.name
        db_url = f"sqlite:///{db_path}"

        engine = create_engine(db_url, future=True, connect_args={"check_same_thread": False})
        SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(engine)

        db = SessionLocal()
        user = User(email="background-refresh@example.com", password_hash="x")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add_all(
            [
                Shipment(user_id=user.id, customer_name="Live One", container_number="MSBU1891823", bl_number="BL-1", shipment_status="active"),
                Shipment(user_id=user.id, customer_name="Live Two", container_number="MSBU1904849", bl_number="BL-2", shipment_status="active"),
                Shipment(user_id=user.id, customer_name="Done One", container_number="MSMU3793687", bl_number="BL-3", shipment_status="completed"),
                Shipment(user_id=user.id, customer_name="Archive One", container_number="MSNU1703477", bl_number="BL-4", shipment_status="archived"),
            ]
        )
        db.commit()
        user_id = user.id
        db.close()

        built_for: list[str] = []
        original_builder = shipments_module._build_tracking_payload
        original_apply = shipments_module._apply_tracking_payload
        original_log = shipments_module._log_audit_event
        try:
            shipments_module._build_tracking_payload = lambda container_number, use_cache=False: built_for.append(container_number) or {
                "data": {},
                "status": "success",
                "error": "",
                "cached": False,
                "has_data": False,
            }
            shipments_module._apply_tracking_payload = lambda shipment, payload: None
            shipments_module._log_audit_event = lambda *args, **kwargs: None

            _run_refresh_all_job("bg-refresh-test", db_url, user_id)
        finally:
            shipments_module._build_tracking_payload = original_builder
            shipments_module._apply_tracking_payload = original_apply
            shipments_module._log_audit_event = original_log
            engine.dispose()
            try:
                os.unlink(db_path)
            except OSError:
                pass

        job = _get_refresh_job("bg-refresh-test")
        self.assertIsNotNone(job)
        self.assertEqual(job["refreshed_count"], 2)
        self.assertEqual(sorted(built_for), ["MSBU1891823", "MSBU1904849"])


if __name__ == "__main__":
    unittest.main()
