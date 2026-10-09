from pathlib import Path

import httpx

from scripts.backup.retention import StoredBackup

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
BACKUP_MIME_TYPE = "application/octet-stream"
DRIVE_PAGE_SIZE = 100
HTTP_TIMEOUT_SECONDS = 300.0


class GoogleAuthorizationError(Exception):
    pass


def exchange_token(http: httpx.Client, form: dict[str, str]) -> dict[str, str]:
    response = http.post(GOOGLE_TOKEN_URL, data=form)
    if response.status_code != httpx.codes.OK:
        raise GoogleAuthorizationError(
            f"Google rechazó la autorización (código {response.status_code}). "
            "Revisá que la autorización de Drive siga vigente."
        )
    return response.json()


def access_token_from_refresh_token(
    http: httpx.Client, client_id: str, client_secret: str, refresh_token: str
) -> str:
    tokens = exchange_token(
        http,
        {
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        },
    )
    return tokens["access_token"]


class DriveClient:
    def __init__(self, http: httpx.Client, access_token: str) -> None:
        self._http = http
        self._headers = {"Authorization": f"Bearer {access_token}"}

    def create_folder(self, name: str) -> str:
        response = self._http.post(
            DRIVE_FILES_URL,
            headers=self._headers,
            params={"fields": "id"},
            json={"name": name, "mimeType": DRIVE_FOLDER_MIME_TYPE},
        )
        response.raise_for_status()
        return response.json()["id"]

    def upload_file(self, local_path: Path, name: str, folder_id: str) -> str:
        session = self._http.post(
            DRIVE_UPLOAD_URL,
            headers={**self._headers, "X-Upload-Content-Type": BACKUP_MIME_TYPE},
            params={"uploadType": "resumable", "fields": "id"},
            json={"name": name, "parents": [folder_id]},
        )
        session.raise_for_status()
        with local_path.open("rb") as content:
            response = self._http.put(
                session.headers["Location"],
                headers={**self._headers, "Content-Type": BACKUP_MIME_TYPE},
                content=content.read(),
            )
        response.raise_for_status()
        return response.json()["id"]

    def list_folder(self, folder_id: str) -> list[StoredBackup]:
        backups: list[StoredBackup] = []
        page_token: str | None = None
        while True:
            params = {
                "q": f"'{folder_id}' in parents and trashed = false",
                "fields": "nextPageToken, files(id, name)",
                "pageSize": str(DRIVE_PAGE_SIZE),
            }
            if page_token:
                params["pageToken"] = page_token
            response = self._http.get(DRIVE_FILES_URL, headers=self._headers, params=params)
            response.raise_for_status()
            page = response.json()
            backups.extend(StoredBackup(file_id=f["id"], name=f["name"]) for f in page["files"])
            page_token = page.get("nextPageToken")
            if not page_token:
                return backups

    def delete_file(self, file_id: str) -> None:
        response = self._http.delete(f"{DRIVE_FILES_URL}/{file_id}", headers=self._headers)
        response.raise_for_status()
