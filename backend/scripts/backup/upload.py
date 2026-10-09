import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

from scripts.backup.drive import (
    HTTP_TIMEOUT_SECONDS,
    DriveClient,
    access_token_from_refresh_token,
)
from scripts.backup.retention import StoredBackup, expired_backups

CLIENT_ID_VARIABLE = "GOOGLE_CLIENT_ID"
CLIENT_SECRET_VARIABLE = "GOOGLE_CLIENT_SECRET"
REFRESH_TOKEN_VARIABLE = "GOOGLE_REFRESH_TOKEN"
FOLDER_ID_VARIABLE = "GOOGLE_DRIVE_FOLDER_ID"


def required_environment_variable(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta el secreto {name}.")
    return value


def upload_and_remove_expired(
    drive: DriveClient, backup_path: Path, folder_id: str, now: datetime
) -> list[StoredBackup]:
    uploaded_id = drive.upload_file(backup_path, backup_path.name, folder_id)
    stored = [b for b in drive.list_folder(folder_id) if b.file_id != uploaded_id]
    expired = expired_backups(stored, now)
    for backup in expired:
        drive.delete_file(backup.file_id)
    return expired


def main(arguments: list[str]) -> None:
    if len(arguments) != 1:
        raise SystemExit("Uso: python -m scripts.backup.upload <archivo cifrado>")
    backup_path = Path(arguments[0])
    if not backup_path.is_file() or backup_path.stat().st_size == 0:
        raise SystemExit(f"No existe o está vacío el archivo {backup_path.name}.")
    client_id = required_environment_variable(CLIENT_ID_VARIABLE)
    client_secret = required_environment_variable(CLIENT_SECRET_VARIABLE)
    refresh_token = required_environment_variable(REFRESH_TOKEN_VARIABLE)
    folder_id = required_environment_variable(FOLDER_ID_VARIABLE)
    with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS) as http:
        access_token = access_token_from_refresh_token(
            http, client_id, client_secret, refresh_token
        )
        drive = DriveClient(http, access_token)
        removed = upload_and_remove_expired(drive, backup_path, folder_id, datetime.now(UTC))
    print(f"Copia subida: {backup_path.name}")
    for backup in removed:
        print(f"Copia vencida borrada: {backup.name}")


if __name__ == "__main__":
    main(sys.argv[1:])
