import requests


def fetch_concor(container_no: str) -> dict:
    container_no = str(container_no or "").strip()
    if not container_no:
        return {"concor_error": "Missing container number"}

    try:
        res = requests.post(
            "https://www.concorindia.co.in/api/multipalContainer",
            json={"containerNo": [container_no]},
            timeout=20,
        )
        res.raise_for_status()
        data = res.json()

        track = (
            data.get("data", {})
            .get(container_no, {})
            .get("containerTrack", {})
        )

        return {
            "train_no": track.get("TRAIN_NUMBER", ""),
            "origin": track.get("TRAIN_ORIGNATING_STATION", ""),
            "destination": track.get("TRAIN_DESTINATION_STATION", ""),
            "departure": track.get("DEPARTURE_DATE_&_TIME", ""),
        }

    except Exception as e:
        return {"concor_error": str(e)}