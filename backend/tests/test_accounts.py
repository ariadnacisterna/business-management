import sqlalchemy as sa

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE
from app.constants.status import EntityStatus
from app.core.config import get_settings
from app.db.models import Account, Business, BusinessAccess, Role


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

    response = _create_account(client, admin_cookies, "empleada1", "Clave-segura-1", EMPLEADO)

    assert response.status_code == 201
    body = response.json()
    assert body["user_name"] == "empleada1"
    assert body["role"] == EMPLEADO
    assert body["status"] == "active"


def test_create_account_rejects_an_empty_name(client):
    admin_cookies = _admin_cookies(client)

    response = _create_account(
        client, admin_cookies, "empleada-sin-nombre", "Clave-segura-1", EMPLEADO, name="   "
    )

    assert response.status_code == 422


def test_create_account_rejects_a_password_without_the_required_complexity(client):
    admin_cookies = _admin_cookies(client)

    response = _create_account(client, admin_cookies, "empleada-clave-debil", "clave-segura-1", EMPLEADO)

    assert response.status_code == 422


def test_create_account_rejects_a_password_shorter_than_the_minimum(client):
    admin_cookies = _admin_cookies(client)

    response = _create_account(client, admin_cookies, "empleada-clave-corta", "Ab1", EMPLEADO)

    assert response.status_code == 422


def test_can_create_an_account_with_dueno_role(client):
    admin_cookies = _admin_cookies(client)

    response = _create_account(client, admin_cookies, "duena2", "Clave-segura-1", DUENO)

    assert response.status_code == 201
    assert response.json()["role"] == DUENO


def test_create_account_without_csrf_header_is_rejected(client):
    admin_cookies = _admin_cookies(client)

    response = client.post(
        "/accounts",
        json={
            "name": "Cuenta de prueba",
            "user_name": "empleada2",
            "initial_password": "Clave-segura-1",
            "role": EMPLEADO,
        },
        cookies=admin_cookies,
    )

    assert response.status_code == 403


def test_create_account_with_duplicate_username_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    settings = get_settings()

    response = _create_account(
        client, admin_cookies, settings.initial_admin_username, "Clave-segura-1", EMPLEADO
    )

    assert response.status_code == 409


def test_empleado_cannot_manage_accounts(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "empleada3", "Clave-segura-1", EMPLEADO)
    empleada_cookies = _login(client, "empleada3", "Clave-segura-1")

    response = _create_account(client, empleada_cookies, "empleada4", "Clave-segura-1", EMPLEADO)

    assert response.status_code == 403


def test_gerente_cannot_manage_accounts(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "gerente1", "Clave-segura-1", GERENTE)
    gerente_cookies = _login(client, "gerente1", "Clave-segura-1")

    response = _create_account(client, gerente_cookies, "empleada4", "Clave-segura-1", EMPLEADO)

    assert response.status_code == 403


def test_unauthenticated_request_cannot_list_accounts(client):
    response = client.get("/accounts")

    assert response.status_code == 401


def test_administrador_can_list_and_get_accounts(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada5", "Clave-segura-1", EMPLEADO).json()

    listing = client.get("/accounts", cookies=admin_cookies)
    assert listing.status_code == 200
    user_names = {account["user_name"] for account in listing.json()}
    assert "empleada5" in user_names

    detail = client.get(f"/accounts/{created['id']}", cookies=admin_cookies)
    assert detail.status_code == 200
    assert detail.json()["user_name"] == "empleada5"


def test_administrador_can_modify_an_accounts_role(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada6", "Clave-segura-1", EMPLEADO).json()

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
    created = _create_account(client, admin_cookies, "empleada7", "Clave-segura-1", EMPLEADO).json()
    empleada_cookies = _login(client, "empleada7", "Clave-segura-1")

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
        "/auth/login", json={"user_name": "empleada7", "password": "Clave-segura-1"}
    )
    assert login_response.status_code == 401


def test_activating_a_deactivated_account_allows_login_again(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada8", "Clave-segura-1", EMPLEADO).json()
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
        "/auth/login", json={"user_name": "empleada8", "password": "Clave-segura-1"}
    )
    assert login_response.status_code == 200


def test_administrador_can_reset_a_password_and_it_revokes_existing_sessions(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada9", "Clave-vieja-1", EMPLEADO).json()
    empleada_cookies = _login(client, "empleada9", "Clave-vieja-1")

    reset_response = client.post(
        f"/accounts/{created['id']}/reset-password",
        json={"new_password": "Clave-nueva-1"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert reset_response.status_code == 200

    me_response = client.get("/auth/me", cookies=empleada_cookies)
    assert me_response.status_code == 401

    old_password_login = client.post(
        "/auth/login", json={"user_name": "empleada9", "password": "Clave-vieja-1"}
    )
    assert old_password_login.status_code == 401

    new_password_login = client.post(
        "/auth/login", json={"user_name": "empleada9", "password": "Clave-nueva-1"}
    )
    assert new_password_login.status_code == 200


def test_reset_password_rejects_a_password_without_the_required_complexity(client):
    admin_cookies = _admin_cookies(client)
    created = _create_account(client, admin_cookies, "empleada10", "Clave-segura-1", EMPLEADO).json()

    response = client.post(
        f"/accounts/{created['id']}/reset-password",
        json={"new_password": "clave-nueva-1"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422


def _create_second_business(db_session, name="Despensa", industry="Despensa"):
    organization_id = db_session.scalars(sa.select(Business.organization_id)).first()
    business = Business(
        organization_id=organization_id,
        name=name,
        industry=industry,
        status=EntityStatus.ACTIVE.value,
    )
    db_session.add(business)
    db_session.commit()
    db_session.refresh(business)
    return business


def _grant_access(db_session, account_id, business_id, role_name):
    role = db_session.scalars(sa.select(Role).where(Role.name == role_name)).first()
    access = BusinessAccess(
        account_id=account_id,
        business_id=business_id,
        role_id=role.id,
        status=EntityStatus.ACTIVE.value,
    )
    db_session.add(access)
    db_session.commit()
    return access


def _admin_account_id(db_session):
    settings = get_settings()
    account = db_session.scalars(
        sa.select(Account).where(Account.user_name == settings.initial_admin_username)
    ).first()
    return account.id


def _set_up_cross_business_accounts(client, db_session):
    owner_cookies = _admin_cookies(client)
    owner_account_id = _admin_account_id(db_session)
    second_business = _create_second_business(db_session)
    _grant_access(db_session, owner_account_id, second_business.id, DUENO)

    administrador_a = _create_account(
        client, owner_cookies, "administrador-a", "Clave-segura-1", ADMINISTRADOR
    )
    assert administrador_a.status_code == 201, administrador_a.text
    administrador_a_cookies = _login(client, "administrador-a", "Clave-segura-1")

    switch = client.post(
        "/auth/active-business",
        json={"business_id": second_business.id},
        cookies=owner_cookies,
        headers=_auth_headers(owner_cookies),
    )
    assert switch.status_code == 200, switch.text

    account_in_b = _create_account(
        client, owner_cookies, "empleada-en-b", "Clave-segura-1", EMPLEADO
    ).json()

    return administrador_a_cookies, account_in_b["id"]


def test_administrador_cannot_read_an_account_from_another_business(client, db_session):
    administrador_a_cookies, account_in_b_id = _set_up_cross_business_accounts(client, db_session)

    response = client.get(f"/accounts/{account_in_b_id}", cookies=administrador_a_cookies)

    assert response.status_code == 404


def test_administrador_cannot_update_an_account_from_another_business(client, db_session):
    administrador_a_cookies, account_in_b_id = _set_up_cross_business_accounts(client, db_session)

    response = client.patch(
        f"/accounts/{account_in_b_id}",
        json={"role": ADMINISTRADOR},
        cookies=administrador_a_cookies,
        headers=_auth_headers(administrador_a_cookies),
    )

    assert response.status_code == 404


def test_administrador_cannot_deactivate_an_account_from_another_business(client, db_session):
    administrador_a_cookies, account_in_b_id = _set_up_cross_business_accounts(client, db_session)

    response = client.post(
        f"/accounts/{account_in_b_id}/deactivate",
        cookies=administrador_a_cookies,
        headers=_auth_headers(administrador_a_cookies),
    )

    assert response.status_code == 404


def test_administrador_cannot_activate_an_account_from_another_business(client, db_session):
    administrador_a_cookies, account_in_b_id = _set_up_cross_business_accounts(client, db_session)

    response = client.post(
        f"/accounts/{account_in_b_id}/activate",
        cookies=administrador_a_cookies,
        headers=_auth_headers(administrador_a_cookies),
    )

    assert response.status_code == 404


def test_administrador_cannot_reset_the_password_of_an_account_from_another_business(
    client, db_session
):
    administrador_a_cookies, account_in_b_id = _set_up_cross_business_accounts(client, db_session)

    response = client.post(
        f"/accounts/{account_in_b_id}/reset-password",
        json={"new_password": "Clave-nueva-1"},
        cookies=administrador_a_cookies,
        headers=_auth_headers(administrador_a_cookies),
    )

    assert response.status_code == 404


def test_administrador_can_still_manage_an_account_from_their_own_business(client, db_session):
    administrador_a_cookies, _account_in_b_id = _set_up_cross_business_accounts(client, db_session)
    own_account = _create_account(
        client, administrador_a_cookies, "empleada-en-a", "Clave-segura-1", EMPLEADO
    ).json()

    get_response = client.get(f"/accounts/{own_account['id']}", cookies=administrador_a_cookies)
    assert get_response.status_code == 200

    patch_response = client.patch(
        f"/accounts/{own_account['id']}",
        json={"role": GERENTE},
        cookies=administrador_a_cookies,
        headers=_auth_headers(administrador_a_cookies),
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["role"] == GERENTE


def test_administrador_cannot_create_an_account_with_dueno_role(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "administrador-b", "Clave-segura-1", ADMINISTRADOR)
    administrador_cookies = _login(client, "administrador-b", "Clave-segura-1")

    response = _create_account(
        client, administrador_cookies, "aspirante-a-dueno", "Clave-segura-1", DUENO
    )

    assert response.status_code == 403


def test_administrador_can_create_and_promote_accounts_up_to_administrador(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "administrador-c", "Clave-segura-1", ADMINISTRADOR)
    administrador_cookies = _login(client, "administrador-c", "Clave-segura-1")

    created = _create_account(
        client, administrador_cookies, "empleada-promovida", "Clave-segura-1", EMPLEADO
    )
    assert created.status_code == 201

    promote_response = client.patch(
        f"/accounts/{created.json()['id']}",
        json={"role": ADMINISTRADOR},
        cookies=administrador_cookies,
        headers=_auth_headers(administrador_cookies),
    )
    assert promote_response.status_code == 200
    assert promote_response.json()["role"] == ADMINISTRADOR


def test_administrador_cannot_promote_an_account_to_dueno(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "administrador-d", "Clave-segura-1", ADMINISTRADOR)
    administrador_cookies = _login(client, "administrador-d", "Clave-segura-1")
    created = _create_account(
        client, administrador_cookies, "empleada-para-ascender", "Clave-segura-1", EMPLEADO
    ).json()

    response = client.patch(
        f"/accounts/{created['id']}",
        json={"role": DUENO},
        cookies=administrador_cookies,
        headers=_auth_headers(administrador_cookies),
    )

    assert response.status_code == 403


def test_no_account_can_deactivate_itself(client):
    admin_cookies = _admin_cookies(client)
    me = client.get("/auth/me", cookies=admin_cookies).json()

    response = client.post(
        f"/accounts/{me['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 403


def test_no_account_can_change_its_own_role_even_as_dueno(client):
    admin_cookies = _admin_cookies(client)
    me = client.get("/auth/me", cookies=admin_cookies).json()

    response = client.patch(
        f"/accounts/{me['id']}",
        json={"role": DUENO},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 403


def test_an_account_can_still_edit_its_own_name_and_username(client):
    admin_cookies = _admin_cookies(client)
    me = client.get("/auth/me", cookies=admin_cookies).json()

    response = client.patch(
        f"/accounts/{me['id']}",
        json={"name": "Nuevo Nombre", "user_name": "nuevo-user-name"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Nuevo Nombre"
    assert response.json()["user_name"] == "nuevo-user-name"


def test_an_account_can_still_reset_its_own_password(client):
    admin_cookies = _admin_cookies(client)
    me = client.get("/auth/me", cookies=admin_cookies).json()

    response = client.post(
        f"/accounts/{me['id']}/reset-password",
        json={"new_password": "Clave-nueva-1"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200


def test_an_account_created_before_the_complexity_rule_still_logs_in(client):
    admin_cookies = _admin_cookies(client)

    login_response = client.post(
        "/auth/login",
        json={
            "user_name": get_settings().initial_admin_username,
            "password": get_settings().initial_admin_password,
        },
    )

    assert login_response.status_code == 200
