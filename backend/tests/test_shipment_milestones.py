from __future__ import annotations

import unittest

from app.api.routes.shipments import (
    _containers_from_import_row,
    _derive_ldb_milestones,
    _effective_shipment_location,
    _movement_since_date,
    _normalize_bl_number,
    _summarize_import_rows,
    _shipment_needs_action,
)
from app.models.shipment import Shipment


def _entry(event_name: str, location: str, timestamp: str) -> dict[str, str]:
    return {
        "eventName": event_name,
        "currentLocation": location,
        "timestampTimezone": timestamp,
    }


class ShipmentMilestoneTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
