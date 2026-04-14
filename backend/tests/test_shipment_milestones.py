from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta
from tempfile import NamedTemporaryFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.api.routes.shipments as shipments_module
from app.api.routes.shipments import (
    _get_refresh_job,
    _run_refresh_all_job,
    _apply_group_status_transition,
    _containers_from_import_row,
    _dashboard_identifiers,
    _derive_ldb_milestones,
    _extract_concor_wagon_signal,
    _effective_shipment_location,
    _movement_category,
    _movement_since_date,
    _normalize_bl_number,
    _summarize_import_rows,
    _shipment_needs_action,
)
import app.models  # noqa: F401
from app.core.database import Base
from app.models.shipment import Shipment
from app.models.user import User


def _entry(event_name: str, location: str, timestamp: str) -> dict[str, str]:
    return {
        "eventName": event_name,
        "currentLocation": location,
        "timestampTimezone": timestamp,
    }


class ShipmentMilestoneTests(unittest.TestCase):
    def test_dashboard_identifiers_count_shipment_groups_not_containers(self) -> None:
        shipments = [
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                birgunj_arrival_date="14-04-2026",
                departure="12-04-2026",
            ),
            Shipment(
                customer_name="Grouped Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="Arrived Birgunj",
                latest_location="ICD BIRGANJ, Samastipur",
                birgunj_arrival_date="14-04-2026",
                departure="12-04-2026",
            ),
            Shipment(
                customer_name="Approaching Customer",
                container_number="MSMU3793687",
                bl_number="OTHER/BL/1",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                departure="13-04-2026",
            ),
            Shipment(
                customer_name="Approaching Customer",
                container_number="MSNU1703477",
                bl_number="OTHER/BL/1",
                shipment_status="active",
                movement_category="On Rail",
                latest_location="RAXAUL JN., Samastipur",
                departure="13-04-2026",
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
