from pydantic import BaseModel, ConfigDict


class ShipmentCreateRequest(BaseModel):
    customer_name: str = ""
    container_number: str
    bl_number: str = ""


class ShipmentStatusUpdateRequest(BaseModel):
    shipment_status: str


class ShipmentResponse(BaseModel):
    id: int
    customer_name: str
    container_number: str
    bl_number: str
    shipment_status: str
    latest_location: str = ""
    latest_time: str = ""
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

    model_config = ConfigDict(from_attributes=True)
