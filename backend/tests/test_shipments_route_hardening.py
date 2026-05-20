from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.api.routes.shipments as shipments_module
from app.deps import get_current_admin


class ShipmentsRouteHardeningTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
