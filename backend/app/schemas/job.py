from pydantic import BaseModel

class ProcessJobRequest(BaseModel):
    upload_id: int
    mapping_json: dict
    template_id: int | None = None

class JobResponse(BaseModel):
    id: int
    status: str
    result_json: dict | None = None
    error_message: str | None = None
