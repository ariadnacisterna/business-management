from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import EMPLEADO
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


def _empleado_cookies(client, admin_cookies, user_name="empleado-faltantes"):
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
        json={"name": name, "category_ids": category_ids or []},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _set_product_provider(client, cookies, product_id, provider_id):
    response = client.put(
        f"/products/{product_id}/provider",
        json={"provider_id": provider_id},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _create_shortage(client, cookies, variant_id):
    response = client.post(
        "/shortages",
        json={"variant_id": variant_id},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    return response


def _setup_product_with_variant(client, admin_cookies, name="Producto faltante"):
    category = _create_category(client, admin_cookies, f"Categoria {name}")
    unit = _create_unit(client, admin_cookies, f"Unidad {name}", "u")
    product = _create_product(client, admin_cookies, name, category["id"], unit["id"])
    return product, product["variants"][0]["id"], category


def test_empleado_can_create_shortage(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = _create_shortage(client, empleado_cookies, variant_id)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "faltante"
    assert body["variant_id"] == variant_id


def test_unauthenticated_request_cannot_create_shortage(client):
    response = client.post("/shortages", json={"variant_id": 1})

    assert response.status_code == 401


def test_cannot_create_duplicate_open_shortage_for_same_variant(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    _create_shortage(client, admin_cookies, variant_id)

    response = _create_shortage(client, admin_cookies, variant_id)

    assert response.status_code == 409


def test_new_shortage_allowed_after_previous_one_received(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    first = _create_shortage(client, admin_cookies, variant_id).json()

    client.patch(
        f"/shortages/{first['id']}",
        json={"status": "pedido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    client.patch(
        f"/shortages/{first['id']}",
        json={"status": "recibido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = _create_shortage(client, admin_cookies, variant_id)

    assert response.status_code == 201, response.text


def test_shortage_advances_faltante_to_pedido_to_recibido(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    shortage = _create_shortage(client, admin_cookies, variant_id).json()

    to_pedido = client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "pedido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert to_pedido.status_code == 200
    assert to_pedido.json()["status"] == "pedido"

    to_recibido = client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "recibido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert to_recibido.status_code == 200
    assert to_recibido.json()["status"] == "recibido"


def test_shortage_cannot_skip_from_faltante_to_recibido(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    shortage = _create_shortage(client, admin_cookies, variant_id).json()

    response = client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "recibido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_shortage_can_be_cancelled_from_pedido_back_to_faltante(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    shortage = _create_shortage(client, admin_cookies, variant_id).json()
    client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "pedido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "faltante"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "faltante"


def test_shortage_cannot_change_once_received(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    shortage = _create_shortage(client, admin_cookies, variant_id).json()
    client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "pedido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "recibido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "pedido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_empleado_can_change_shortage_status(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies)
    shortage = _create_shortage(client, admin_cookies, variant_id).json()
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.patch(
        f"/shortages/{shortage['id']}",
        json={"status": "pedido"},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 200


def test_list_shortages_defaults_to_open_ones(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies, "Producto abierto")
    shortage = _create_shortage(client, admin_cookies, variant_id).json()
    _, other_variant_id, _ = _setup_product_with_variant(client, admin_cookies, "Producto cerrado")
    closed = _create_shortage(client, admin_cookies, other_variant_id).json()
    client.patch(
        f"/shortages/{closed['id']}",
        json={"status": "pedido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    client.patch(
        f"/shortages/{closed['id']}",
        json={"status": "recibido"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = client.get("/shortages", cookies=admin_cookies)

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert shortage["id"] in ids
    assert closed["id"] not in ids


def test_list_shortages_filters_by_provider_and_category(client):
    admin_cookies = _admin_cookies(client)
    product, variant_id, category = _setup_product_with_variant(
        client, admin_cookies, "Producto con proveedor"
    )
    provider = _create_provider(client, admin_cookies, category_ids=[category["id"]])
    _set_product_provider(client, admin_cookies, product["id"], provider["id"])
    shortage = _create_shortage(client, admin_cookies, variant_id).json()

    other_product, other_variant_id, _ = _setup_product_with_variant(
        client, admin_cookies, "Producto sin proveedor"
    )
    other_shortage = _create_shortage(client, admin_cookies, other_variant_id).json()

    by_provider = client.get(
        "/shortages", params={"provider_id": provider["id"]}, cookies=admin_cookies
    )
    assert by_provider.status_code == 200
    provider_ids = [item["id"] for item in by_provider.json()]
    assert shortage["id"] in provider_ids
    assert other_shortage["id"] not in provider_ids

    by_category = client.get(
        "/shortages", params={"category_id": category["id"]}, cookies=admin_cookies
    )
    assert by_category.status_code == 200
    category_ids = [item["id"] for item in by_category.json()]
    assert shortage["id"] in category_ids
    assert other_shortage["id"] not in category_ids


def test_shortage_count_reflects_open_shortages(client):
    admin_cookies = _admin_cookies(client)
    _, variant_id, _ = _setup_product_with_variant(client, admin_cookies, "Producto contado")

    before = client.get("/shortages/count", cookies=admin_cookies)
    assert before.status_code == 200
    initial_count = before.json()["count"]

    _create_shortage(client, admin_cookies, variant_id)

    after = client.get("/shortages/count", cookies=admin_cookies)
    assert after.status_code == 200
    assert after.json()["count"] == initial_count + 1
