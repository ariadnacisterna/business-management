import pytest

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


def _adjust_stock(client, cookies, variant_id, delta, observation=None):
    return client.post(
        f"/variants/{variant_id}/stock/adjustments",
        json={"delta": delta, "observation": observation},
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


def test_empleado_cannot_view_variant_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.get(f"/variants/{variant_id}/stock", cookies=empleado_cookies)

    assert response.status_code == 403


def test_gerente_can_view_variant_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    response = client.get(f"/variants/{variant_id}/stock", cookies=gerente_cookies)

    assert response.status_code == 200


def test_empleado_cannot_view_stock_movements(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.get(f"/variants/{variant_id}/stock/movements", cookies=empleado_cookies)

    assert response.status_code == 403


def test_gerente_can_adjust_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    response = _adjust_stock(client, gerente_cookies, variant_id, 25, "Compra")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["quantity_before"] == 0
    assert body["quantity_after"] == 25
    assert body["observation"] == "Compra"
    assert body["created_by_account_name"] != ""

    stock_response = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies)
    assert stock_response.json()["quantity"] == 25
    assert stock_response.json()["status"] == "normal"


def test_empleado_cannot_adjust_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = _adjust_stock(client, empleado_cookies, variant_id, 10)

    assert response.status_code == 403


def test_admin_can_adjust_stock_since_it_outranks_gerente(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    response = _adjust_stock(client, admin_cookies, variant_id, 5)

    assert response.status_code == 201, response.text


def test_negative_delta_subtracts_from_current_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    _adjust_stock(client, admin_cookies, variant_id, 50)

    response = _adjust_stock(client, admin_cookies, variant_id, -20)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["quantity_before"] == 50
    assert body["quantity_after"] == 30


def test_delta_below_zero_is_rejected_with_the_current_stock_and_changes_nothing(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    _adjust_stock(client, admin_cookies, variant_id, 50)

    response = _adjust_stock(client, admin_cookies, variant_id, -52)

    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "No podés descontar más de lo que hay (50)"
    stock = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert stock["quantity"] == 50
    movements = client.get(f"/variants/{variant_id}/stock/movements", cookies=admin_cookies)
    assert len(movements.json()) == 1


def test_delta_that_leaves_stock_exactly_at_zero_is_accepted(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    _adjust_stock(client, admin_cookies, variant_id, 50)

    response = _adjust_stock(client, admin_cookies, variant_id, -50)

    assert response.status_code == 201, response.text
    assert response.json()["quantity_after"] == 0
    stock = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert stock["quantity"] == 0
    assert stock["status"] == "sin_stock"


def test_zero_delta_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    response = _adjust_stock(client, admin_cookies, variant_id, 0)

    assert response.status_code == 422, response.text
    movements = client.get(f"/variants/{variant_id}/stock/movements", cookies=admin_cookies)
    assert movements.json() == []


def test_two_consecutive_deltas_compose(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    _adjust_stock(client, admin_cookies, variant_id, 30)
    response = _adjust_stock(client, admin_cookies, variant_id, 12)

    assert response.status_code == 201, response.text
    assert response.json()["quantity_before"] == 30
    assert response.json()["quantity_after"] == 42


@pytest.mark.parametrize("delta", [2_147_483_648, -2_147_483_648, 10**30])
def test_delta_outside_the_column_range_is_rejected_not_a_server_error(client, delta):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    response = _adjust_stock(client, admin_cookies, variant_id, delta)

    assert response.status_code == 422, response.text


def test_delta_that_overflows_the_column_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    _adjust_stock(client, admin_cookies, variant_id, 2_000_000_000)

    response = _adjust_stock(client, admin_cookies, variant_id, 200_000_000)

    assert response.status_code == 422, response.text
    stock = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert stock["quantity"] == 2_000_000_000


def test_stock_status_thresholds(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    client.patch(
        f"/variants/{variant_id}/stock/minimum",
        json={"minimum_quantity": 5},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    _adjust_stock(client, admin_cookies, variant_id, 5)
    at_minimum = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert at_minimum["status"] == "stock_bajo"

    _adjust_stock(client, admin_cookies, variant_id, 1)
    above_minimum = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert above_minimum["status"] == "normal"

    _adjust_stock(client, admin_cookies, variant_id, -6)
    empty = client.get(f"/variants/{variant_id}/stock", cookies=admin_cookies).json()
    assert empty["status"] == "sin_stock"


def test_list_stock_movements_orders_most_recent_first(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    _adjust_stock(client, admin_cookies, variant_id, 3)
    _adjust_stock(client, admin_cookies, variant_id, 4)

    response = client.get(f"/variants/{variant_id}/stock/movements", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    movements = response.json()
    assert len(movements) == 2
    assert movements[0]["quantity_before"] == 3
    assert movements[0]["quantity_after"] == 7
    assert movements[1]["quantity_before"] == 0
    assert movements[1]["quantity_after"] == 3
    assert movements[0]["created_by_account_name"] != ""


def test_low_stock_count_reflects_bajo_and_sin_stock_variants(client):
    admin_cookies = _admin_cookies(client)

    before = client.get("/stock/low-count", cookies=admin_cookies)
    assert before.status_code == 200
    initial_count = before.json()["count"]

    sin_stock_variant = _setup_variant(client, admin_cookies, "Producto sin stock")

    normal_variant = _setup_variant(client, admin_cookies, "Producto normal")
    _adjust_stock(client, admin_cookies, normal_variant, 100)

    after = client.get("/stock/low-count", cookies=admin_cookies)
    assert after.status_code == 200
    assert after.json()["count"] == initial_count + 1
    assert sin_stock_variant is not None


def test_list_stock_returns_all_active_variants_in_one_call(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies, "Producto listado")
    _adjust_stock(client, admin_cookies, variant_id, 100)

    response = client.get("/stock", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    body = response.json()
    rows = body["items"]
    assert body["total"] == len(rows)
    matching = [row for row in rows if row["variant_id"] == variant_id]
    assert len(matching) == 1
    row = matching[0]
    assert row["product_name"] == "Producto listado"
    assert row["quantity"] == 100
    assert row["status"] == "normal"


def test_list_stock_includes_last_movement_with_account_name(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies, "Producto con ultimo cambio")
    _adjust_stock(client, admin_cookies, variant_id, 50)

    response = client.get("/stock", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    row = next(row for row in rows if row["variant_id"] == variant_id)
    assert row["last_movement_at"] is not None
    assert row["last_movement_by_account_name"] not in (None, "")


def test_list_stock_last_movement_is_null_without_adjustments(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies, "Producto sin movimientos")

    response = client.get("/stock", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    row = next(row for row in rows if row["variant_id"] == variant_id)
    assert row["last_movement_at"] is None
    assert row["last_movement_by_account_name"] is None


def test_list_stock_excludes_inactive_products_and_variants(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Categoria inactiva")
    unit = _create_unit(client, admin_cookies, "Unidad inactiva", "u2")
    product = _create_product(
        client, admin_cookies, "Producto a desactivar", category["id"], unit["id"]
    )

    client.post(
        f"/products/{product['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = client.get("/stock", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    variant_ids = {row["variant_id"] for row in response.json()["items"]}
    assert product["variants"][0]["id"] not in variant_ids


def test_list_stock_paginates_results(client):
    admin_cookies = _admin_cookies(client)
    for index in range(3):
        _setup_variant(client, admin_cookies, f"Producto paginado {index}")

    first_page = client.get("/stock", params={"page": 1, "page_size": 10}, cookies=admin_cookies)
    assert first_page.status_code == 200, first_page.text
    body = first_page.json()
    assert body["page"] == 1
    assert body["page_size"] == 10
    assert body["total"] >= 3
    assert len(body["items"]) <= 10


def test_list_stock_rejects_invalid_page_size(client):
    admin_cookies = _admin_cookies(client)

    response = client.get("/stock", params={"page": 1, "page_size": 7}, cookies=admin_cookies)

    assert response.status_code == 422


def test_list_stock_filters_by_category_and_search(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Categoria filtro stock")
    unit = _create_unit(client, admin_cookies, "Unidad filtro stock", "fu")
    product = _create_product(
        client, admin_cookies, "Producto filtrable stock", category["id"], unit["id"]
    )
    variant_id = product["variants"][0]["id"]

    response = client.get(
        "/stock",
        params={"category_id": category["id"], "search": "filtrable"},
        cookies=admin_cookies,
    )

    assert response.status_code == 200, response.text
    variant_ids = {row["variant_id"] for row in response.json()["items"]}
    assert variant_id in variant_ids

    other_category = client.get(
        "/stock", params={"category_id": category["id"] + 1000}, cookies=admin_cookies
    )
    assert variant_id not in {row["variant_id"] for row in other_category.json()["items"]}


def test_list_stock_quick_filter_critical_returns_only_sin_stock(client):
    admin_cookies = _admin_cookies(client)
    sin_stock_variant = _setup_variant(client, admin_cookies, "Producto criterio sin stock")
    normal_variant = _setup_variant(client, admin_cookies, "Producto criterio normal")
    _adjust_stock(client, admin_cookies, normal_variant, 100)

    response = client.get("/stock", params={"quick_filter": "sin_stock"}, cookies=admin_cookies)

    assert response.status_code == 200, response.text
    variant_ids = {row["variant_id"] for row in response.json()["items"]}
    assert sin_stock_variant in variant_ids
    assert normal_variant not in variant_ids


def test_list_stock_quick_filter_normal_returns_only_normal_stock(client):
    admin_cookies = _admin_cookies(client)
    sin_stock_variant = _setup_variant(client, admin_cookies, "Producto criterio sin stock normal")
    normal_variant = _setup_variant(client, admin_cookies, "Producto criterio normal filtro")
    _adjust_stock(client, admin_cookies, normal_variant, 100)

    response = client.get("/stock", params={"quick_filter": "normal"}, cookies=admin_cookies)

    assert response.status_code == 200, response.text
    variant_ids = {row["variant_id"] for row in response.json()["items"]}
    assert normal_variant in variant_ids
    assert sin_stock_variant not in variant_ids


def test_list_stock_rejects_invalid_quick_filter(client):
    admin_cookies = _admin_cookies(client)

    response = client.get("/stock", params={"quick_filter": "invalido"}, cookies=admin_cookies)

    assert response.status_code == 422


def test_empleado_list_stock_shows_quantity_and_status_but_not_minimum(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies, "Producto visible para empleado")
    _adjust_stock(client, admin_cookies, variant_id, 100)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.get("/stock", cookies=empleado_cookies)

    assert response.status_code == 200, response.text
    rows = response.json()["items"]
    row = next(row for row in rows if row["variant_id"] == variant_id)
    assert row["product_name"] == "Producto visible para empleado"
    assert row["quantity"] == 100
    assert row["status"] == "normal"
    assert row["minimum_quantity"] is None
    assert row["effective_minimum_quantity"] is None


def test_gerente_list_stock_shows_quantity_status_and_minimum(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies, "Producto visible para gerente")
    _adjust_stock(client, admin_cookies, variant_id, 100)
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    response = client.get("/stock", cookies=gerente_cookies)

    assert response.status_code == 200, response.text
    row = next(row for row in response.json()["items"] if row["variant_id"] == variant_id)
    assert row["quantity"] == 100
    assert row["status"] == "normal"
    assert row["effective_minimum_quantity"] is not None


def test_empleado_list_stock_applies_quick_filter(client):
    admin_cookies = _admin_cookies(client)
    sin_stock_variant = _setup_variant(client, admin_cookies, "Producto sin stock para empleado")
    normal_variant = _setup_variant(client, admin_cookies, "Producto normal para empleado")
    _adjust_stock(client, admin_cookies, normal_variant, 100)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    sin_stock = client.get("/stock", params={"quick_filter": "sin_stock"}, cookies=empleado_cookies)
    normal = client.get("/stock", params={"quick_filter": "normal"}, cookies=empleado_cookies)

    assert sin_stock.status_code == 200, sin_stock.text
    sin_stock_ids = {row["variant_id"] for row in sin_stock.json()["items"]}
    assert sin_stock_variant in sin_stock_ids
    assert normal_variant not in sin_stock_ids
    normal_ids = {row["variant_id"] for row in normal.json()["items"]}
    assert normal_variant in normal_ids
    assert sin_stock_variant not in normal_ids


def test_list_stock_hides_last_movement_from_empleado_and_shows_it_to_gerente(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies, "Producto con ultimo movimiento")
    _adjust_stock(client, admin_cookies, variant_id, 10)
    empleado_cookies = _empleado_cookies(client, admin_cookies)
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    empleado_response = client.get("/stock", cookies=empleado_cookies)
    gerente_response = client.get("/stock", cookies=gerente_cookies)

    assert empleado_response.status_code == 200, empleado_response.text
    empleado_row = next(
        row for row in empleado_response.json()["items"] if row["variant_id"] == variant_id
    )
    assert empleado_row["last_movement_at"] is None
    assert empleado_row["last_movement_by_account_name"] is None
    gerente_row = next(
        row for row in gerente_response.json()["items"] if row["variant_id"] == variant_id
    )
    assert gerente_row["last_movement_at"] is not None
    assert gerente_row["last_movement_by_account_name"] is not None


def test_empleado_cannot_set_minimum_stock(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.patch(
        f"/variants/{variant_id}/stock/minimum",
        json={"minimum_quantity": 5},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_stock_counts_reflect_all_variants_regardless_of_pagination(client):
    admin_cookies = _admin_cookies(client)

    before = client.get("/stock/counts", cookies=admin_cookies)
    assert before.status_code == 200
    before_body = before.json()

    _setup_variant(client, admin_cookies, "Producto conteo sin stock")
    normal_variant = _setup_variant(client, admin_cookies, "Producto conteo normal")
    _adjust_stock(client, admin_cookies, normal_variant, 100)

    after = client.get("/stock/counts", cookies=admin_cookies).json()
    assert after["total"] == before_body["total"] + 2
    assert after["sin_stock"] == before_body["sin_stock"] + 1


def test_adjust_stock_works_without_reason_and_history_has_no_reason(client):
    admin_cookies = _admin_cookies(client)
    variant_id = _setup_variant(client, admin_cookies)

    response = client.post(
        f"/variants/{variant_id}/stock/adjustments",
        json={"delta": 12},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 201, response.text
    assert "reason_id" not in response.json()

    movements = client.get(f"/variants/{variant_id}/stock/movements", cookies=admin_cookies)
    assert movements.status_code == 200
    assert len(movements.json()) == 1
    assert "reason_id" not in movements.json()[0]


def test_movement_reasons_endpoints_no_longer_exist(client):
    admin_cookies = _admin_cookies(client)

    listing = client.get("/movement-reasons", cookies=admin_cookies)
    creation = client.post(
        "/movement-reasons",
        json={"name": "Motivo"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert listing.status_code == 404
    assert creation.status_code == 404
