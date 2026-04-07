from pydantic import BaseModel

class TemplateCreateRequest(BaseModel):
    name: str
    workbook_sheet_name: str
    header_row: int
    mapping_json: dict

class TemplateResponse(BaseModel):
    id: int
    name: str
    workbook_sheet_name: str
    header_row: int
    mapping_json: dict
