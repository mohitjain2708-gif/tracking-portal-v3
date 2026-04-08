from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ShipmentSource(Base):
    __tablename__ = "shipment_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="excel_upload")
    source_label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    source_reference: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class ShipmentBatch(Base):
    __tablename__ = "shipment_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    source_id: Mapped[int] = mapped_column(ForeignKey("shipment_sources.id"), index=True, nullable=False)
    batch_label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    source_sheet: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    header_row: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    mapping_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="imported")
    imported_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    invalid_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_blank_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class RawSourceRow(Base):
    __tablename__ = "raw_source_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    source_id: Mapped[int] = mapped_column(ForeignKey("shipment_sources.id"), index=True, nullable=False)
    batch_id: Mapped[int] = mapped_column(ForeignKey("shipment_batches.id"), index=True, nullable=False)
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    row_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    row_error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    raw_row_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    mapped_row_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class SourceMappingProfile(Base):
    __tablename__ = "source_mapping_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="excel_upload")
    source_sheet: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    profile_label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    mapping_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
