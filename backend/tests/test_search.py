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
            "initial_password": "clave-segura-1",
            "role": role,
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _empleado_cookies(client, admin_cookies, user_name="empleado-busqueda"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "clave-segura-1")


def _create_category(client, cookies, name):
    response = client.post(
        "/categories", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_unit(client, cookies, name, abbreviation, allows_fraction=False):
    response = client.post(
        "/units",
        json={"name": name, "abbreviation": abbreviation, "allows_fraction": allows_fraction},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _get_color_attribute(client, cookies):
    response = client.get("/attributes", cookies=cookies)
    assert response.status_code == 200, response.text
    color = next(attribute for attribute in response.json() if attribute["name"] == "color")
    values_response = client.get(f"/attributes/{color['id']}/values", cookies=cookies)
    assert values_response.status_code == 200, values_response.text
    return color, values_response.json()


def _create_product(client, cookies, name, category_id, unit_id, variants=None):
    payload = {"name": name, "category_id": category_id, "unit_id": unit_id}
    if variants is not None:
        payload["variants"] = variants
    response = client.post(
        "/products", json=payload, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()["product"]


def _set_price(client, cookies, variant_id, amount):
    response = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": amount, "expected_current_price_id": None},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _search(client, cookies, q=None, category_id=None):
    params = {}
    if q is not None:
        params["q"] = q
    if category_id is not None:
        params["category_id"] = category_id
    response = client.get("/search", params=params, cookies=cookies)
    return response


def _set_up_ribbon_product(
    client, admin_cookies, category_name="Cintas", product_name="Cinta bebe N 2"
):
    category = _create_category(client, admin_cookies, category_name)
    unit = _create_unit(client, admin_cookies, "Metro busqueda", "mb", True)
    color, values = _get_color_attribute(client, admin_cookies)
    red = next(value for value in values if value["value"] == "Rojo")
    blue = next(value for value in values if value["value"] == "Azul")

    product = _create_product(
        client,
        admin_cookies,
        product_name,
        category["id"],
        unit["id"],
        variants=[
            {"attribute_value_ids": [red["id"]]},
            {"attribute_value_ids": [blue["id"]]},
        ],
    )
    red_variant = next(v for v in product["variants"] if red["id"] in v["attribute_value_ids"])
    blue_variant = next(v for v in product["variants"] if blue["id"] in v["attribute_value_ids"])
    _set_price(client, admin_cookies, red_variant["id"], "50.00")
    _set_price(client, admin_cookies, blue_variant["id"], "55.00")
    return category, product, red_variant, blue_variant


def test_search_ignores_case_and_accents(client):
    admin_cookies = _admin_cookies(client)
    _category, product, red_variant, _blue_variant = _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas acentos", product_name="Cinta bebé N.º 2"
    )

    response = _search(client, admin_cookies, q="CINTA BEBE 2 ROJO")

    assert response.status_code == 200, response.text
    body = response.json()["results"]
    assert any(item["variant_id"] == red_variant["id"] for item in body)
    matched = next(item for item in body if item["variant_id"] == red_variant["id"])
    assert matched["product_name"] == product["name"]
    assert matched["price_amount"] == "50.00"


def test_search_does_not_depend_on_term_order(client):
    admin_cookies = _admin_cookies(client)
    _category, _product, red_variant, _blue_variant = _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas orden", product_name="Cinta bebe orden N 2"
    )

    response = _search(client, admin_cookies, q="rojo 2 bebe cinta orden")

    assert response.status_code == 200, response.text
    body = response.json()["results"]
    assert any(item["variant_id"] == red_variant["id"] for item in body)


def test_search_with_no_matching_term_returns_empty_results(client):
    admin_cookies = _admin_cookies(client)
    _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas vacio", product_name="Cinta vacio"
    )

    response = _search(client, admin_cookies, q="tornillo inexistente")

    assert response.status_code == 200, response.text
    assert response.json()["results"] == []


def test_variant_without_current_price_does_not_appear(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Sin precio")
    unit = _create_unit(client, admin_cookies, "Unidad sin precio", "usp", False)
    product = _create_product(
        client, admin_cookies, "Producto sin precio vigente", category["id"], unit["id"]
    )
    variant_id = product["variants"][0]["id"]

    response = _search(client, admin_cookies, q="sin precio vigente")

    assert response.status_code == 200, response.text
    assert all(item["variant_id"] != variant_id for item in response.json()["results"])


def test_search_filters_by_category(client):
    admin_cookies = _admin_cookies(client)
    category_a, _product_a, red_variant, _blue_variant = _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas filtro", product_name="Cinta filtro"
    )
    category_b = _create_category(client, admin_cookies, "Utiles filtro")
    unit_b = _create_unit(client, admin_cookies, "Unidad filtro", "uf", False)
    other_product = _create_product(
        client, admin_cookies, "Cuaderno filtro", category_b["id"], unit_b["id"]
    )
    _set_price(client, admin_cookies, other_product["variants"][0]["id"], "30.00")

    response = _search(client, admin_cookies, category_id=category_a["id"])

    assert response.status_code == 200, response.text
    body = response.json()["results"]
    assert all(item["category_id"] == category_a["id"] for item in body)
    assert any(item["variant_id"] == red_variant["id"] for item in body)
    assert all(item["variant_id"] != other_product["variants"][0]["id"] for item in body)


def test_search_combines_category_and_query(client):
    admin_cookies = _admin_cookies(client)
    category, _product, red_variant, blue_variant = _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas combinado", product_name="Cinta combinada"
    )

    response = _search(client, admin_cookies, q="rojo", category_id=category["id"])

    assert response.status_code == 200, response.text
    body = response.json()["results"]
    ids = {item["variant_id"] for item in body}
    assert red_variant["id"] in ids
    assert blue_variant["id"] not in ids


def test_search_excludes_inactive_product(client, db_session):
    from app.db.models import Product

    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Descontinuados")
    unit = _create_unit(client, admin_cookies, "Unidad descontinuada", "ud", False)
    product = _create_product(
        client, admin_cookies, "Producto descontinuado", category["id"], unit["id"]
    )
    variant_id = product["variants"][0]["id"]
    _set_price(client, admin_cookies, variant_id, "10.00")

    stored_product = db_session.get(Product, product["id"])
    stored_product.status = "inactive"
    db_session.commit()

    response = _search(client, admin_cookies, q="descontinuado")

    assert response.status_code == 200, response.text
    assert response.json()["results"] == []


def test_search_with_unknown_category_returns_not_found(client):
    admin_cookies = _admin_cookies(client)

    response = _search(client, admin_cookies, category_id=999999)

    assert response.status_code == 404


def test_empleado_can_search(client):
    admin_cookies = _admin_cookies(client)
    _category, _product, red_variant, _blue_variant = _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas empleado", product_name="Cinta empleado"
    )
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = _search(client, empleado_cookies, q="empleado rojo")

    assert response.status_code == 200, response.text
    assert any(item["variant_id"] == red_variant["id"] for item in response.json()["results"])


def test_unauthenticated_request_cannot_search(client):
    response = client.get("/search")

    assert response.status_code == 401


def test_search_without_terms_lists_all_available_variants(client):
    admin_cookies = _admin_cookies(client)
    _category, _product, red_variant, blue_variant = _set_up_ribbon_product(
        client, admin_cookies, category_name="Cintas listado", product_name="Cinta listado"
    )

    response = _search(client, admin_cookies)

    assert response.status_code == 200, response.text
    ids = {item["variant_id"] for item in response.json()["results"]}
    assert red_variant["id"] in ids
    assert blue_variant["id"] in ids
