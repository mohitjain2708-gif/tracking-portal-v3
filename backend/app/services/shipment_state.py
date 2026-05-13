from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal

MovementState = Literal["Hi Seas", "At Port", "On Rail", "Arrived Birgunj"]
MilestoneType = Literal["port_arrival", "inland_movement", "birgunj_arrival", "booking", "completion"]

STALE_SOURCE_DAYS = 180
MAX_SAME_CYCLE_PORT_TO_BIRGUNJ_DAYS = 120
MAX_SAME_CYCLE_BACKWARD_DRIFT_DAYS = 7
MAX_SAME_CYCLE_FORWARD_DRIFT_DAYS = 150

PORT_PATTERNS = (
    "VISHAKAPATNAM",
    "VISAKHAPATNAM",
    "VIZAG",
    "KOLKATA",
    "HALDIA",
    "PORT",
    "CFS",
    "MMLP",
    "SYAMA PRASAD",
)

SOURCE_CONFIDENCE: dict[tuple[MilestoneType, str], int] = {
    ("port_arrival", "ldb"): 100,
    ("port_arrival", "concor"): 70,
    ("inland_movement", "ldb"): 95,
    ("inland_movement", "concor"): 92,
    ("birgunj_arrival", "ldb"): 100,
    ("birgunj_arrival", "concor"): 98,
    ("birgunj_arrival", "pristine"): 90,
    ("booking", "pristine"): 100,
    ("completion", "manual"): 100,
}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_existing_movement(value: str) -> str:
    movement = _clean_text(value)
    if not movement or movement == "High Seas":
        return "Hi Seas"
    if movement in {"Arrived", "Arrived Birgunj"}:
        return "Arrived Birgunj"
    if movement in {"Moving", "In Transit", "On Rail"}:
        return "On Rail"
    if movement in {"At Origin", "Delayed", "At Port"}:
        return "At Port"
    return movement


def _is_arrived(location: str) -> bool:
    location_text = _clean_text(location).upper()
    return "BIRGUNJ" in location_text or "BIRGANJ" in location_text


def _is_port(location: str) -> bool:
    location_text = _clean_text(location).upper()
    return bool(location_text) and any(pattern in location_text for pattern in PORT_PATTERNS)


def _parse_date(value: Any) -> datetime | None:
    text_value = _clean_text(value)
    if not text_value:
        return None
    if " " in text_value:
        text_value = text_value.split(" ")[0]
    if "T" in text_value:
        text_value = text_value.split("T")[0]
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(text_value, fmt)
        except ValueError:
            continue
    return None


def _normalize_date_text(value: Any) -> str:
    text_value = _clean_text(value)
    parsed = _parse_date(text_value)
    if parsed is None:
        return text_value
    return parsed.strftime("%d-%m-%Y")


def is_stale_by_age(candidate: datetime | None, now: datetime) -> bool:
    if candidate is None:
        return False
    return (now.date() - candidate.date()).days >= STALE_SOURCE_DAYS


def _first_non_empty(*values: Any) -> str:
    for value in values:
        text_value = _clean_text(value)
        if text_value:
            return text_value
    return ""


@dataclass
class MilestoneCandidate:
    milestone: MilestoneType
    source: str
    date_text: str = ""
    date: datetime | None = None
    location: str = ""
    value: str = ""
    confidence: int = 0
    stale_by_age: bool = False
    same_cycle: bool = True
    reject_reason: str = ""


@dataclass(frozen=True)
class ShipmentCycleContext:
    container_number: str
    bl_number: str
    shipment_status: str
    shipment_created_at: datetime | None
    shipment_updated_at: datetime | None
    shipment_completed: bool
    shipment_archived: bool
    stored_movement: str
    stored_latest_location: str
    stored_latest_time: str
    stored_birgunj_arrival_date: str
    stored_tracking_source: str


@dataclass
class ResolvedShipmentState:
    movement_category: MovementState
    latest_location: str
    latest_time: str
    port_arrival_date: str
    birgunj_arrival_date: str
    pristine_booking_date: str
    departure: str
    train_no: str
    wagon_loaded_date: str
    concor_location_code: str
    rail_status: str
    tracking_source: str
    action_required: bool
    action_required_reason: str
    completion_frozen: bool
    decision_trace: dict[str, Any] = field(default_factory=dict)


def build_shipment_cycle_context(shipment: Any | None) -> ShipmentCycleContext:
    if shipment is None:
        return ShipmentCycleContext(
            container_number="",
            bl_number="",
            shipment_status="active",
            shipment_created_at=None,
            shipment_updated_at=None,
            shipment_completed=False,
            shipment_archived=False,
            stored_movement="Hi Seas",
            stored_latest_location="",
            stored_latest_time="",
            stored_birgunj_arrival_date="",
            stored_tracking_source="",
        )
    shipment_status = _clean_text(getattr(shipment, "shipment_status", "")).lower() or "active"
    return ShipmentCycleContext(
        container_number=_clean_text(getattr(shipment, "container_number", "")),
        bl_number=_clean_text(getattr(shipment, "bl_number", "")),
        shipment_status=shipment_status,
        shipment_created_at=getattr(shipment, "created_at", None),
        shipment_updated_at=getattr(shipment, "updated_at", None),
        shipment_completed=shipment_status == "completed",
        shipment_archived=shipment_status == "archived",
        stored_movement=_normalize_existing_movement(_clean_text(getattr(shipment, "movement_category", ""))),
        stored_latest_location=_clean_text(getattr(shipment, "latest_location", "")),
        stored_latest_time=_clean_text(getattr(shipment, "latest_time", "")),
        stored_birgunj_arrival_date=_clean_text(getattr(shipment, "birgunj_arrival_date", "")),
        stored_tracking_source=_clean_text(getattr(shipment, "tracking_source", "")),
    )


def extract_ldb_candidates(ldb_data: dict[str, Any] | None) -> list[MilestoneCandidate]:
    payload = ldb_data or {}
    latest_location = _clean_text(payload.get("latest_location", ""))
    latest_time = _normalize_date_text(payload.get("latest_time", ""))
    port_arrival = _normalize_date_text(payload.get("port_arrival_date", ""))
    birgunj_arrival = _normalize_date_text(payload.get("birgunj_arrival_date", ""))
    rail_status = _normalize_existing_movement(_clean_text(payload.get("rail_status", "")))
    candidates: list[MilestoneCandidate] = []

    if port_arrival or (_is_port(latest_location) and latest_time):
        date_text = port_arrival or latest_time
        candidates.append(
            MilestoneCandidate(
                milestone="port_arrival",
                source="ldb",
                date_text=date_text,
                date=_parse_date(date_text),
                location=latest_location,
                value=rail_status or latest_location,
                confidence=SOURCE_CONFIDENCE[("port_arrival", "ldb")],
            )
        )

    if birgunj_arrival or (_is_arrived(latest_location) and latest_time):
        date_text = birgunj_arrival or latest_time
        candidates.append(
            MilestoneCandidate(
                milestone="birgunj_arrival",
                source="ldb",
                date_text=date_text,
                date=_parse_date(date_text),
                location=latest_location or "ICD BIRGANJ, Samastipur",
                value=rail_status or latest_location,
                confidence=SOURCE_CONFIDENCE[("birgunj_arrival", "ldb")],
            )
        )

    if latest_location and not _is_port(latest_location) and not _is_arrived(latest_location):
        candidates.append(
            MilestoneCandidate(
                milestone="inland_movement",
                source="ldb",
                date_text=latest_time,
                date=_parse_date(latest_time),
                location=latest_location,
                value=rail_status or latest_location,
                confidence=SOURCE_CONFIDENCE[("inland_movement", "ldb")],
            )
        )
    elif rail_status == "On Rail" and latest_time:
        candidates.append(
            MilestoneCandidate(
                milestone="inland_movement",
                source="ldb",
                date_text=latest_time,
                date=_parse_date(latest_time),
                location=latest_location,
                value=rail_status,
                confidence=SOURCE_CONFIDENCE[("inland_movement", "ldb")],
            )
        )

    return candidates


def extract_concor_candidates(concor_data: dict[str, Any] | None) -> list[MilestoneCandidate]:
    payload = concor_data or {}
    train_no = _clean_text(payload.get("train_no", ""))
    departure = _normalize_date_text(payload.get("departure", ""))
    wagon_loaded_date = _normalize_date_text(payload.get("wagon_loaded_date", ""))
    last_reported_station = _clean_text(payload.get("last_reported_station", ""))
    concor_location_code = _clean_text(payload.get("concor_location_code", ""))
    signal = any(
        _clean_text(payload.get(field, ""))
        for field in ("train_no", "departure", "wagon_loaded_date", "concor_location_code", "last_reported_station")
    )
    if not signal:
        return []

    date_text = _first_non_empty(departure, wagon_loaded_date)
    location = _first_non_empty(last_reported_station, concor_location_code)
    milestone: MilestoneType = "birgunj_arrival" if _is_arrived(location) else "inland_movement"
    return [
        MilestoneCandidate(
            milestone=milestone,
            source="concor",
            date_text=date_text,
            date=_parse_date(date_text),
            location=location,
            value=_first_non_empty(train_no, concor_location_code, last_reported_station),
            confidence=SOURCE_CONFIDENCE[(milestone, "concor")],
        )
    ]


def extract_pristine_candidates(pristine_data: dict[str, Any] | None) -> list[MilestoneCandidate]:
    payload = pristine_data or {}
    arrival_date = _normalize_date_text(payload.get("arrival_date", ""))
    booking_date = _normalize_date_text(payload.get("booking_date", ""))
    location = _clean_text(payload.get("location", "")) or "ICD BIRGANJ, Samastipur"
    candidates: list[MilestoneCandidate] = []

    if arrival_date:
        candidates.append(
            MilestoneCandidate(
                milestone="birgunj_arrival",
                source="pristine",
                date_text=arrival_date,
                date=_parse_date(arrival_date),
                location=location,
                value=location,
                confidence=SOURCE_CONFIDENCE[("birgunj_arrival", "pristine")],
            )
        )

    if booking_date:
        candidates.append(
            MilestoneCandidate(
                milestone="booking",
                source="pristine",
                date_text=booking_date,
                date=_parse_date(booking_date),
                confidence=SOURCE_CONFIDENCE[("booking", "pristine")],
            )
        )

    return candidates


def extract_manual_candidates(context: ShipmentCycleContext) -> list[MilestoneCandidate]:
    if not (context.shipment_completed or context.shipment_archived):
        return []
    completion_date = context.shipment_updated_at or context.shipment_created_at
    return [
        MilestoneCandidate(
            milestone="completion",
            source="manual",
            date_text=completion_date.strftime("%d-%m-%Y") if completion_date else "",
            date=completion_date,
            confidence=SOURCE_CONFIDENCE[("completion", "manual")],
        )
    ]


def annotate_candidate_freshness(candidates: list[MilestoneCandidate], now: datetime) -> None:
    for candidate in candidates:
        candidate.stale_by_age = is_stale_by_age(candidate.date, now)


def _freshest_candidate_date(candidates: list[MilestoneCandidate]) -> datetime | None:
    dated = [candidate.date for candidate in candidates if candidate.date is not None and not candidate.stale_by_age]
    if not dated:
        return None
    return max(dated)


def candidate_belongs_to_current_cycle(
    candidate: MilestoneCandidate,
    *,
    context: ShipmentCycleContext,
    accepted_port_arrival: datetime | None,
    accepted_birgunj_arrival: datetime | None,
    freshest_current_date: datetime | None,
) -> tuple[bool, str]:
    if candidate.stale_by_age:
        return False, "Source date is outside the freshness window."

    if candidate.date and freshest_current_date:
        gap_from_freshest = abs((freshest_current_date.date() - candidate.date.date()).days)
        if gap_from_freshest > MAX_SAME_CYCLE_FORWARD_DRIFT_DAYS:
            return False, "This milestone sits outside the current shipment-cycle window."

    if candidate.milestone == "port_arrival":
        if accepted_birgunj_arrival and candidate.date and candidate.date > accepted_birgunj_arrival + timedelta(days=MAX_SAME_CYCLE_BACKWARD_DRIFT_DAYS):
            return False, "Port arrival is later than the accepted Birgunj milestone."
        return True, ""

    if candidate.milestone == "inland_movement":
        if accepted_port_arrival and candidate.date and candidate.date < accepted_port_arrival:
            return False, "Inland movement predates the current port cycle."
        if accepted_birgunj_arrival and candidate.date and candidate.date > accepted_birgunj_arrival + timedelta(days=MAX_SAME_CYCLE_BACKWARD_DRIFT_DAYS):
            return False, "Post-arrival return movement is outside the tracked shipment lifecycle."
        return True, ""

    if candidate.milestone == "birgunj_arrival":
        if accepted_port_arrival and candidate.date and candidate.date < accepted_port_arrival:
            return False, "Birgunj arrival predates the current port cycle."
        if accepted_port_arrival and candidate.date and candidate.date > accepted_port_arrival + timedelta(days=MAX_SAME_CYCLE_PORT_TO_BIRGUNJ_DAYS):
            return False, "Birgunj arrival is too far from the current port cycle."
        return True, ""

    if candidate.milestone == "booking":
        anchor = accepted_birgunj_arrival or accepted_port_arrival or freshest_current_date
        if anchor and candidate.date and abs((candidate.date.date() - anchor.date()).days) > MAX_SAME_CYCLE_FORWARD_DRIFT_DAYS:
            return False, "Booking date does not fit the current shipment cycle."
        return True, ""

    return True, ""


def evaluate_candidates_for_cycle(
    candidates: list[MilestoneCandidate],
    *,
    context: ShipmentCycleContext,
    freshest_current_date: datetime | None,
    accepted_port_arrival: datetime | None = None,
    accepted_birgunj_arrival: datetime | None = None,
) -> None:
    for candidate in candidates:
        candidate.same_cycle, candidate.reject_reason = candidate_belongs_to_current_cycle(
            candidate,
            context=context,
            accepted_port_arrival=accepted_port_arrival,
            accepted_birgunj_arrival=accepted_birgunj_arrival,
            freshest_current_date=freshest_current_date,
        )


def pick_best_candidate(candidates: list[MilestoneCandidate], milestone: MilestoneType) -> MilestoneCandidate | None:
    eligible = [
        candidate
        for candidate in candidates
        if candidate.milestone == milestone and candidate.same_cycle and not candidate.stale_by_age
    ]
    if not eligible:
        return None

    def sort_key(candidate: MilestoneCandidate) -> tuple[int, float, int]:
        timestamp = candidate.date.timestamp() if candidate.date else 0.0
        source_rank = 1 if candidate.source in {"ldb", "concor"} else 0
        return (candidate.confidence, timestamp, source_rank)

    return max(eligible, key=sort_key)


def pristine_birgunj_can_override_lagging_live_feeds(
    pristine_birgunj: MilestoneCandidate | None,
    live_birgunj: MilestoneCandidate | None,
    live_inland: MilestoneCandidate | None,
) -> bool:
    if pristine_birgunj is None or pristine_birgunj.stale_by_age or not pristine_birgunj.same_cycle:
        return False
    if live_birgunj is not None and live_birgunj.same_cycle and not live_birgunj.stale_by_age:
        return False
    if live_inland is None:
        return True
    if pristine_birgunj.date is None or live_inland.date is None:
        return True
    return pristine_birgunj.date >= live_inland.date - timedelta(days=MAX_SAME_CYCLE_BACKWARD_DRIFT_DAYS)


def resolve_action_needed(
    *,
    movement_category: MovementState,
    birgunj_arrival: MilestoneCandidate | None,
    booking: MilestoneCandidate | None,
    context: ShipmentCycleContext,
) -> tuple[bool, str]:
    if context.shipment_completed or context.shipment_archived:
        return False, ""
    if movement_category != "Arrived Birgunj" or birgunj_arrival is None or booking is None:
        return False, ""
    if birgunj_arrival.date and booking.date and booking.date > birgunj_arrival.date:
        return True, "Pristine booking date is after Birgunj arrival"
    return False, ""


def _candidate_to_dict(candidate: MilestoneCandidate) -> dict[str, Any]:
    return {
        "milestone": candidate.milestone,
        "source": candidate.source,
        "date": candidate.date_text,
        "location": candidate.location,
        "confidence": candidate.confidence,
        "stale_by_age": candidate.stale_by_age,
        "same_cycle": candidate.same_cycle,
        "reject_reason": candidate.reject_reason,
    }


def resolve_shipment_state(
    shipment: Any | None,
    ldb_data: dict[str, Any] | None,
    concor_data: dict[str, Any] | None,
    pristine_data: dict[str, Any] | None,
    *,
    now: datetime | None = None,
) -> ResolvedShipmentState:
    context = build_shipment_cycle_context(shipment)
    current_time = now or datetime.utcnow()
    candidates = [
        *extract_ldb_candidates(ldb_data),
        *extract_concor_candidates(concor_data),
        *extract_pristine_candidates(pristine_data),
        *extract_manual_candidates(context),
    ]
    annotate_candidate_freshness(candidates, current_time)

    freshest_current_date = _freshest_candidate_date(candidates)

    port_candidates = [candidate for candidate in candidates if candidate.milestone == "port_arrival"]
    evaluate_candidates_for_cycle(
        port_candidates,
        context=context,
        freshest_current_date=freshest_current_date,
    )
    accepted_port = pick_best_candidate(port_candidates, "port_arrival")

    live_birgunj_candidates = [
        candidate for candidate in candidates if candidate.milestone == "birgunj_arrival" and candidate.source in {"ldb", "concor"}
    ]
    pristine_birgunj_candidates = [
        candidate for candidate in candidates if candidate.milestone == "birgunj_arrival" and candidate.source == "pristine"
    ]
    inland_candidates = [candidate for candidate in candidates if candidate.milestone == "inland_movement"]

    evaluate_candidates_for_cycle(
        live_birgunj_candidates,
        context=context,
        freshest_current_date=freshest_current_date,
        accepted_port_arrival=accepted_port.date if accepted_port else None,
    )
    evaluate_candidates_for_cycle(
        pristine_birgunj_candidates,
        context=context,
        freshest_current_date=freshest_current_date,
        accepted_port_arrival=accepted_port.date if accepted_port else None,
    )
    evaluate_candidates_for_cycle(
        inland_candidates,
        context=context,
        freshest_current_date=freshest_current_date,
        accepted_port_arrival=accepted_port.date if accepted_port else None,
    )

    accepted_live_birgunj = pick_best_candidate(live_birgunj_candidates, "birgunj_arrival")
    accepted_pristine_birgunj = pick_best_candidate(pristine_birgunj_candidates, "birgunj_arrival")
    accepted_inland = pick_best_candidate(inland_candidates, "inland_movement")

    accepted_birgunj = accepted_live_birgunj
    if accepted_birgunj is None and pristine_birgunj_can_override_lagging_live_feeds(
        accepted_pristine_birgunj,
        accepted_live_birgunj,
        accepted_inland,
    ):
        accepted_birgunj = accepted_pristine_birgunj

    booking_candidates = [candidate for candidate in candidates if candidate.milestone == "booking"]
    evaluate_candidates_for_cycle(
        booking_candidates,
        context=context,
        freshest_current_date=freshest_current_date,
        accepted_port_arrival=accepted_port.date if accepted_port else None,
        accepted_birgunj_arrival=accepted_birgunj.date if accepted_birgunj else None,
    )
    accepted_booking = pick_best_candidate(booking_candidates, "booking")

    completion_candidates = [candidate for candidate in candidates if candidate.milestone == "completion"]
    accepted_completion = pick_best_candidate(completion_candidates, "completion")

    tracking_sources = "+".join(
        source
        for source, payload in (("ldb", ldb_data), ("concor", concor_data), ("pristine", pristine_data))
        if payload
    )

    completion_frozen = bool(context.shipment_completed or context.shipment_archived or accepted_completion)
    why: list[str] = []

    if completion_frozen:
        movement_category: MovementState = "Arrived Birgunj"
        latest_location = "ICD BIRGANJ, Samastipur" if _clean_text(context.stored_birgunj_arrival_date) or _is_arrived(context.stored_latest_location) else context.stored_latest_location
        latest_time = _first_non_empty(context.stored_birgunj_arrival_date, context.stored_latest_time)
        birgunj_arrival_date = _first_non_empty(context.stored_birgunj_arrival_date, latest_time)
        port_arrival_date = accepted_port.date_text if accepted_port else ""
        rail_status = "Arrived Birgunj"
        tracking_sources = tracking_sources or context.stored_tracking_source
        why.append("This shipment cycle is already closed, so later container movement cannot reopen it.")
    elif accepted_birgunj is not None:
        movement_category = "Arrived Birgunj"
        latest_location = accepted_birgunj.location or "ICD BIRGANJ, Samastipur"
        latest_time = accepted_birgunj.date_text
        birgunj_arrival_date = accepted_birgunj.date_text
        port_arrival_date = accepted_port.date_text if accepted_port else ""
        rail_status = "Arrived Birgunj"
        if accepted_birgunj.source == "pristine" and accepted_inland is not None:
            why.append("Fresh same-cycle Pristine arrival overtook an older-stage inland movement signal.")
        elif accepted_birgunj.source == "pristine":
            why.append("Pristine supplied the freshest accepted Birgunj arrival for the current shipment cycle.")
        else:
            why.append("A live rail source directly confirmed Birgunj arrival for this shipment cycle.")
    elif accepted_inland is not None:
        movement_category = "On Rail"
        latest_location = accepted_inland.location
        latest_time = accepted_inland.date_text
        port_arrival_date = accepted_port.date_text if accepted_port else ""
        birgunj_arrival_date = ""
        rail_status = "On Rail"
        why.append("Current same-cycle inland movement exists, but Birgunj arrival is not yet accepted.")
    elif accepted_port is not None:
        movement_category = "At Port"
        latest_location = accepted_port.location
        latest_time = accepted_port.date_text
        port_arrival_date = accepted_port.date_text
        birgunj_arrival_date = ""
        rail_status = "At Port"
        why.append("Port arrival is the strongest accepted milestone for the current shipment cycle.")
    else:
        movement_category = "Hi Seas"
        latest_location = ""
        latest_time = ""
        port_arrival_date = ""
        birgunj_arrival_date = ""
        rail_status = "Hi Seas"
        why.append("No fresh same-cycle port, inland, or Birgunj milestone could be accepted.")

    action_required, action_required_reason = resolve_action_needed(
        movement_category=movement_category,
        birgunj_arrival=accepted_birgunj,
        booking=accepted_booking,
        context=context,
    )
    if action_required:
        why.append("Pristine booking is later than the accepted Birgunj arrival, so operations follow-up is required.")

    accepted_candidates = [
        candidate
        for candidate in (accepted_port, accepted_inland, accepted_birgunj, accepted_booking, accepted_completion)
        if candidate is not None
    ]
    rejected_candidates = [
        candidate
        for candidate in candidates
        if candidate.stale_by_age or not candidate.same_cycle
    ]

    return ResolvedShipmentState(
        movement_category=movement_category,
        latest_location=latest_location,
        latest_time=latest_time,
        port_arrival_date=port_arrival_date,
        birgunj_arrival_date=birgunj_arrival_date,
        pristine_booking_date=accepted_booking.date_text if accepted_booking else "",
        departure=_normalize_date_text((concor_data or {}).get("departure", "")),
        train_no=_clean_text((concor_data or {}).get("train_no", "")),
        wagon_loaded_date=_normalize_date_text((concor_data or {}).get("wagon_loaded_date", "")),
        concor_location_code=_clean_text((concor_data or {}).get("concor_location_code", "")),
        rail_status=rail_status,
        tracking_source=tracking_sources,
        action_required=action_required,
        action_required_reason=action_required_reason,
        completion_frozen=completion_frozen,
        decision_trace={
            "resolved_movement": movement_category,
            "completion_frozen": completion_frozen,
            "accepted_candidates": [_candidate_to_dict(candidate) for candidate in accepted_candidates],
            "rejected_candidates": [_candidate_to_dict(candidate) for candidate in rejected_candidates],
            "why": why,
            "source_priority": "Live rail and port milestones lead. Fresh Pristine Birgunj milestones can overtake lagging inland feeds only when they fit the same shipment cycle.",
        },
    )
