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

    response = _create_account(
        client, admin_cookies, "empleada-clave-debil", "clave-segura-1", EMPLEADO
    )

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
    created = _create_account(
        client, admin_cookies, "empleada10", "Clave-segura-1", EMPLEADO
    ).json()

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
    login_response = client.post(
        "/auth/login",
        json={
            "user_name": get_settings().initial_admin_username,
            "password": get_settings().initial_admin_password,
        },
    )

    assert login_response.status_code == 200


def _patch_preferences(client, cookies, font_size):
    return client.patch(
        "/auth/me/preferences",
        json={"font_size": font_size},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def test_new_accounts_start_with_the_default_font_size(client):
    admin_cookies = _admin_cookies(client)

    created = _create_account(
        client, admin_cookies, "empleada-fuente", "Clave-segura-1", EMPLEADO
    ).json()

    assert created["font_size"] == 2
    login = client.post(
        "/auth/login", json={"user_name": "empleada-fuente", "password": "Clave-segura-1"}
    )
    assert login.json()["font_size"] == 2


def test_every_role_can_change_its_own_font_size(client):
    admin_cookies = _admin_cookies(client)
    for role in (EMPLEADO, GERENTE, ADMINISTRADOR):
        _create_account(client, admin_cookies, f"user-{role}", "Clave-segura-1", role)

    for user_name in ("user-Empleado", "user-Gerente", "user-Administrador"):
        cookies = _login(client, user_name, "Clave-segura-1")
        response = _patch_preferences(client, cookies, 5)
        assert response.status_code == 200
        assert response.json()["font_size"] == 5
        assert client.get("/auth/me", cookies=cookies).json()["font_size"] == 5

    response = _patch_preferences(client, admin_cookies, 4)
    assert response.status_code == 200
    assert response.json()["font_size"] == 4
    assert response.json()["role"] == DUENO


def test_invalid_font_size_is_rejected(client):
    admin_cookies = _admin_cookies(client)

    for value in (0, 6, -1):
        assert _patch_preferences(client, admin_cookies, value).status_code == 422

    assert client.get("/auth/me", cookies=admin_cookies).json()["font_size"] == 3


def test_font_size_change_without_csrf_is_rejected(client):
    admin_cookies = _admin_cookies(client)

    response = client.patch("/auth/me/preferences", json={"font_size": 4}, cookies=admin_cookies)

    assert response.status_code == 403


def test_font_size_change_without_session_is_rejected(client):
    response = client.patch("/auth/me/preferences", json={"font_size": 4})

    assert response.status_code == 401


def test_font_size_change_only_affects_the_calling_account(client):
    admin_cookies = _admin_cookies(client)
    _create_account(client, admin_cookies, "otra-cuenta", "Clave-segura-1", EMPLEADO)
    other_cookies = _login(client, "otra-cuenta", "Clave-segura-1")
    admin_id = client.get("/auth/me", cookies=admin_cookies).json()["id"]

    response = client.patch(
        "/auth/me/preferences",
        json={"font_size": 5, "account_id": admin_id},
        cookies=other_cookies,
        headers=_auth_headers(other_cookies),
    )

    assert response.status_code == 200
    assert client.get("/auth/me", cookies=admin_cookies).json()["font_size"] == 3
    assert client.get("/auth/me", cookies=other_cookies).json()["font_size"] == 5


def _patch_own_name(client, cookies, name):
    return client.patch(
        "/auth/me", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )


def _change_password(client, cookies, current_password, new_password):
    return client.post(
        "/auth/me/password",
        json={"current_password": current_password, "new_password": new_password},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def _login_status(client, user_name, password):
    payload = {"user_name": user_name, "password": password}
    return client.post("/auth/login", json=payload).status_code


def _self_service_cookies(client, role):
    admin_cookies = _admin_cookies(client)
    user_name = f"propia-{role}"
    _create_account(client, admin_cookies, user_name, "Clave-segura-1", role)
    return user_name, _login(client, user_name, "Clave-segura-1")


def test_every_role_can_change_its_own_name(client):
    for role in (EMPLEADO, GERENTE, ADMINISTRADOR):
        user_name, cookies = _self_service_cookies(client, role)

        response = _patch_own_name(client, cookies, "  Nombre Nuevo  ")

        assert response.status_code == 200
        assert response.json()["name"] == "Nombre Nuevo"
        assert response.json()["user_name"] == user_name
        assert client.get("/auth/me", cookies=cookies).json()["name"] == "Nombre Nuevo"

    admin_cookies = _admin_cookies(client)
    assert _patch_own_name(client, admin_cookies, "Dueña Nueva").json()["role"] == DUENO


def test_changing_the_own_name_rejects_an_empty_name(client):
    _, cookies = _self_service_cookies(client, EMPLEADO)
    before = client.get("/auth/me", cookies=cookies).json()["name"]

    for value in ("", "   "):
        assert _patch_own_name(client, cookies, value).status_code == 422

    assert client.get("/auth/me", cookies=cookies).json()["name"] == before


def test_changing_the_own_name_does_not_change_the_username_or_role(client):
    user_name, cookies = _self_service_cookies(client, GERENTE)

    response = client.patch(
        "/auth/me",
        json={"name": "Otro", "user_name": "intento", "role": DUENO},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )

    assert response.status_code == 200
    assert response.json()["user_name"] == user_name
    assert response.json()["role"] == GERENTE


def test_changing_the_own_name_without_csrf_or_session_is_rejected(client):
    _, cookies = _self_service_cookies(client, EMPLEADO)

    assert client.patch("/auth/me", json={"name": "Otro"}, cookies=cookies).status_code == 403
    client.cookies.clear()
    assert client.patch("/auth/me", json={"name": "Otro"}).status_code == 401


def test_changing_the_own_name_only_affects_the_calling_account(client):
    admin_cookies = _admin_cookies(client)
    admin_before = client.get("/auth/me", cookies=admin_cookies).json()
    _, cookies = _self_service_cookies(client, EMPLEADO)

    client.patch(
        "/auth/me",
        json={"name": "Intruso", "account_id": admin_before["id"], "id": admin_before["id"]},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )

    assert client.get("/auth/me", cookies=admin_cookies).json()["name"] == admin_before["name"]


def test_every_role_can_change_its_own_password(client):
    for role in (EMPLEADO, GERENTE, ADMINISTRADOR):
        user_name, cookies = _self_service_cookies(client, role)

        response = _change_password(client, cookies, "Clave-segura-1", "Clave-nueva-2")

        assert response.status_code == 204
        assert _login_status(client, user_name, "Clave-nueva-2") == 200
        assert _login_status(client, user_name, "Clave-segura-1") == 401

    admin_cookies = _admin_cookies(client)
    settings = get_settings()
    response = _change_password(
        client, admin_cookies, settings.initial_admin_password, "Clave-dueno-2"
    )
    assert response.status_code == 204
    assert _login_status(client, settings.initial_admin_username, "Clave-dueno-2") == 200


def test_changing_the_password_with_a_wrong_current_password_is_forbidden(client):
    user_name, cookies = _self_service_cookies(client, EMPLEADO)

    response = _change_password(client, cookies, "Clave-equivocada-1", "Clave-nueva-2")

    assert response.status_code == 403
    assert response.json()["detail"] == "La contraseña actual no es correcta"
    assert _login_status(client, user_name, "Clave-segura-1") == 200
    assert _login_status(client, user_name, "Clave-nueva-2") == 401
    assert client.get("/auth/me", cookies=cookies).status_code == 200


def test_changing_the_password_rejects_a_new_password_without_complexity(client):
    user_name, cookies = _self_service_cookies(client, EMPLEADO)

    for weak in ("soloMinusculas", "SOLOMAYUSCULAS1", "abc"):
        assert _change_password(client, cookies, "Clave-segura-1", weak).status_code == 422

    assert _login_status(client, user_name, "Clave-segura-1") == 200


def test_changing_the_password_rejects_a_new_password_equal_to_the_current(client):
    user_name, cookies = _self_service_cookies(client, EMPLEADO)

    response = _change_password(client, cookies, "Clave-segura-1", "Clave-segura-1")

    assert response.status_code == 422
    assert "distinta" in response.json()["detail"]
    assert _login_status(client, user_name, "Clave-segura-1") == 200


def test_changing_the_password_closes_the_other_sessions_but_keeps_the_current_one(client):
    user_name, cookies = _self_service_cookies(client, EMPLEADO)
    other_cookies = _login(client, user_name, "Clave-segura-1")
    assert client.get("/auth/me", cookies=other_cookies).status_code == 200

    response = _change_password(client, cookies, "Clave-segura-1", "Clave-nueva-2")

    assert response.status_code == 204
    assert client.get("/auth/me", cookies=cookies).status_code == 200
    assert client.get("/auth/me", cookies=other_cookies).status_code == 401


def test_changing_the_password_does_not_close_the_sessions_of_other_accounts(client):
    admin_cookies = _admin_cookies(client)
    _, cookies = _self_service_cookies(client, EMPLEADO)

    _change_password(client, cookies, "Clave-segura-1", "Clave-nueva-2")

    assert client.get("/auth/me", cookies=admin_cookies).status_code == 200


def test_changing_the_password_without_csrf_or_session_is_rejected(client):
    user_name, cookies = _self_service_cookies(client, EMPLEADO)
    payload = {"current_password": "Clave-segura-1", "new_password": "Clave-nueva-2"}

    assert client.post("/auth/me/password", json=payload, cookies=cookies).status_code == 403
    client.cookies.clear()
    assert client.post("/auth/me/password", json=payload).status_code == 401
    assert _login_status(client, user_name, "Clave-segura-1") == 200


def test_changing_the_password_cannot_target_another_account(client):
    admin_cookies = _admin_cookies(client)
    settings = get_settings()
    admin_id = client.get("/auth/me", cookies=admin_cookies).json()["id"]
    _, cookies = _self_service_cookies(client, EMPLEADO)

    response = client.post(
        "/auth/me/password",
        json={
            "current_password": "Clave-segura-1",
            "new_password": "Clave-nueva-2",
            "account_id": admin_id,
        },
        cookies=cookies,
        headers=_auth_headers(cookies),
    )

    assert response.status_code == 204
    admin_login = _login_status(
        client, settings.initial_admin_username, settings.initial_admin_password
    )
    assert admin_login == 200
