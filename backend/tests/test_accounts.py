from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import ADMINISTRADOR, EMPLEADO, GERENTE
from app.core.config import get_settings


def _login(client, user_name, password):
    response = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies


def _admin_cookies(client):
    settings = get_settings()
    return _login(client, settings.initial_admin_username, settings.initial_admin_password)


def _auth_headers(cookies):
    return {CSRF_HEADER_NAME: cookies["csrf_token"]}


def _create_account(client, cookies, user_name, password, role, name="Cuenta de prueba"):
    return client.post(
        "/accounts",
        json={
            "name": name,
            "user_name": user_name,
            "initial_password": password,
            "role": role,
        },
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def test_administrador_can_create_an_account(client):
    admin_cookies = _admin_cookies(client)

    response = _create_account(client, admin_cookies, "empleada1", "clave-segura-1", EMPLEADO)

    assert response.status_code == 201
    body = response.json()
    assert body["user_name"] == "empleada1"
    assert body["role"] == EMPLEADO
    assert body["status"] == "active"


def test_create_account_without_csrf_header_is_rejected(client):
    admin_cookies = _admin_cookies(client)

    response = client.post(
        "/accounts",
        json={
            "name": "Cuenta de prueba",
            "user_name": "empleada2",
            "initial_password": "clave-segura-1",
            "role": EMPLEADO,
        },
        cookies=admin_cookies,
    )

    assert response.status_code == 403


def test_create_account_with_duplicate_username_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    settings = get_settings()

    response = _create_account(
        client, admin_cookies, settings.initial_admin_username, "clave-segura-1", EMPLEADO
    )

    assert response.status_code == 409


def test_empleado_cannot_manage_accounts(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "empleada3", "clave-segura-1", EMPLEADO)
    empleada_cookies = _login(client, "empleada3", "clave-segura-1")

    response = _create_account(client, empleada_cookies, "empleada4", "clave-segura-1", EMPLEADO)

    assert response.status_code == 403


def test_gerente_cannot_manage_accounts(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "gerente1", "clave-segura-1", GERENTE)
    gerente_cookies = _login(client, "gerente1", "clave-segura-1")

    response = _create_account(client, gerente_cookies, "empleada4", "clave-segura-1", EMPLEADO)

    assert response.status_code == 403


def test_unauthenticated_request_cannot_list_accounts(client):
    response = client.get("/accounts")

    assert response.status_code == 401


def test_administrador_can_list_and_get_accounts(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada5", "clave-segura-1", EMPLEADO).json()

    listing = client.get("/accounts", cookies=admin_cookies)
    assert listing.status_code == 200
    user_names = {account["user_name"] for account in listing.json()}
    assert "empleada5" in user_names

    detail = client.get(f"/accounts/{created['id']}", cookies=admin_cookies)
    assert detail.status_code == 200
    assert detail.json()["user_name"] == "empleada5"


def test_administrador_can_modify_an_accounts_role(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada6", "clave-segura-1", EMPLEADO).json()

    response = client.patch(
        f"/accounts/{created['id']}",
        json={"role": ADMINISTRADOR},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["role"] == ADMINISTRADOR


def test_deactivating_an_account_revokes_its_active_session(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada7", "clave-segura-1", EMPLEADO).json()
    empleada_cookies = _login(client, "empleada7", "clave-segura-1")

    deactivate_response = client.post(
        f"/accounts/{created['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["status"] == "inactive"

    me_response = client.get("/auth/me", cookies=empleada_cookies)
    assert me_response.status_code == 401

    login_response = client.post(
        "/auth/login", json={"user_name": "empleada7", "password": "clave-segura-1"}
    )
    assert login_response.status_code == 401


def test_activating_a_deactivated_account_allows_login_again(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada8", "clave-segura-1", EMPLEADO).json()
    client.post(
        f"/accounts/{created['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    activate_response = client.post(
        f"/accounts/{created['id']}/activate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert activate_response.status_code == 200
    assert activate_response.json()["status"] == "active"

    login_response = client.post(
        "/auth/login", json={"user_name": "empleada8", "password": "clave-segura-1"}
    )
    assert login_response.status_code == 200


def test_administrador_can_reset_a_password_and_it_revokes_existing_sessions(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada9", "clave-vieja-1", EMPLEADO).json()
    empleada_cookies = _login(client, "empleada9", "clave-vieja-1")

    reset_response = client.post(
        f"/accounts/{created['id']}/reset-password",
        json={"new_password": "clave-nueva-1"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert reset_response.status_code == 200

    me_response = client.get("/auth/me", cookies=empleada_cookies)
    assert me_response.status_code == 401

    old_password_login = client.post(
        "/auth/login", json={"user_name": "empleada9", "password": "clave-vieja-1"}
    )
    assert old_password_login.status_code == 401

    new_password_login = client.post(
        "/auth/login", json={"user_name": "empleada9", "password": "clave-nueva-1"}
    )
    assert new_password_login.status_code == 200
