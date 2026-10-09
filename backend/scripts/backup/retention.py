from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

BACKUP_FILE_PREFIX = "copia-base-"
BACKUP_FILE_SUFFIX = ".dump.gpg"
BACKUP_TIMESTAMP_FORMAT = "%Y-%m-%d-%H%M"
RETENTION_PERIOD = timedelta(weeks=8)


@dataclass(frozen=True)
class StoredBackup:
    file_id: str
    name: str


def backup_file_name(taken_at: datetime) -> str:
    timestamp = taken_at.astimezone(UTC).strftime(BACKUP_TIMESTAMP_FORMAT)
    return f"{BACKUP_FILE_PREFIX}{timestamp}{BACKUP_FILE_SUFFIX}"


def backup_taken_at(file_name: str) -> datetime | None:
    if not (file_name.startswith(BACKUP_FILE_PREFIX) and file_name.endswith(BACKUP_FILE_SUFFIX)):
        return None
    timestamp = file_name[len(BACKUP_FILE_PREFIX) : -len(BACKUP_FILE_SUFFIX)]
    try:
        return datetime.strptime(timestamp, BACKUP_TIMESTAMP_FORMAT).replace(tzinfo=UTC)
    except ValueError:
        return None


def expired_backups(backups: Iterable[StoredBackup], now: datetime) -> list[StoredBackup]:
    oldest_kept = now - RETENTION_PERIOD
    expired = []
    for backup in backups:
        taken_at = backup_taken_at(backup.name)
        if taken_at is not None and taken_at < oldest_kept:
            expired.append(backup)
    return expired
