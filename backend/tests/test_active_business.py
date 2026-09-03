import sqlalchemy as sa

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import ADMINISTRADOR, EMPLEADO
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


def _create_account(client, admin_cookies, user_name, role, name="Cuenta de prueba"):
    response = client.post(
        "/accounts",
        json={
            "name": name,
            "user_name": user_name,
            "initial_password": "clave-segura-1",
            "role": role,
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_category(client, cookies, name):
    response = client.post(
        "/categories", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_unit(client, cookies, name, abbreviation):
    response = client.post(
        "/units",
        json={"name": name, "abbreviation": abbreviation, "allows_fraction": False},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_product(client, cookies, name, category_id, unit_id):
    response = client.post(
        "/products",
        json={"name": name, "category_id": category_id, "unit_id": unit_id},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()["product"]


def _set_up_product_with_single_variant(client, admin_cookies, suffix):
    category = _create_category(client, admin_cookies, f"Categoria {suffix}")
    unit = _create_unit(client, admin_cookies, f"Unidad {suffix}", suffix[:3])
    product = _create_product(
        client, admin_cookies, f"Producto {suffix}", category["id"], unit["id"]
    )
    return product, product["variants"][0]["id"]


def _set_price(client, cookies, variant_id, amount):
    response = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": amount, "expected_current_price_id": None},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _first_business_id(db_session):
    return db_session.scalars(sa.select(Business).order_by(Business.id)).first().id


def _admin_account_id(db_session):
    settings = get_settings()
    account = db_session.scalars(
        sa.select(Account).where(Account.user_name == settings.initial_admin_username)
    ).first()
    return account.id


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


def test_me_reports_the_single_accessible_business_by_default(client, db_session):
    admin_cookies = _admin_cookies(client)
    business_id = _first_business_id(db_session)

    response = client.get("/auth/me", cookies=admin_cookies)

    assert response.status_code == 200
    body = response.json()
    assert body["active_business_id"] == business_id
    assert [business["id"] for business in body["businesses"]] == [business_id]


def test_login_response_also_reports_active_business(client, db_session):
    settings = get_settings()
    business_id = _first_business_id(db_session)

    response = client.post(
        "/auth/login",
        json={
            "user_name": settings.initial_admin_username,
            "password": settings.initial_admin_password,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["active_business_id"] == business_id
    assert len(body["businesses"]) == 1


def test_switching_to_a_business_without_access_is_rejected(client, db_session):
    admin_cookies = _admin_cookies(client)
    original_business_id = _first_business_id(db_session)
    other_business = _create_second_business(db_session)

    response = client.post(
        "/auth/active-business",
        json={"business_id": other_business.id},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 403

    me_response = client.get("/auth/me", cookies=admin_cookies)
    assert me_response.json()["active_business_id"] == original_business_id


def test_switching_to_a_nonexistent_business_is_rejected(client, db_session):
    admin_cookies = _admin_cookies(client)
    original_business_id = _first_business_id(db_session)

    response = client.post(
        "/auth/active-business",
        json={"business_id": 999999},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 403

    me_response = client.get("/auth/me", cookies=admin_cookies)
    assert me_response.json()["active_business_id"] == original_business_id


def test_switching_active_business_without_csrf_header_is_rejected(client, db_session):
    admin_cookies = _admin_cookies(client)
    other_business = _create_second_business(db_session)

    response = client.post(
        "/auth/active-business", json={"business_id": other_business.id}, cookies=admin_cookies
    )

    assert response.status_code == 403


def test_account_with_access_to_two_businesses_can_switch_and_prices_stay_per_business(
    client, db_session
):
    admin_cookies = _admin_cookies(client)
    admin_account_id = _admin_account_id(db_session)
    first_business_id = _first_business_id(db_session)
    second_business = _create_second_business(db_session)
    _grant_access(db_session, admin_account_id, second_business.id, ADMINISTRADOR)

    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "dual")
    _set_price(client, admin_cookies, variant_id, "100.00")

    switch_response = client.post(
        "/auth/active-business",
        json={"business_id": second_business.id},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert switch_response.status_code == 200
    switch_body = switch_response.json()
    assert switch_body["active_business_id"] == second_business.id
    assert {business["id"] for business in switch_body["businesses"]} == {
        first_business_id,
        second_business.id,
    }

    _set_price(client, admin_cookies, variant_id, "200.00")

    price_in_second_business = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies)
    assert price_in_second_business.json()["price"]["amount"] == "200.00"

    client.post(
        "/auth/active-business",
        json={"business_id": first_business_id},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    price_in_first_business = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies)
    assert price_in_first_business.json()["price"]["amount"] == "100.00"


def test_account_with_single_business_access_cannot_see_the_other_business_price(
    client, db_session
):
    admin_cookies = _admin_cookies(client)
    admin_account_id = _admin_account_id(db_session)
    first_business_id = _first_business_id(db_session)
    second_business = _create_second_business(db_session)
    _grant_access(db_session, admin_account_id, second_business.id, ADMINISTRADOR)

    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "isolado")
    _set_price(client, admin_cookies, variant_id, "150.00")

    client.post(
        "/auth/active-business",
        json={"business_id": second_business.id},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    _set_price(client, admin_cookies, variant_id, "999.00")
    client.post(
        "/auth/active-business",
        json={"business_id": first_business_id},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    _create_account(client, admin_cookies, "empleada-negocio-a", EMPLEADO)
    restricted_cookies = _login(client, "empleada-negocio-a", "clave-segura-1")

    me_response = client.get("/auth/me", cookies=restricted_cookies)
    assert me_response.json()["active_business_id"] == first_business_id
    assert len(me_response.json()["businesses"]) == 1

    switch_attempt = client.post(
        "/auth/active-business",
        json={"business_id": second_business.id},
        cookies=restricted_cookies,
        headers=_auth_headers(restricted_cookies),
    )
    assert switch_attempt.status_code == 403

    search_response = client.get("/search", cookies=restricted_cookies)
    assert search_response.status_code == 200
    matching = [
        result for result in search_response.json()["results"] if result["variant_id"] == variant_id
    ]
    assert len(matching) == 1
    assert matching[0]["price_amount"] == "150.00"
