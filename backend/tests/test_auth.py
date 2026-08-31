from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import ADMINISTRADOR
from app.core.config import get_settings
from app.db.models import Sesion


def _login(client, user_name, password):
    return client.post("/auth/login", json={"user_name": user_name, "password": password})


def test_login_with_valid_credentials_sets_cookies_and_returns_user(client):
    settings = get_settings()

    response = _login(client, settings.initial_admin_username, settings.initial_admin_password)

    assert response.status_code == 200
    body = response.json()
    assert body["user_name"] == settings.initial_admin_username
    assert body["rol"] == ADMINISTRADOR
    assert "session_id" in response.cookies
    assert "csrf_token" in response.cookies


def test_login_with_wrong_password_is_rejected(client):
    settings = get_settings()

    response = _login(client, settings.initial_admin_username, "wrong-password")

    assert response.status_code == 401


def test_login_with_unknown_username_returns_same_generic_error(client):
    wrong_user_response = _login(client, "no-existe", "cualquier-cosa")
    settings = get_settings()
    wrong_password_response = _login(client, settings.initial_admin_username, "wrong-password")

    assert wrong_user_response.status_code == 401
    assert wrong_password_response.status_code == 401
    assert wrong_user_response.json()["detail"] == wrong_password_response.json()["detail"]


def test_me_without_session_is_rejected(client):
    response = client.get("/auth/me")

    assert response.status_code == 401


def test_me_with_valid_session_returns_current_user(client):
    settings = get_settings()
    login_response = _login(
        client, settings.initial_admin_username, settings.initial_admin_password
    )

    response = client.get("/auth/me", cookies=login_response.cookies)

    assert response.status_code == 200
    assert response.json()["user_name"] == settings.initial_admin_username


def test_logout_without_csrf_header_is_rejected(client):
    settings = get_settings()
    login_response = _login(
        client, settings.initial_admin_username, settings.initial_admin_password
    )

    response = client.post("/auth/logout", cookies=login_response.cookies)

    assert response.status_code == 403


def test_logout_invalidates_the_session(client, db_session):
    settings = get_settings()
    login_response = _login(
        client, settings.initial_admin_username, settings.initial_admin_password
    )
    csrf_token = login_response.cookies["csrf_token"]

    logout_response = client.post(
        "/auth/logout",
        cookies=login_response.cookies,
        headers={CSRF_HEADER_NAME: csrf_token},
    )
    assert logout_response.status_code == 204

    me_response = client.get("/auth/me", cookies=login_response.cookies)
    assert me_response.status_code == 401
    assert db_session.query(Sesion).count() == 0


def test_session_expiry_extends_on_activity(client, db_session):
    settings = get_settings()
    login_response = _login(
        client, settings.initial_admin_username, settings.initial_admin_password
    )
    token = login_response.cookies["session_id"]
    sesion_antes = db_session.get(Sesion, token)
    expira_antes = sesion_antes.expira_en
    db_session.expire(sesion_antes)

    client.get("/auth/me", cookies=login_response.cookies)

    sesion_despues = db_session.get(Sesion, token)
    assert sesion_despues.expira_en >= expira_antes
