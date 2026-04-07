from pydantic import BaseModel

class UploadResponse(BaseModel):
    upload_id: int
    sheet_name: str
    header_row: int
    available_columns: list[str]
    preview_rows: list[dict]

class PreviewResponse(BaseModel):
    upload_id: int
    original_filename: str
    sheet_name: str
    header_row: int
    available_columns: list[str]
    preview_rows: list[dict]
