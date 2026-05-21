from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routes.auth import _group_owner_shipments
from app.models.shipment import Shipment


class AuthRouteHardeningTests(unittest.TestCase):
    def test_group_owner_shipments_uses_true_earliest_movement_since_date(self) -> None:
        shipments = [
            Shipment(
                id=1,
                user_id=1,
                customer_name="Grouped Customer",
                container_number="MSBU1891823",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="On Rail",
                latest_time="03-02-2026",
                departure="03-02-2026",
            ),
            Shipment(
                id=2,
                user_id=1,
                customer_name="Grouped Customer",
                container_number="MSBU1904849",
                bl_number="FRE/CCU/0126/976",
                shipment_status="active",
                movement_category="On Rail",
                latest_time="28-01-2026",
                departure="28-01-2026",
            ),
        ]

        grouped = _group_owner_shipments(shipments)

        self.assertEqual(len(grouped), 1)
        self.assertEqual(grouped[0]["movement_since_date"], "28-01-2026")


if __name__ == "__main__":
    unittest.main()
