import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.constants.security_headers import UNEXPECTED_ERROR_DETAIL
from app.core.client_ip import get_client_ip
from app.core.config import get_settings
from app.main import create_app

STORAGE_URL = "https://proyecto.supabase.co"
INDEX_HTML_CONTENT = "<!doctype html><html><body><div id='root'></div></body></html>"
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


@pytest.fixture
def static_dir(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(INDEX_HTML_CONTENT, encoding="utf-8")
    (tmp_path / "assets" / "index.js").write_text("console.log('app')", encoding="utf-8")
    (tmp_path / "assets" / "index.css").write_text("body { margin: 0; }", encoding="utf-8")
    return tmp_path


@pytest.fixture
def settings(monkeypatch):
    current = get_settings()
    monkeypatch.setattr(current, "supabase_url", STORAGE_URL)
    monkeypatch.setattr(current, "enable_api_docs", False)
    monkeypatch.setattr(current, "render", False)
    monkeypatch.setattr(current, "cookie_secure", True)
    monkeypatch.setattr(current, "client_ip_header", None)
    return current


def _assert_security_headers(response):
    assert response.headers["strict-transport-security"].startswith("max-age=")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "same-origin"
    policy = response.headers["content-security-policy"]
    assert "default-src 'self'" in policy
    assert "script-src 'self'" in policy
    assert "style-src 'self'" in policy
    assert f"img-src 'self' data: blob: {STORAGE_URL}" in policy
    assert "frame-ancestors 'none'" in policy
    assert "object-src 'none'" in policy
    assert "unsafe-inline" not in policy
    assert "unsafe-eval" not in policy


def test_api_responses_carry_the_security_headers(settings, static_dir):
    client = TestClient(create_app(static_dir))

    _assert_security_headers(client.get("/health"))


def test_frontend_files_carry_the_security_headers(settings, static_dir):
    client = TestClient(create_app(static_dir))

    for response in (
        client.get("/", headers={"Accept": "text/html"}),
        client.get("/products", headers={"Accept": "text/html"}),
        client.get("/assets/index.js"),
        client.get("/assets/index.css"),
    ):
        assert response.status_code == 200
        _assert_security_headers(response)


def test_missing_files_carry_the_security_headers(settings, static_dir):
    client = TestClient(create_app(static_dir))

    response = client.get("/assets/no-existe.js")

    assert response.status_code == 404
    _assert_security_headers(response)


def test_image_policy_has_no_storage_origin_when_storage_is_not_configured(
    settings, static_dir, monkeypatch
):
    monkeypatch.setattr(settings, "supabase_url", None)
    client = TestClient(create_app(static_dir))

    policy = client.get("/health").headers["content-security-policy"]

    assert "img-src 'self' data: blob:;" in policy
    assert "supabase" not in policy


def test_api_documentation_is_closed_by_default(settings, static_dir):
    client = TestClient(create_app(static_dir))

    for path in DOC_PATHS:
        response = client.get(path, headers={"Accept": "application/json"})
        assert response.status_code == 404, path


def test_api_documentation_opens_only_when_enabled(settings, static_dir, monkeypatch):
    monkeypatch.setattr(settings, "enable_api_docs", True)
    client = TestClient(create_app(static_dir))

    for path in DOC_PATHS:
        response = client.get(path, headers={"Accept": "text/html"})
        assert response.status_code == 200, path
        assert "x-content-type-options" in response.headers
        assert "content-security-policy" not in response.headers


def test_unexpected_errors_do_not_reveal_internal_details(settings, tmp_path):
    application = create_app(tmp_path / "sin-frontend")

    @application.get("/falla-interna")
    def fail_with_internal_details() -> None:
        raise RuntimeError('SELECT password_hash FROM account; File "C:/app/secreto.py"')

    client = TestClient(application, raise_server_exceptions=False)

    response = client.get("/falla-interna", headers={"Accept": "application/json"})

    assert response.status_code == 500
    assert response.json() == {"detail": UNEXPECTED_ERROR_DETAIL}
    assert "SELECT" not in response.text
    assert "secreto.py" not in response.text
    assert "Traceback" not in response.text


def test_session_cookie_is_secure_on_render_even_if_cookie_secure_is_off(settings, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", False)
    monkeypatch.setattr(settings, "render", True)

    assert settings.session_cookie_secure is True


def test_session_cookie_can_be_insecure_only_outside_render(settings, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", False)

    assert settings.session_cookie_secure is False


def _client_ip_seen_by_the_app(tmp_path, headers):
    application = create_app(tmp_path / "sin-frontend")

    @application.get("/ip-del-cliente")
    def read_client_ip(request: Request) -> dict[str, str]:
        return {"ip": get_client_ip(request)}

    client = TestClient(application)
    response = client.get("/ip-del-cliente", headers={"Accept": "application/json", **headers})
    return response.json()["ip"]


def test_client_ip_ignores_forwarding_headers_when_none_is_trusted(settings, tmp_path):
    headers = {"X-Forwarded-For": "1.2.3.4", "CF-Connecting-IP": "5.6.7.8"}

    assert _client_ip_seen_by_the_app(tmp_path, headers) == "testclient"


def test_client_ip_uses_only_the_proxy_header_on_render(settings, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "render", True)
    headers = {"X-Forwarded-For": "1.2.3.4", "CF-Connecting-IP": "5.6.7.8"}

    assert _client_ip_seen_by_the_app(tmp_path, headers) == "5.6.7.8"
