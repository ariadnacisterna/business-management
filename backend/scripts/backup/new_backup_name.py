from datetime import UTC, datetime

from scripts.backup.retention import backup_file_name

if __name__ == "__main__":
    print(backup_file_name(datetime.now(UTC)))
