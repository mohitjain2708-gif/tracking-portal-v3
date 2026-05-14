from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace

from app.services.shipment_state import resolve_shipment_state


class ShipmentStateEngineTests(unittest.TestCase):
    def test_same_cycle_pristine_birgunj_and_booking_drive_arrived_and_action_needed(self) -> None:
        shipment = SimpleNamespace(
            customer_name="ABC",
            container_number="MRKU5509972",
            bl_number="BL123",
            shipment_status="active",
            created_at=None,
            updated_at=None,
            movement_category="Hi Seas",
            latest_location="",
            latest_time="",
            birgunj_arrival_date="",
            tracking_source="",
        )

        resolved = resolve_shipment_state(
            shipment,
            {
                "latest_location": "MMLP-VISAKHAPATNAM",
                "latest_time": "22-02-2026",
                "port_arrival_date": "22-02-2026",
                "birgunj_arrival_date": "",
                "rail_status": "At Port",
            },
            {},
            {
                "arrival_date": "30-03-2026",
                "booking_date": "31-03-2026",
                "location": "ICD BIRGANJ, Samastipur",
            },
            now=datetime(2026, 5, 13),
        )

        self.assertEqual(resolved.movement_category, "Arrived Birgunj")
        self.assertEqual(resolved.birgunj_arrival_date, "30-03-2026")
        self.assertEqual(resolved.pristine_booking_date, "31-03-2026")
        self.assertTrue(resolved.action_required)
        self.assertEqual(resolved.action_required_reason, "Pristine booking date is after Birgunj arrival")

    def test_fresh_pristine_arrival_overtakes_lagging_live_inland_signal(self) -> None:
        shipment = SimpleNamespace(
            customer_name="XYZ",
            container_number="MRSU7039715",
            bl_number="BL456",
            shipment_status="active",
            created_at=None,
            updated_at=None,
            movement_category="Hi Seas",
            latest_location="",
            latest_time="",
            birgunj_arrival_date="",
            tracking_source="",
        )

        resolved = resolve_shipment_state(
            shipment,
            {
                "latest_location": "RAXAUL JN., Samastipur",
                "latest_time": "12-05-2026",
                "port_arrival_date": "08-05-2026",
                "birgunj_arrival_date": "",
                "rail_status": "On Rail",
            },
            {},
            {
                "arrival_date": "13-05-2026",
                "booking_date": "",
                "location": "ICD BIRGANJ, Samastipur",
            },
            now=datetime(2026, 5, 13),
        )

        self.assertEqual(resolved.movement_category, "Arrived Birgunj")
        self.assertEqual(resolved.latest_location, "ICD BIRGANJ, Samastipur")
        self.assertEqual(resolved.birgunj_arrival_date, "13-05-2026")

    def test_obviously_old_pristine_cycle_is_rejected(self) -> None:
        shipment = SimpleNamespace(
            customer_name="ABC",
            container_number="MRKU4837426",
            bl_number="BL789",
            shipment_status="active",
            created_at=None,
            updated_at=None,
            movement_category="Hi Seas",
            latest_location="",
            latest_time="",
            birgunj_arrival_date="",
            tracking_source="",
        )

        resolved = resolve_shipment_state(
            shipment,
            {},
            {},
            {
                "arrival_date": "07-12-2023",
                "booking_date": "07-12-2023",
                "location": "ICD BIRGANJ, Samastipur",
            },
            now=datetime(2026, 5, 13),
        )

        self.assertEqual(resolved.movement_category, "Hi Seas")
        self.assertFalse(resolved.action_required)
        self.assertEqual(resolved.birgunj_arrival_date, "")
        self.assertEqual(resolved.pristine_booking_date, "")

    def test_completed_shipment_cycle_stays_frozen_even_if_live_feed_moves_again(self) -> None:
        shipment = SimpleNamespace(
            customer_name="Closed Customer",
            container_number="MSCU0000001",
            bl_number="BL999",
            shipment_status="completed",
            movement_category="Arrived Birgunj",
            latest_location="ICD BIRGANJ, Samastipur",
            latest_time="30-03-2026",
            birgunj_arrival_date="30-03-2026",
            tracking_source="ldb+pristine",
            created_at=None,
            updated_at=datetime(2026, 4, 1),
        )

        resolved = resolve_shipment_state(
            shipment,
            {
                "latest_location": "MMLP-VISAKHAPATNAM",
                "latest_time": "15-04-2026",
                "port_arrival_date": "15-04-2026",
                "birgunj_arrival_date": "",
                "rail_status": "At Port",
            },
            {},
            {},
            now=datetime(2026, 5, 13),
        )

        self.assertTrue(resolved.completion_frozen)
        self.assertEqual(resolved.movement_category, "Arrived Birgunj")
        self.assertEqual(resolved.latest_location, "ICD BIRGANJ, Samastipur")
        self.assertEqual(resolved.birgunj_arrival_date, "30-03-2026")

    def test_concor_on_rail_can_fallback_to_ldb_station_for_display_location(self) -> None:
        shipment = SimpleNamespace(
            customer_name="Rail Customer",
            container_number="MRKU5778966",
            bl_number="BL5778966",
            shipment_status="active",
            created_at=None,
            updated_at=None,
            movement_category="Hi Seas",
            latest_location="",
            latest_time="",
            birgunj_arrival_date="",
            tracking_source="",
        )

        resolved = resolve_shipment_state(
            shipment,
            {
                "latest_location": "VISAKHAPATNAM STATION",
                "latest_time": "13-05-2026",
                "port_arrival_date": "10-05-2026",
                "birgunj_arrival_date": "",
                "rail_status": "At Port",
            },
            {
                "train_no": "R120H",
                "departure": "13-05-2026",
                "last_reported_station": "",
                "last_reported_date": "",
                "concor_location_code": "WGN",
                "wagon_loaded_date": "",
            },
            {},
            now=datetime(2026, 5, 14),
        )

        self.assertEqual(resolved.movement_category, "On Rail")
        self.assertEqual(resolved.train_no, "R120H")
        self.assertEqual(resolved.latest_location, "VISAKHAPATNAM STATION")

    def test_concor_real_station_text_is_preferred_over_placeholder_codes(self) -> None:
        shipment = SimpleNamespace(
            customer_name="Rail Customer",
            container_number="MRKU5778967",
            bl_number="BL5778967",
            shipment_status="active",
            created_at=None,
            updated_at=None,
            movement_category="Hi Seas",
            latest_location="",
            latest_time="",
            birgunj_arrival_date="",
            tracking_source="",
        )

        resolved = resolve_shipment_state(
            shipment,
            {
                "latest_location": "VISAKHAPATNAM STATION",
                "latest_time": "13-05-2026",
                "port_arrival_date": "10-05-2026",
                "birgunj_arrival_date": "",
                "rail_status": "At Port",
            },
            {
                "train_no": "R120H",
                "departure": "13-05-2026",
                "last_reported_station": "WALTair JN.",
                "last_reported_date": "13-05-2026",
                "concor_location_code": "WGN",
                "wagon_loaded_date": "",
            },
            {},
            now=datetime(2026, 5, 14),
        )

        self.assertEqual(resolved.movement_category, "On Rail")
        self.assertEqual(resolved.latest_location, "WALTair JN.")


if __name__ == "__main__":
    unittest.main()
