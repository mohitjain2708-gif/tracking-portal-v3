from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.concor_client as concor_client


class ConcorClientTests(unittest.TestCase):
    def test_fetch_concor_returns_clean_tracking_payload(self) -> None:
        original_session = concor_client._session

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "data": {
                        "MRKU5778966": {
                            "containerTrack": {
                                "TRAIN_NUMBER": " R120H ",
                                "TRAIN_ORIGNATING_STATION": " VISAKHAPATNAM ",
                                "TRAIN_DESTINATION_STATION": " BIRGUNJ ",
                                "DEPARTURE_DATE_&_TIME": "18-05-2026",
                            }
                        }
                    }
                }

        class FakeSession:
            def post(self, *args, **kwargs):
                return FakeResponse()

        try:
            concor_client._session = FakeSession()
            payload = concor_client.fetch_concor("MRKU5778966")
            self.assertEqual(
                payload,
                {
                    "train_no": "R120H",
                    "origin": "VISAKHAPATNAM",
                    "destination": "BIRGUNJ",
                    "departure": "18-05-2026",
                },
            )
        finally:
            concor_client._session = original_session

    def test_fetch_concor_reports_invalid_json_cleanly(self) -> None:
        original_session = concor_client._session

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                raise ValueError("bad json")

        class FakeSession:
            def post(self, *args, **kwargs):
                return FakeResponse()

        try:
            concor_client._session = FakeSession()
            payload = concor_client.fetch_concor("MRKU5778966")
            self.assertEqual(payload, {"concor_error": "Invalid JSON response from CONCOR"})
        finally:
            concor_client._session = original_session


if __name__ == "__main__":
    unittest.main()
