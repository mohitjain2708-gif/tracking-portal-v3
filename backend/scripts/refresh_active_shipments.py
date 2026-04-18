from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.api.routes.shipments import (  # noqa: E402
    _run_background_refresh_cycle,
    _try_acquire_background_refresh_lease,
    _update_background_refresh_lease,
)


def main() -> None:
    if not _try_acquire_background_refresh_lease():
        print("Another refresh worker still holds the lease. Skipping this run.")
        return
    print("Starting scheduled active-shipment refresh.")
    try:
        _run_background_refresh_cycle()
    except Exception as exc:
        _update_background_refresh_lease(state="error", message=str(exc) or "Scheduled refresh failed")
        raise
    print("Scheduled active-shipment refresh completed.")


if __name__ == "__main__":
    main()
