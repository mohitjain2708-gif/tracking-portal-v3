import requests
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LDB_API_URL = "https://www.ldb.co.in/api/ldb/container/search"

_session = requests.Session()
_retries = Retry(
    total=2,
    backoff_factor=0.4,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
)
_adapter = HTTPAdapter(pool_connections=50, pool_maxsize=50, max_retries=_retries)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


def _fmt_iso(ts: str) -> str:
    if not ts:
        return ""
    try:
        core = ts[:19].replace("T", " ")
        dt = datetime.strptime(core, "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%d-%m-%Y")
    except Exception:
        return ts


def _parse_ldb_payload(data: dict) -> dict:
    obj = data.get("object", {}) or {}
    last_event = obj.get("lastEvent", {}) or {}

    return {
        "latest_location": last_event.get("currentLocation", "") or "",
        "latest_time": _fmt_iso(last_event.get("timestampTimezone", "") or ""),
    }


def _make_headers(container_no: str) -> dict:
    return {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": f"https://www.ldb.co.in/ldb/containersearch/39/{container_no}",
    }


def fetch_ldb(container_no: str) -> dict:
    container_no = str(container_no or "").strip()
    if not container_no:
        return {"ldb_error": "Missing container number"}

    headers = _make_headers(container_no)

    param_options = [
        {"cntrNo": container_no, "searchType": "39"},
        {"cntrNo": container_no},
    ]

    last_error = None

    for params in param_options:
        try:
            resp = _session.get(
                LDB_API_URL,
                params=params,
                headers=headers,
                timeout=(5, 12),
            )
            resp.raise_for_status()

            if not resp.text.strip():
                last_error = "Empty response from LDB"
                continue

            data = resp.json()
            parsed = _parse_ldb_payload(data)

            if parsed.get("latest_location") or parsed.get("latest_time"):
                return parsed

            return {
                "latest_location": parsed.get("latest_location", ""),
                "latest_time": parsed.get("latest_time", ""),
            }

        except Exception as e:
            last_error = str(e)

    return {"ldb_error": last_error or "LDB lookup failed"}