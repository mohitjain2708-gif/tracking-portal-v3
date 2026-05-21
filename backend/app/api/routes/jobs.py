from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.job import Job
from app.models.template import Template
from app.models.upload_session import UploadSession
from app.models.user import User
from app.schemas.job import JobResponse, ProcessJobRequest
from app.services.workbook_service import process_with_mapping
from app.services.ldb_client import fetch_ldb
from app.services.concor_client import fetch_concor

router = APIRouter()
logger = logging.getLogger(__name__)


def _fetch_tracking_bundle(container_no: str) -> tuple[str, dict, dict]:
    ldb_data = fetch_ldb(container_no)
    concor_data = fetch_concor(container_no)
    return container_no, ldb_data or {}, concor_data or {}


def _enrich_rows(rows: list[dict]) -> list[dict]:
    enriched = []
    tracking_cache: dict[str, tuple[dict, dict]] = {}
    container_numbers = []

    for row in rows:
        container_no = str(row.get("container_number", "") or "").strip()
        if container_no:
            container_numbers.append(container_no)

    unique_containers = sorted(set(container_numbers))
    if unique_containers:
        max_workers = min(8, len(unique_containers))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(_fetch_tracking_bundle, container_no): container_no
                for container_no in unique_containers
            }
            for future in as_completed(future_map):
                container_no = future_map[future]
                try:
                    _, ldb_data, concor_data = future.result()
                except Exception as exc:
                    tracking_cache[container_no] = ({"ldb_error": str(exc)}, {"concor_error": str(exc)})
                else:
                    tracking_cache[container_no] = (ldb_data, concor_data)

    for row in rows:
        current = dict(row)
        container_no = str(current.get("container_number", "") or "").strip()

        if not container_no:
            current["tracking_error"] = "Skipped: container number is blank"
            enriched.append(current)
            continue

        ldb_data, concor_data = tracking_cache.get(container_no, ({}, {}))
        current.update(ldb_data)
        current.update(concor_data)
        enriched.append(current)

    return enriched


def _persist_failed_job_state(db: Session, job_id: int, upload_id: int, error_message: str) -> Job | None:
    db.rollback()
    job = db.get(Job, job_id)
    upload = db.get(UploadSession, upload_id)

    if job:
        job.status = "failed"
        job.result_json = None
        job.error_message = error_message
    if upload:
        upload.status = "failed"

    db.commit()
    if job:
        db.refresh(job)
    return job


@router.post("/process", response_model=JobResponse)
def process_job(
    payload: ProcessJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    upload = db.get(UploadSession, payload.upload_id)
    if not upload or upload.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Upload not found")

    if payload.template_id:
        template = db.get(Template, payload.template_id)
        if not template or template.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Template not found")

    if "container_number" not in payload.mapping_json:
        raise HTTPException(
            status_code=400,
            detail="Container Number mapping is required",
        )

    job = Job(
        user_id=current_user.id,
        upload_session_id=upload.id,
        template_id=payload.template_id,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        result = process_with_mapping(
            path=upload.stored_path,
            sheet_name=upload.detected_sheet,
            header_row=upload.detected_header_row,
            mapping_json=payload.mapping_json,
        )

        original_rows = result.get("rows", [])
        result["rows"] = _enrich_rows(original_rows)

        tracking_headers = [
            "latest_location",
            "latest_time",
            "train_no",
            "origin",
            "destination",
            "departure",
            "ldb_error",
            "concor_error",
            "tracking_error",
        ]

        existing_headers = result.get("headers", [])
        result["headers"] = existing_headers + [
            h for h in tracking_headers if h not in existing_headers
        ]
        result["total_rows"] = len(result.get("rows", []))

        job.status = "completed"
        job.result_json = result
        job.error_message = None
        upload.status = "processed"
        db.commit()
        db.refresh(job)

    except Exception as exc:
        logger.exception(
            "Job processing failed",
            extra={"job_id": getattr(job, "id", None), "upload_id": getattr(upload, "id", None)},
        )
        error_message = str(exc) or "Job processing failed"
        failed_job = _persist_failed_job_state(db, job.id, upload.id, error_message)
        if failed_job is None:
            raise
        job = failed_job

    return JobResponse(
        id=job.id,
        status=job.status,
        result_json=job.result_json,
        error_message=job.error_message,
    )


@router.get("", response_model=list[JobResponse])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.execute(
            select(Job)
            .where(Job.user_id == current_user.id)
            .order_by(Job.id.desc())
        )
        .scalars()
        .all()
    )

    return [
        JobResponse(
            id=row.id,
            status=row.status,
            result_json=row.result_json,
            error_message=row.error_message,
        )
        for row in rows
    ]


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Job, job_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobResponse(
        id=row.id,
        status=row.status,
        result_json=row.result_json,
        error_message=row.error_message,
    )
