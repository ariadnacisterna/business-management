import re

import pytest
from fastapi.testclient import TestClient

from app.constants.access import LOGIN_MAX_FAILURES_PER_USER
from app.constants.security_headers import UNEXPECTED_ERROR_DETAIL
from app.core.config import get_settings
from app.core.structured_logging import redact
from app.main import create_app

REQUEST_ID_PATTERN = re.compile(r"^[0-9A-F]{8}$")
DATABASE_PASSWORD = "clave-de-la-base-secreta"
DATABASE_URL = f"postgresql+psycopg://usuario:{DATABASE_PASSWORD}@db.interno.example:5432/postgres"
STORAGE_KEY = "clave-de-envio-de-imagenes"
WRONG_PASSWORD = "Contrasena-Equivocada-77"


@pytest.fixture
def secret_settings(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "database_url", DATABASE_URL)
    monkeypatch.setattr(settings, "supabase_service_role_key", STORAGE_KEY)
    return settings


@pytest.fixture
def failing_client(tmp_path, secret_settings) -> TestClient:
    application = create_app(tmp_path / "sin-frontend")

    @application.get("/falla-interna")
    def fail_with_secrets() -> None:
        raise RuntimeError(f"no se pudo usar {DATABASE_URL} con la clave {STORAGE_KEY}")

    return TestClient(application, raise_server_exceptions=False)


def test_every_response_carries_a_request_id(tmp_path):
    client = TestClient(create_app(tmp_path / "sin-frontend"))

    first = client.get("/no-existe", headers={"Accept": "application/json"})
    second = client.get("/no-existe", headers={"Accept": "application/json"})

    assert REQUEST_ID_PATTERN.match(first.headers["x-request-id"])
    assert first.headers["x-request-id"] != second.headers["x-request-id"]


def test_a_request_id_sent_by_the_browser_is_not_trusted(tmp_path):
    client = TestClient(create_app(tmp_path / "sin-frontend"))

    response = client.get(
        "/no-existe", headers={"Accept": "application/json", "X-Request-ID": "inventado"}
    )

    assert response.headers["x-request-id"] != "inventado"


def test_each_request_is_logged_with_its_request_id(tmp_path, captured_logs):
    client = TestClient(create_app(tmp_path / "sin-frontend"))

    response = client.get("/no-existe?q=algo", headers={"Accept": "application/json"})

    finished = [entry for entry in captured_logs.entries if entry["message"] == "Pedido atendido"]
    assert len(finished) == 1
    assert finished[0]["request_id"] == response.headers["x-request-id"]
    assert finished[0]["method"] == "GET"
    assert finished[0]["path"] == "/no-existe"
    assert finished[0]["status"] == 404
    assert "q=algo" not in captured_logs.text


def test_an_unexpected_error_returns_the_request_id_in_the_generic_message(failing_client):
    response = failing_client.get("/falla-interna", headers={"Accept": "application/json"})

    request_id = response.headers["x-request-id"]
    assert response.status_code == 500
    assert response.json() == {
        "detail": f"{UNEXPECTED_ERROR_DETAIL}. Codigo del error: {request_id}"
    }
    assert DATABASE_PASSWORD not in response.text
    assert STORAGE_KEY not in response.text
    assert "Traceback" not in response.text


def test_an_unexpected_error_is_logged_with_its_traceback_and_without_secrets(
    failing_client, captured_logs
):
    response = failing_client.get("/falla-interna", headers={"Accept": "application/json"})

    errors = [entry for entry in captured_logs.entries if entry["level"] == "ERROR"]
    assert len(errors) == 1
    assert errors[0]["request_id"] == response.headers["x-request-id"]
    assert errors[0]["path"] == "/falla-interna"
    assert "RuntimeError" in errors[0]["traceback"]
    assert "fail_with_secrets" in errors[0]["traceback"]
    assert DATABASE_PASSWORD not in captured_logs.text
    assert STORAGE_KEY not in captured_logs.text
    assert "usuario:" not in captured_logs.text


def test_redact_hides_configured_secrets_and_credentials_inside_any_connection_url(
    secret_settings,
):
    text = (
        f"{DATABASE_URL} {STORAGE_KEY} "
        "postgresql://otro:otra-clave@host/db https://cuenta:clave@servicio.example"
    )

    redacted = redact(text)

    assert DATABASE_PASSWORD not in redacted
    assert STORAGE_KEY not in redacted
    assert "otra-clave" not in redacted
    assert "cuenta:clave" not in redacted
    assert "postgresql://[oculto]@host/db" in redacted


def test_login_logs_never_contain_passwords_cookies_or_tokens(client, captured_logs):
    settings = get_settings()
    login = client.post(
        "/auth/login",
        json={
            "user_name": settings.initial_admin_username,
            "password": settings.initial_admin_password,
        },
    )
    session_token = login.cookies["session_id"]
    csrf_token = login.cookies["csrf_token"]
    client.get("/auth/me", cookies=login.cookies)
    client.post("/auth/login", json={"user_name": "cuenta-ajena", "password": WRONG_PASSWORD})

    assert captured_logs.entries
    assert settings.initial_admin_password not in captured_logs.text
    assert WRONG_PASSWORD not in captured_logs.text
    assert session_token not in captured_logs.text
    assert csrf_token not in captured_logs.text
    assert "session_id" not in captured_logs.text


def test_each_lockout_writes_a_warning_with_the_user_and_ip(client, captured_logs):
    for _ in range(LOGIN_MAX_FAILURES_PER_USER):
        client.post("/auth/login", json={"user_name": "Cuenta-Rara", "password": WRONG_PASSWORD})
    for _ in range(2):
        response = client.post(
            "/auth/login", json={"user_name": "cuenta-rara", "password": WRONG_PASSWORD}
        )
        assert response.status_code == 429

    warnings = [entry for entry in captured_logs.entries if entry["level"] == "WARNING"]
    failures = [
        entry for entry in captured_logs.entries if entry["message"] == "Inicio de sesion fallido"
    ]
    assert len(warnings) == 2
    assert all(entry["user_name"] == "cuenta-rara" for entry in warnings)
    assert all(entry["ip_address"] == "testclient" for entry in warnings)
    assert all(entry["retry_after_seconds"] > 0 for entry in warnings)
    assert len(failures) == LOGIN_MAX_FAILURES_PER_USER
    assert WRONG_PASSWORD not in captured_logs.text
