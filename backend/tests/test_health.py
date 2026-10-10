from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db.session import get_db
from app.main import create_app

DATABASE_PASSWORD = "clave-de-la-base-secreta"
DATABASE_HOST = "db.interno.example"
DATABASE_URL = f"postgresql+psycopg://usuario:{DATABASE_PASSWORD}@{DATABASE_HOST}:5432/postgres"


class UnreachableDatabase:
    def execute(self, *_args, **_kwargs):
        raise OperationalError(
            "SELECT 1",
            {},
            Exception(f'connection to "{DATABASE_URL}" failed: could not connect to server'),
        )


@pytest.fixture
def unreachable_database_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(get_settings(), "database_url", DATABASE_URL)
    application = create_app(tmp_path / "sin-frontend")

    def _unreachable_database() -> Generator[UnreachableDatabase, None, None]:
        yield UnreachableDatabase()

    application.dependency_overrides[get_db] = _unreachable_database
    return TestClient(application)


def test_health_reports_ok_when_the_database_answers(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_reports_unavailable_when_the_database_does_not_answer(
    unreachable_database_client,
):
    response = unreachable_database_client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_health_does_not_reveal_internal_details_when_the_database_fails(
    unreachable_database_client,
):
    response = unreachable_database_client.get("/health")

    assert DATABASE_HOST not in response.text
    assert DATABASE_PASSWORD not in response.text
    assert "connect" not in response.text


def test_a_failed_health_check_is_logged_without_the_connection_secrets(
    unreachable_database_client, captured_logs
):
    response = unreachable_database_client.get("/health")

    errors = [entry for entry in captured_logs.entries if entry["level"] == "ERROR"]
    assert len(errors) == 1
    assert errors[0]["request_id"] == response.headers["x-request-id"]
    assert "OperationalError" in errors[0]["traceback"]
    assert DATABASE_PASSWORD not in captured_logs.text
    assert "usuario:" not in captured_logs.text
