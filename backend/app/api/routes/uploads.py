from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.deps import get_current_user
from app.models.upload_session import UploadSession
from app.models.user import User
from app.schemas.upload import PreviewResponse, UploadResponse
from app.services.workbook_service import inspect_workbook, save_upload

router = APIRouter()

@router.post("", response_model=UploadResponse)
async def upload_workbook(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".xlsx", ".xlsm", ".xls"}:
        raise HTTPException(status_code=400, detail="Only Excel files are allowed")

    file_bytes = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum allowed is {settings.max_upload_mb} MB")

    stored_name = f"{uuid4()}{ext}"
    stored_path = Path(settings.upload_dir) / stored_name
    save_upload(file_bytes, stored_path)

    try:
        inspected = inspect_workbook(str(stored_path))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    upload = UploadSession(
        user_id=current_user.id,
        original_filename=file.filename or stored_name,
        stored_path=str(stored_path),
        detected_sheet=inspected["sheet_name"],
        detected_header_row=inspected["header_row"],
        available_columns_json=inspected["available_columns"],
        preview_rows_json=inspected["preview_rows"],
        status="uploaded",
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    return UploadResponse(
        upload_id=upload.id,
        sheet_name=upload.detected_sheet,
        header_row=upload.detected_header_row,
        available_columns=upload.available_columns_json,
        preview_rows=upload.preview_rows_json,
    )

@router.get("/{upload_id}/preview", response_model=PreviewResponse)
def preview_upload(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    upload = db.get(UploadSession, upload_id)
    if not upload or upload.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Upload not found")

    return PreviewResponse(
        upload_id=upload.id,
        original_filename=upload.original_filename,
        sheet_name=upload.detected_sheet,
        header_row=upload.detected_header_row,
        available_columns=upload.available_columns_json,
        preview_rows=upload.preview_rows_json,
    )
