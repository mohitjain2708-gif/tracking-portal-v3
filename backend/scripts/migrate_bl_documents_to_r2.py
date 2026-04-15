import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.api.routes.shipments import (  # noqa: E402
    _get_r2_client,
    _load_documents_index,
    _r2_object_key,
    _save_documents_index,
)


def _r2_bucket_name() -> str:
    return os.getenv("R2_BUCKET_NAME", "").strip()


def _r2_enabled() -> bool:
    return all(
        [
            os.getenv("R2_BUCKET_NAME", "").strip(),
            os.getenv("R2_ENDPOINT_URL", "").strip(),
            os.getenv("R2_ACCESS_KEY_ID", "").strip(),
            os.getenv("R2_SECRET_ACCESS_KEY", "").strip(),
        ]
    )


def main() -> None:
    if not _r2_enabled():
        raise SystemExit("R2 is not configured in environment variables.")

    client = _get_r2_client()
    if client is None:
        raise SystemExit("R2 client could not be created.")
    bucket_name = _r2_bucket_name()

    index = _load_documents_index()
    migrated = 0
    skipped = 0

    for bl_number, documents in index.items():
        if not isinstance(documents, dict):
            continue
        for document_type, metadata in documents.items():
            if not isinstance(metadata, dict):
                continue
            if str(metadata.get("storage_backend") or "").lower() == "r2":
                skipped += 1
                continue

            target_path = Path(metadata.get("path") or "")
            if not target_path.exists() or not target_path.is_file():
                print(f"Skipping missing file for {bl_number} / {document_type}: {target_path}")
                skipped += 1
                continue

            stored_name = metadata.get("stored_name") or target_path.name
            object_key = _r2_object_key(str(stored_name))
            content = target_path.read_bytes()
            client.put_object(
                Bucket=bucket_name,
                Key=object_key,
                Body=content,
                ContentType=metadata.get("content_type") or "application/octet-stream",
            )
            metadata["storage_backend"] = "r2"
            metadata["bucket"] = bucket_name
            metadata["object_key"] = object_key
            migrated += 1
            print(f"Migrated {bl_number} / {document_type} -> {object_key}")

    _save_documents_index(index)
    print(f"\nCompleted. Migrated {migrated} document(s), skipped {skipped}.")


if __name__ == "__main__":
    main()
