from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    container_number: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    bl_number: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    shipment_status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    latest_location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    latest_time: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    port_arrival_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    birgunj_arrival_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    pristine_booking_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    train_no: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    departure: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    rail_status: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    movement_category: Mapped[str] = mapped_column(String(64), nullable=False, default="Hi Seas")
    delay_days: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    wagon_no: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    train_origin: Mapped[str] = mapped_column(Text, nullable=False, default="")
    train_destination: Mapped[str] = mapped_column(Text, nullable=False, default="")
    shipping_line: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    tracking_source: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    last_refresh_at: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    last_refresh_status: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    last_refresh_error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    clearance_doc_number: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    do_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    document_status: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    original_docs_received_date: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    source_label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    source_batch_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    raw_source_row_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
