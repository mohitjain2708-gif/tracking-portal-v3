from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.services.ldb_client as ldb_client


class LdbClientTests(unittest.TestCase):
    def test_fetch_ldb_returns_clean_tracking_payload(self) -> None:
        original_session = ldb_client._session

        class FakeResponse:
            text = '{"object": {"lastEvent": {"currentLocation": " VISAKHAPATNAM ", "timestampTimezone": "2026-05-18T22:00:00"}}}'

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "object": {
                        "lastEvent": {
                            "currentLocation": " VISAKHAPATNAM ",
                            "timestampTimezone": "2026-05-18T22:00:00",
                        }
                    }
                }

        class FakeSession:
            def get(self, *args, **kwargs):
                return FakeResponse()

        try:
            ldb_client._session = FakeSession()
            payload = ldb_client.fetch_ldb("MRKU5778966")
            self.assertEqual(
                payload,
                {
                    "latest_location": "VISAKHAPATNAM",
                    "latest_time": "18-05-2026",
                },
            )
        finally:
            ldb_client._session = original_session

    def test_fetch_ldb_reports_invalid_json_cleanly(self) -> None:
        original_session = ldb_client._session

        class FakeResponse:
            text = "not-json"

            def raise_for_status(self):
                return None

            def json(self):
                raise ValueError("bad json")

        class FakeSession:
            def get(self, *args, **kwargs):
                return FakeResponse()

        try:
            ldb_client._session = FakeSession()
            payload = ldb_client.fetch_ldb("MRKU5778966")
            self.assertEqual(payload, {"ldb_error": "Invalid JSON response from LDB"})
        finally:
            ldb_client._session = original_session


if __name__ == "__main__":
    unittest.main()
