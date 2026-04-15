import argparse
import json
import sqlite3
from pathlib import Path

from sqlalchemy import select, text

from app.core.bootstrap import ensure_owner_account
from app.core.database import Base, SessionLocal, engine
from app.models.audit_log import AuditLog
from app.models.customer_directory import CustomerDirectory
from app.models.job import Job
from app.models.shipment import Shipment
from app.models.shipment_source import (
    RawSourceRow,
    ShipmentBatch,
    ShipmentSource,
    SourceConnection,
    SourceMappingProfile,
)
from app.models.template import Template
from app.models.upload_session import UploadSession
from app.models.user import User


def _json_value(value, fallback):
    if value in (None, ""):
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _load_rows(conn: sqlite3.Connection, table_name: str) -> list[dict]:
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {table_name} ORDER BY id")
    return [dict(row) for row in cur.fetchall()]


def _reset_sequence(session, table_name: str) -> None:
    if session.bind.dialect.name != "postgresql":
        return
    session.execute(
        text(
            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
            f"COALESCE((SELECT MAX(id) FROM {table_name}), 1), true)"
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate old SQLite portal data into the current configured database.")
    parser.add_argument("--source", required=True, help="Path to the old SQLite database file")
    parser.add_argument("--dry-run", action="store_true", help="Inspect source and target without writing data")
    args = parser.parse_args()

    source_path = Path(args.source)
    if not source_path.exists():
        raise SystemExit(f"Source database not found: {source_path}")

    sqlite_conn = sqlite3.connect(str(source_path))
    sqlite_conn.row_factory = sqlite3.Row

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        ensure_owner_account(session)

        source_counts = {
            table: sqlite_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in (
                "users",
                "shipments",
                "audit_logs",
                "upload_sessions",
                "shipment_sources",
                "shipment_batches",
                "raw_source_rows",
                "source_connections",
                "source_mapping_profiles",
                "templates",
                "jobs",
                "customer_directory",
            )
        }

        target_counts = {
            "users": session.query(User).count(),
            "shipments": session.query(Shipment).count(),
            "audit_logs": session.query(AuditLog).count(),
            "upload_sessions": session.query(UploadSession).count(),
            "shipment_sources": session.query(ShipmentSource).count(),
            "shipment_batches": session.query(ShipmentBatch).count(),
            "raw_source_rows": session.query(RawSourceRow).count(),
            "source_connections": session.query(SourceConnection).count(),
            "source_mapping_profiles": session.query(SourceMappingProfile).count(),
            "templates": session.query(Template).count(),
            "jobs": session.query(Job).count(),
            "customer_directory": session.query(CustomerDirectory).count(),
        }

        print("SOURCE COUNTS:")
        for key, value in source_counts.items():
            print(f"- {key}: {value}")
        print("\nTARGET COUNTS BEFORE:")
        for key, value in target_counts.items():
            print(f"- {key}: {value}")

        if args.dry_run:
            print("\nDry run only. No changes made.")
            return

        user_id_map: dict[int, int] = {}
        template_id_map: dict[int, int] = {}
        upload_session_id_map: dict[int, int] = {}
        source_id_map: dict[int, int] = {}
        batch_id_map: dict[int, int] = {}
        mapping_profile_id_map: dict[int, int] = {}

        existing_users_by_email = {
            user.email: user for user in session.execute(select(User)).scalars()
        }
        existing_user_ids = {user.id for user in existing_users_by_email.values()}

        for row in _load_rows(sqlite_conn, "users"):
            old_id = int(row["id"])
            email = str(row["email"])
            existing = existing_users_by_email.get(email)
            if existing:
                existing.password_hash = row["password_hash"]
                existing.is_admin = bool(row["is_admin"])
                existing.password_reset_required = bool(row["password_reset_required"])
                user_id_map[old_id] = existing.id
                continue

            payload = {
                "email": email,
                "password_hash": row["password_hash"],
                "is_admin": bool(row["is_admin"]),
                "password_reset_required": bool(row["password_reset_required"]),
                "created_at": row["created_at"],
            }
            if old_id not in existing_user_ids:
                payload["id"] = old_id
            user = User(**payload)
            session.add(user)
            session.flush()
            existing_users_by_email[email] = user
            existing_user_ids.add(user.id)
            user_id_map[old_id] = user.id

        for row in _load_rows(sqlite_conn, "customer_directory"):
            existing = session.get(CustomerDirectory, int(row["id"]))
            if existing:
                continue
            by_key = session.execute(
                select(CustomerDirectory).where(CustomerDirectory.canonical_key == row["canonical_key"])
            ).scalar_one_or_none()
            if by_key:
                continue
            session.add(
                CustomerDirectory(
                    id=int(row["id"]),
                    canonical_key=row["canonical_key"],
                    display_name=row["display_name"],
                    aliases_json=row["aliases_json"],
                    source_count=int(row["source_count"] or 0),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        for row in _load_rows(sqlite_conn, "templates"):
            existing = session.get(Template, int(row["id"]))
            if existing:
                template_id_map[int(row["id"])] = existing.id
                continue
            template = Template(
                id=int(row["id"]),
                user_id=user_id_map[int(row["user_id"])],
                name=row["name"],
                workbook_sheet_name=row["workbook_sheet_name"],
                header_row=int(row["header_row"] or 1),
                mapping_json=_json_value(row["mapping_json"], {}),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            session.add(template)
            template_id_map[int(row["id"])] = int(row["id"])

        for row in _load_rows(sqlite_conn, "upload_sessions"):
            existing = session.get(UploadSession, int(row["id"]))
            if existing:
                upload_session_id_map[int(row["id"])] = existing.id
                continue
            upload = UploadSession(
                id=int(row["id"]),
                user_id=user_id_map[int(row["user_id"])],
                original_filename=row["original_filename"],
                stored_path=row["stored_path"],
                detected_sheet=row["detected_sheet"],
                detected_header_row=int(row["detected_header_row"] or 1),
                available_columns_json=_json_value(row["available_columns_json"], []),
                preview_rows_json=_json_value(row["preview_rows_json"], []),
                status=row["status"],
                created_at=row["created_at"],
            )
            session.add(upload)
            upload_session_id_map[int(row["id"])] = int(row["id"])

        for row in _load_rows(sqlite_conn, "jobs"):
            existing = session.get(Job, int(row["id"]))
            if existing:
                continue
            session.add(
                Job(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    upload_session_id=upload_session_id_map[int(row["upload_session_id"])],
                    template_id=template_id_map.get(int(row["template_id"])) if row["template_id"] is not None else None,
                    status=row["status"],
                    result_json=_json_value(row["result_json"], None),
                    error_message=row["error_message"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        for row in _load_rows(sqlite_conn, "shipment_sources"):
            existing = session.get(ShipmentSource, int(row["id"]))
            if existing:
                source_id_map[int(row["id"])] = existing.id
                continue
            session.add(
                ShipmentSource(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    source_type=row["source_type"],
                    source_label=row["source_label"],
                    source_reference=row["source_reference"],
                    status=row["status"],
                    last_sync_at=row["last_sync_at"],
                    metadata_json=row["metadata_json"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )
            source_id_map[int(row["id"])] = int(row["id"])

        for row in _load_rows(sqlite_conn, "shipment_batches"):
            existing = session.get(ShipmentBatch, int(row["id"]))
            if existing:
                batch_id_map[int(row["id"])] = existing.id
                continue
            session.add(
                ShipmentBatch(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    source_id=source_id_map[int(row["source_id"])],
                    batch_label=row["batch_label"],
                    source_sheet=row["source_sheet"],
                    header_row=int(row["header_row"] or 1),
                    mapping_json=row["mapping_json"],
                    status=row["status"],
                    imported_count=int(row["imported_count"] or 0),
                    duplicate_count=int(row["duplicate_count"] or 0),
                    invalid_count=int(row["invalid_count"] or 0),
                    skipped_blank_count=int(row["skipped_blank_count"] or 0),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )
            batch_id_map[int(row["id"])] = int(row["id"])

        for row in _load_rows(sqlite_conn, "raw_source_rows"):
            existing = session.get(RawSourceRow, int(row["id"]))
            if existing:
                continue
            session.add(
                RawSourceRow(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    source_id=source_id_map[int(row["source_id"])],
                    batch_id=batch_id_map[int(row["batch_id"])],
                    source_row_number=int(row["source_row_number"] or 0),
                    row_status=row["row_status"],
                    row_error=row["row_error"],
                    raw_row_json=row["raw_row_json"],
                    mapped_row_json=row["mapped_row_json"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        for row in _load_rows(sqlite_conn, "source_mapping_profiles"):
            existing = session.get(SourceMappingProfile, int(row["id"]))
            if existing:
                mapping_profile_id_map[int(row["id"])] = existing.id
                continue
            session.add(
                SourceMappingProfile(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    source_type=row["source_type"],
                    source_sheet=row["source_sheet"],
                    profile_label=row["profile_label"],
                    mapping_json=row["mapping_json"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )
            mapping_profile_id_map[int(row["id"])] = int(row["id"])

        for row in _load_rows(sqlite_conn, "source_connections"):
            existing = session.get(SourceConnection, int(row["id"]))
            if existing:
                continue
            session.add(
                SourceConnection(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    source_id=source_id_map[int(row["source_id"])],
                    provider=row["provider"],
                    connection_label=row["connection_label"],
                    source_url=row["source_url"],
                    worksheet_name=row["worksheet_name"],
                    mapping_profile_id=mapping_profile_id_map.get(int(row["mapping_profile_id"]), 0),
                    status=row["status"],
                    config_json=row["config_json"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        for row in _load_rows(sqlite_conn, "shipments"):
            existing = session.get(Shipment, int(row["id"]))
            if existing:
                continue
            session.add(
                Shipment(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    customer_name=row["customer_name"],
                    container_number=row["container_number"],
                    bl_number=row["bl_number"],
                    shipment_status=row["shipment_status"],
                    latest_location=row["latest_location"],
                    latest_time=row["latest_time"],
                    port_arrival_date=row["port_arrival_date"],
                    birgunj_arrival_date=row["birgunj_arrival_date"],
                    pristine_booking_date=row["pristine_booking_date"],
                    train_no=row["train_no"],
                    departure=row["departure"],
                    wagon_loaded_date=row["wagon_loaded_date"],
                    concor_location_code=row["concor_location_code"],
                    rail_status=row["rail_status"],
                    movement_category=row["movement_category"],
                    delay_days=float(row["delay_days"] or 0),
                    wagon_no=row["wagon_no"],
                    train_origin=row["train_origin"],
                    train_destination=row["train_destination"],
                    shipping_line=row["shipping_line"],
                    tracking_source=row["tracking_source"],
                    last_refresh_at=row["last_refresh_at"],
                    last_refresh_status=row["last_refresh_status"],
                    last_refresh_error=row["last_refresh_error"],
                    clearance_doc_number=row["clearance_doc_number"],
                    do_date=row["do_date"],
                    document_status=row["document_status"],
                    original_docs_received_date=row["original_docs_received_date"],
                    source_type=row["source_type"],
                    source_label=row["source_label"],
                    source_batch_id=int(row["source_batch_id"] or 0),
                    raw_source_row_id=int(row["raw_source_row_id"] or 0),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        for row in _load_rows(sqlite_conn, "audit_logs"):
            existing = session.get(AuditLog, int(row["id"]))
            if existing:
                continue
            session.add(
                AuditLog(
                    id=int(row["id"]),
                    user_id=user_id_map[int(row["user_id"])],
                    action=row["action"],
                    bl_number=row["bl_number"],
                    container_number=row["container_number"],
                    shipment_status=row["shipment_status"],
                    details_json=row["details_json"],
                    created_at=row["created_at"],
                )
            )

        session.commit()

        for table_name in (
            "users",
            "customer_directory",
            "templates",
            "upload_sessions",
            "jobs",
            "shipment_sources",
            "shipment_batches",
            "raw_source_rows",
            "source_mapping_profiles",
            "source_connections",
            "shipments",
            "audit_logs",
        ):
            _reset_sequence(session, table_name)
        session.commit()

        print("\nMigration completed.")
        print("TARGET COUNTS AFTER:")
        print(f"- users: {session.query(User).count()}")
        print(f"- shipments: {session.query(Shipment).count()}")
        print(f"- audit_logs: {session.query(AuditLog).count()}")
        print(f"- upload_sessions: {session.query(UploadSession).count()}")
        print(f"- shipment_sources: {session.query(ShipmentSource).count()}")
        print(f"- shipment_batches: {session.query(ShipmentBatch).count()}")
        print(f"- raw_source_rows: {session.query(RawSourceRow).count()}")
        print(f"- source_connections: {session.query(SourceConnection).count()}")
        print(f"- source_mapping_profiles: {session.query(SourceMappingProfile).count()}")
        print(f"- templates: {session.query(Template).count()}")
        print(f"- jobs: {session.query(Job).count()}")
        print(f"- customer_directory: {session.query(CustomerDirectory).count()}")
    finally:
        session.close()
        sqlite_conn.close()


if __name__ == "__main__":
    main()
