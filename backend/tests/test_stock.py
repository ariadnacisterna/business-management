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


def _gerente_cookies(client, admin_cookies, user_name="gerente-stock"):
    _create_account(client, admin_cookies, user_name, GERENTE)
    return _login(client, user_name, "Clave-segura-1")


def _empleado_cookies(client, admin_cookies, user_name="empleado-stock"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "Clave-segura-1")


def _create_category(client, cookies, name="Categoria stock"):
    response = client.post(
        "/categories", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_unit(client, cookies, name="Unidad stock", abbreviation="u"):
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


def _setup_variant(client, admin_cookies, name="Producto con stock"):
    category = _create_category(client, admin_cookies, f"Categoria {name}")
    unit = _create_unit(client, admin_cookies, f"Unidad {name}", "u")
    product = _create_product(client, admin_cookies, name, category["id"], unit["id"])
    return product["variants"][0]["id"]


def _create_movement_reason(client, cookies, name):
    response = client.post(
        "/movement-reasons", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _adjust_stock(client, cookies, variant_id, quantity, reason_id, observation=None):
    return client.post(
        f"/variants/{variant_id}/stock/adjustments",
        json={"quantity": quantity, "reason_id": reason_id, "observation": observation},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def test_new_variant_starts_with_zero_stock_and_sin_stock_status(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    response = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["quantity"] == 0
    assert body["minimum_quantity"] is None
    assert body["effective_minimum_quantity"] == 10
    assert body["status"] == "sin_stock"


def test_default_movement_reasons_are_seeded(client):
    admin_cookies = _admin_cookies(client)

    response = client.get("/movement-reasons", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    names = {reason["name"] for reason in response.json()}
    assert {"Entrada", "Salida", "Corrección", "Rotura"}.issubset(names)


def test_gerente_can_adjust_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Entrada de prueba")
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    response = _adjust_stock(client, gerente_cookies, variant_id, 25, reason["id"], "Compra")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["quantity_before"] == 0
    assert body["quantity_after"] == 25
    assert body["observation"] == "Compra"

    stock_response = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies)
    assert stock_response.json()["quantity"] == 25
    assert stock_response.json()["status"] == "normal"


def test_empleado_cannot_adjust_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Entrada empleado")
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = _adjust_stock(client, empleado_cookies, variant_id, 10, reason["id"])

    assert response.status_code == 403


def test_admin_can_adjust_stock_since_it_outranks_gerente(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Entrada admin")

    response = _adjust_stock(client, admin_cookies, variant_id, 5, reason["id"])

    assert response.status_code == 201, response.text


def test_cannot_adjust_stock_with_negative_quantity(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Entrada negativa")

    response = _adjust_stock(client, admin_cookies, variant_id, -5, reason["id"])

    assert response.status_code == 422


def test_cannot_adjust_stock_with_inactive_reason(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Motivo a desactivar")
    client.post(
        f"/movement-reasons/{reason['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = _adjust_stock(client, admin_cookies, variant_id, 5, reason["id"])

    assert response.status_code == 422


def test_stock_status_thresholds(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Ajuste umbral")

    client.patch(
        f"/variants/{variant_id}/stock/minimum",
        json={"minimum_quantity": 5},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    _adjust_stock(client, admin_cookies, variant_id, 5, reason["id"])
    at_minimum = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert at_minimum["status"] == "stock_bajo"

    _adjust_stock(client, admin_cookies, variant_id, 6, reason["id"])
    above_minimum = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert above_minimum["status"] == "normal"

    _adjust_stock(client, admin_cookies, variant_id, 0, reason["id"])
    empty = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert empty["status"] == "sin_stock"


def test_list_stock_movements_orders_most_recent_first(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    reason = _create_movement_reason(client, admin_cookies, "Movimiento historial")

    _adjust_stock(client, admin_cookies, variant_id, 3, reason["id"])
    _adjust_stock(client, admin_cookies, variant_id, 7, reason["id"])

    response = client.get(f"/variants/{variant_id}/stock/movements", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    movements = response.json()
    assert len(movements) == 2
    assert movements[0]["quantity_before"] == 3
    assert movements[0]["quantity_after"] == 7
    assert movements[1]["quantity_before"] == 0
    assert movements[1]["quantity_after"] == 3


def test_low_stock_count_reflects_bajo_and_sin_stock_variants(client):
    admin_cookies = _admin_cookies(client)
    reason = _create_movement_reason(client, admin_cookies, "Movimiento conteo")

    before = client.get("/stock/low-count", cookies=admin_cookies)
    assert before.status_code == 200
    initial_count = before.json()["count"]

    sin_stock_variant = _setup_variant(client, admin_cookies, "Producto sin stock")

    normal_variant = _setup_variant(client, admin_cookies, "Producto normal")
    _adjust_stock(client, admin_cookies, normal_variant, 100, reason["id"])

    after = client.get("/stock/low-count", cookies=admin_cookies)
    assert after.status_code == 200
    assert after.json()["count"] == initial_count + 1
    assert sin_stock_variant is not None


def test_create_and_deactivate_movement_reason(client):
    admin_cookies = _admin_cookies(client)

    created = _create_movement_reason(client, admin_cookies, "Motivo editable")
    assert created["status"] == "active"

    updated = client.patch(
        f"/movement-reasons/{created['id']}",
        json={"name": "Motivo renombrado"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Motivo renombrado"

    deactivated = client.post(
        f"/movement-reasons/{created['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["status"] == "inactive"

    reactivated = client.post(
        f"/movement-reasons/{created['id']}/reactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["status"] == "active"


def test_cannot_create_duplicate_movement_reason_name(client):
    admin_cookies = _admin_cookies(client)
    _create_movement_reason(client, admin_cookies, "Motivo duplicado")

    response = client.post(
        "/movement-reasons",
        json={"name": "Motivo duplicado"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_empleado_cannot_create_movement_reason(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.post(
        "/movement-reasons",
        json={"name": "Motivo empleado"},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403
