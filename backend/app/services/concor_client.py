from __future__ import annotations

from requests import Session
from requests.adapters import HTTPAdapter
from requests.exceptions import RequestException
from urllib3.util.retry import Retry

CONCOR_API_URL = "https://www.concorindia.co.in/api/multipalContainer"

_session = Session()
_retries = Retry(
    total=2,
    backoff_factor=0.4,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["POST"],
)
_adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=_retries)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


def _make_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
        "Origin": "https://www.concorindia.co.in",
        "Referer": "https://www.concorindia.co.in/track-n-trace?lang=en",
    }


def fetch_concor(container_no: str) -> dict:
    container_no = str(container_no or "").strip()
    if not container_no:
        return {"concor_error": "Missing container number"}

    try:
        response = _session.post(
            CONCOR_API_URL,
            json={"containerNo": [container_no]},
            headers=_make_headers(),
            timeout=(5, 20),
        )
        response.raise_for_status()
    except RequestException as exc:
        return {"concor_error": str(exc)}

    try:
        data = response.json()
    except ValueError:
        return {"concor_error": "Invalid JSON response from CONCOR"}

    if not isinstance(data, dict):
        return {"concor_error": "Unexpected response from CONCOR"}

    track = (
        data.get("data", {})
        .get(container_no, {})
        .get("containerTrack", {})
    )
    if not isinstance(track, dict):
        track = {}

    return {
        "train_no": str(track.get("TRAIN_NUMBER", "") or "").strip(),
        "origin": str(track.get("TRAIN_ORIGNATING_STATION", "") or "").strip(),
        "destination": str(track.get("TRAIN_DESTINATION_STATION", "") or "").strip(),
        "departure": str(track.get("DEPARTURE_DATE_&_TIME", "") or "").strip(),
    }
