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


def _enrich_rows(rows: list[dict]) -> list[dict]:
    enriched = []

    for row in rows:
        current = dict(row)
        container_no = str(current.get("container_number", "") or "").strip()

        if not container_no:
            current["tracking_error"] = "Skipped: container number is blank"
            enriched.append(current)
            continue

        try:
            ldb_data = fetch_ldb(container_no)
        except Exception as exc:
            ldb_data = {"ldb_error": str(exc)}

        try:
            concor_data = fetch_concor(container_no)
        except Exception as exc:
            concor_data = {"concor_error": str(exc)}

        current.update(ldb_data or {})
        current.update(concor_data or {})
        enriched.append(current)

    return enriched


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
        upload.status = "processed"
        db.commit()
        db.refresh(job)

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        db.commit()
        db.refresh(job)

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