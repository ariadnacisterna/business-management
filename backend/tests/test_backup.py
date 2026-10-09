import json
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from scripts.backup.authorize import (
    DRIVE_FILE_SCOPE,
    AuthorizationDenied,
    authorization_code_from_callback,
    authorization_url,
    code_challenge,
    is_authorization_callback,
)
from scripts.backup.drive import (
    DRIVE_FILES_URL,
    DRIVE_UPLOAD_URL,
    GOOGLE_TOKEN_URL,
    DriveClient,
    GoogleAuthorizationError,
    access_token_from_refresh_token,
)
from scripts.backup.restore import libpq_connection_url
from scripts.backup.retention import (
    RETENTION_PERIOD,
    StoredBackup,
    backup_file_name,
    backup_taken_at,
    expired_backups,
)
from scripts.backup.upload import (
    FOLDER_ID_VARIABLE,
    required_environment_variable,
    upload_and_remove_expired,
)

NOW = datetime(2026, 10, 12, 6, 0, tzinfo=UTC)
FOLDER_ID = "carpeta-123"
RESUMABLE_SESSION_URL = "https://upload.example/sesion-1"


def stored(taken_at: datetime, file_id: str | None = None) -> StoredBackup:
    name = backup_file_name(taken_at)
    return StoredBackup(file_id=file_id or name, name=name)


def test_backup_file_name_includes_date_and_time_in_utc():
    argentina = timezone(timedelta(hours=-3))
    taken_at = datetime(2026, 10, 12, 3, 5, tzinfo=argentina)

    assert backup_file_name(taken_at) == "copia-base-2026-10-12-0605.dump.gpg"


def test_backup_taken_at_reads_back_the_name():
    assert backup_taken_at(backup_file_name(NOW)) == NOW


@pytest.mark.parametrize(
    "name",
    [
        "notas.txt",
        "copia-base-2026-10-12-0605.dump",
        "copia-base-2026-13-40-0605.dump.gpg",
        "otra-copia-base-2026-10-12-0605.dump.gpg",
        "copia-base-.dump.gpg",
    ],
)
def test_backup_taken_at_ignores_other_files(name):
    assert backup_taken_at(name) is None


def test_expired_backups_selects_only_copies_older_than_eight_weeks():
    older = stored(NOW - RETENTION_PERIOD - timedelta(minutes=1))
    much_older = stored(NOW - timedelta(weeks=20))
    exactly_eight_weeks = stored(NOW - RETENTION_PERIOD)
    recent = stored(NOW - timedelta(weeks=1))

    expired = expired_backups([older, much_older, exactly_eight_weeks, recent], NOW)

    assert expired == [older, much_older]


def test_expired_backups_never_selects_files_with_unknown_names():
    unknown = StoredBackup(file_id="x", name="copia-manual.dump.gpg")

    assert expired_backups([unknown], NOW + timedelta(weeks=100)) == []


def test_required_environment_variable_names_the_missing_secret(monkeypatch):
    monkeypatch.setenv(FOLDER_ID_VARIABLE, "   ")

    with pytest.raises(SystemExit, match=FOLDER_ID_VARIABLE):
        required_environment_variable(FOLDER_ID_VARIABLE)


def test_libpq_connection_url_removes_the_python_driver():
    url = "postgresql+psycopg://usuario:clave@servidor:5432/postgres"

    assert libpq_connection_url(url) == "postgresql://usuario:clave@servidor:5432/postgres"
    assert libpq_connection_url("postgresql://u@h/db") == "postgresql://u@h/db"


def test_authorization_url_asks_only_for_files_created_by_the_backup():
    url = authorization_url("cliente", "http://127.0.0.1:5000", "estado", "verificador")
    query = parse_qs(urlsplit(url).query)

    assert query["scope"] == [DRIVE_FILE_SCOPE]
    assert query["access_type"] == ["offline"]
    assert query["redirect_uri"] == ["http://127.0.0.1:5000"]
    assert query["state"] == ["estado"]
    assert query["code_challenge"] == [code_challenge("verificador")]
    assert query["code_challenge_method"] == ["S256"]


def test_authorization_code_from_callback_returns_the_code():
    assert authorization_code_from_callback("code=abc&state=estado", "estado") == "abc"


@pytest.mark.parametrize(
    "query",
    ["code=abc&state=otro", "error=access_denied&state=estado", "state=estado"],
)
def test_authorization_code_from_callback_rejects_bad_answers(query):
    with pytest.raises(AuthorizationDenied):
        authorization_code_from_callback(query, "estado")


def test_is_authorization_callback_ignores_other_browser_requests():
    assert is_authorization_callback("code=abc&state=x")
    assert is_authorization_callback("error=access_denied")
    assert not is_authorization_callback("")


def test_access_token_from_refresh_token_fails_without_exposing_the_answer():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant", "detalle": "secreto"})

    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as http,
        pytest.raises(GoogleAuthorizationError) as error,
    ):
        access_token_from_refresh_token(http, "id", "secreto-cliente", "token")

    assert "secreto" not in str(error.value)


def test_access_token_from_refresh_token_returns_the_access_token():
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == GOOGLE_TOKEN_URL
        assert parse_qs(request.content.decode())["refresh_token"] == ["token"]
        return httpx.Response(200, json={"access_token": "acceso"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        assert access_token_from_refresh_token(http, "id", "secreto", "token") == "acceso"


class FakeDrive:
    def __init__(self, files: list[StoredBackup]) -> None:
        self.files = {f.file_id: f.name for f in files}
        self.uploaded_contents: dict[str, bytes] = {}
        self.pending_upload: dict[str, str] | None = None
        self.deleted: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer acceso"
        url = str(request.url).split("?")[0]
        if request.method == "POST" and url == DRIVE_UPLOAD_URL:
            self.pending_upload = json.loads(request.content)
            return httpx.Response(200, headers={"Location": RESUMABLE_SESSION_URL})
        if request.method == "PUT" and url == RESUMABLE_SESSION_URL:
            file_id = f"nuevo-{len(self.files)}"
            self.files[file_id] = self.pending_upload["name"]
            self.uploaded_contents[file_id] = request.content
            return httpx.Response(200, json={"id": file_id})
        if request.method == "GET" and url == DRIVE_FILES_URL:
            return self.list_page(request)
        if request.method == "DELETE" and url.startswith(f"{DRIVE_FILES_URL}/"):
            file_id = url.rsplit("/", 1)[1]
            del self.files[file_id]
            self.deleted.append(file_id)
            return httpx.Response(204)
        return httpx.Response(404)

    def list_page(self, request: httpx.Request) -> httpx.Response:
        assert f"'{FOLDER_ID}' in parents" in request.url.params["q"]
        entries = [{"id": i, "name": n} for i, n in self.files.items()]
        if "pageToken" not in request.url.params:
            return httpx.Response(200, json={"files": entries[:1], "nextPageToken": "p2"})
        return httpx.Response(200, json={"files": entries[1:]})


def test_upload_and_remove_expired_keeps_recent_copies(tmp_path: Path):
    old = stored(NOW - timedelta(weeks=9), "vieja")
    recent = stored(NOW - timedelta(weeks=7), "reciente")
    unknown = StoredBackup(file_id="otra", name="notas.txt")
    fake = FakeDrive([old, recent, unknown])
    backup_path = tmp_path / backup_file_name(NOW)
    backup_path.write_bytes(b"cifrado")

    with httpx.Client(transport=httpx.MockTransport(fake.handle)) as http:
        drive = DriveClient(http, "acceso")
        removed = upload_and_remove_expired(drive, backup_path, FOLDER_ID, NOW)

    assert removed == [old]
    assert fake.deleted == ["vieja"]
    assert fake.pending_upload == {"name": backup_path.name, "parents": [FOLDER_ID]}
    assert list(fake.uploaded_contents.values()) == [b"cifrado"]
    assert set(fake.files) == {"reciente", "otra", *fake.uploaded_contents}


def test_upload_failure_stops_before_removing_anything(tmp_path: Path):
    old = stored(NOW - timedelta(weeks=9), "vieja")
    fake = FakeDrive([old])
    backup_path = tmp_path / backup_file_name(NOW)
    backup_path.write_bytes(b"cifrado")

    def failing_upload(request: httpx.Request) -> httpx.Response:
        if request.method == "PUT":
            return httpx.Response(500)
        return fake.handle(request)

    with (
        httpx.Client(transport=httpx.MockTransport(failing_upload)) as http,
        pytest.raises(httpx.HTTPStatusError),
    ):
        upload_and_remove_expired(DriveClient(http, "acceso"), backup_path, FOLDER_ID, NOW)

    assert fake.deleted == []
