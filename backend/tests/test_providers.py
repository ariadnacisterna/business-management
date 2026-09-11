from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import EMPLEADO, GERENTE
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


def _create_account(client, admin_cookies, user_name, role):
    response = client.post(
        "/accounts",
        json={
            "name": "Cuenta de prueba",
            "user_name": user_name,
            "initial_password": "Clave-segura-1",
            "role": role,
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _gerente_cookies(client, admin_cookies, user_name="gerente-proveedores"):
    _create_account(client, admin_cookies, user_name, GERENTE)
    return _login(client, user_name, "Clave-segura-1")


def _empleado_cookies(client, admin_cookies, user_name="empleado-proveedores"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "Clave-segura-1")


def _create_category(client, cookies, name="Hilos"):
    response = client.post(
        "/categories", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_unit(client, cookies, name="Unidad", abbreviation="u"):
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


def _create_provider(client, cookies, name="Distribuidora Norte", category_ids=None):
    response = client.post(
        "/providers",
        json={
            "name": name,
            "contact_name": "Juan Perez",
            "email": "juan@example.com",
            "phone": "1122334455",
            "category_ids": category_ids or [],
        },
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_gerente_can_create_provider(client):
    admin_cookies = _admin_cookies(client)
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    provider = _create_provider(client, gerente_cookies)

    assert provider["name"] == "Distribuidora Norte"
    assert provider["status"] == "active"
    assert provider["category_ids"] == []


def test_empleado_cannot_create_provider(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.post(
        "/providers",
        json={"name": "Distribuidora Sur"},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_empleado_can_list_providers(client):
    admin_cookies = _admin_cookies(client)
    _create_provider(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.get("/providers", cookies=empleado_cookies)

    assert response.status_code == 200
    assert any(provider["name"] == "Distribuidora Norte" for provider in response.json())


def test_unauthenticated_request_cannot_list_providers(client):
    response = client.get("/providers")

    assert response.status_code == 401


def test_duplicate_provider_name_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _create_provider(client, admin_cookies, "Textiles SA")

    response = client.post(
        "/providers",
        json={"name": "textiles sa"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_update_provider_renames_it(client):
    admin_cookies = _admin_cookies(client)
    provider = _create_provider(client, admin_cookies)

    response = client.patch(
        f"/providers/{provider['id']}",
        json={"name": "Distribuidora Norte SRL"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Distribuidora Norte SRL"


def test_empleado_cannot_update_provider(client):
    admin_cookies = _admin_cookies(client)
    provider = _create_provider(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.patch(
        f"/providers/{provider['id']}",
        json={"name": "Otro nombre"},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_provider_categories_must_belong_to_business(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies)

    response = client.post(
        "/providers",
        json={"name": "Distribuidora Este", "category_ids": [category["id"] + 999]},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422


def test_set_provider_categories(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies)
    provider = _create_provider(client, admin_cookies)

    response = client.put(
        f"/providers/{provider['id']}/categories",
        json={"category_ids": [category["id"]]},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["category_ids"] == [category["id"]]


def test_empleado_cannot_set_provider_categories(client):
    admin_cookies = _admin_cookies(client)
    provider = _create_provider(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.put(
        f"/providers/{provider['id']}/categories",
        json={"category_ids": []},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_deactivate_and_reactivate_provider(client):
    admin_cookies = _admin_cookies(client)
    provider = _create_provider(client, admin_cookies)

    deactivate_response = client.post(
        f"/providers/{provider['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["status"] == "inactive"

    reactivate_response = client.post(
        f"/providers/{provider['id']}/reactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["status"] == "active"


def test_gerente_can_set_product_habitual_provider(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies)
    unit = _create_unit(client, admin_cookies)
    product = _create_product(client, admin_cookies, "Producto A", category["id"], unit["id"])
    provider = _create_provider(client, admin_cookies)

    response = client.put(
        f"/products/{product['id']}/provider",
        json={"provider_id": provider["id"]},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["provider_id"] == provider["id"]


def test_empleado_cannot_set_product_habitual_provider(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies)
    unit = _create_unit(client, admin_cookies)
    product = _create_product(client, admin_cookies, "Producto B", category["id"], unit["id"])
    provider = _create_provider(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.put(
        f"/products/{product['id']}/provider",
        json={"provider_id": provider["id"]},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_clear_product_habitual_provider(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies)
    unit = _create_unit(client, admin_cookies)
    product = _create_product(client, admin_cookies, "Producto C", category["id"], unit["id"])
    provider = _create_provider(client, admin_cookies)
    client.put(
        f"/products/{product['id']}/provider",
        json={"provider_id": provider["id"]},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = client.put(
        f"/products/{product['id']}/provider",
        json={"provider_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["provider_id"] is None
