from pydantic import BaseModel, ConfigDict, Field


class ShipmentCreateRequest(BaseModel):
    customer_name: str = ""
    container_number: str = ""
    container_numbers: list[str] = []
    bl_number: str = ""


class ShipmentGroupUpdateRequest(BaseModel):
    current_bl_number: str = ""
    current_container_numbers: list[str] = []
    customer_name: str = ""
    bl_number: str = ""
    container_numbers: list[str] = []
    clearance_doc_number: str = ""
    do_date: str = ""
    document_status: str = ""
    original_docs_received_date: str = ""


class ShipmentStatusUpdateRequest(BaseModel):
    shipment_status: str


class ShipmentGroupBlStatusUpdateRequest(BaseModel):
    bl_number: str = ""
    container_numbers: list[str] = []
    bl_surrender_status: str = ""


class ShipmentGroupPaymentStatusUpdateRequest(BaseModel):
    bl_number: str = ""
    container_numbers: list[str] = []
    payment_status: str = ""


class ShipmentResponse(BaseModel):
    id: int
    customer_name: str
    container_number: str
    bl_number: str
    bl_surrender_status: str = ""
    payment_status: str = ""
    shipment_status: str
    latest_location: str = ""
    latest_time: str = ""
    movement_since_date: str = ""
    port_arrival_date: str = ""
    train_no: str = ""
    departure: str = ""
    rail_status: str = ""
    movement_category: str = ""
    delay_days: float = 0
    wagon_no: str = ""
    train_origin: str = ""
    train_destination: str = ""
    shipping_line: str = ""
    tracking_source: str = ""
    last_refresh_at: str = ""
    last_refresh_status: str = ""
    last_refresh_error: str = ""
    clearance_doc_number: str = ""
    do_date: str = ""
    document_status: str = ""
    original_docs_received_date: str = ""
    action_required: bool = False
    action_required_reason: str = ""
    movement_diagnostics: dict = Field(default_factory=dict)
    source_type: str = ""
    source_label: str = ""
    source_batch_id: int = 0
    raw_source_row_id: int = 0

    model_config = ConfigDict(from_attributes=True)
