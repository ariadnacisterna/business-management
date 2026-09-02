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
            "initial_password": "clave-segura-1",
            "role": role,
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _gerente_cookies(client, admin_cookies, user_name="gerente-catalogo"):
    _create_account(client, admin_cookies, user_name, GERENTE)
    return _login(client, user_name, "clave-segura-1")


def _empleado_cookies(client, admin_cookies, user_name="empleado-catalogo"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "clave-segura-1")


def _create_category(client, cookies, name="Cintas"):
    response = client.post(
        "/categories", json={"name": name}, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_unit(client, cookies, name="Metro", abbreviation="m", allows_fraction=True):
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


def test_color_attribute_is_preloaded_with_values(client):
    admin_cookies = _admin_cookies(client)

    color, values = _get_color_attribute(client, admin_cookies)

    assert color["status"] == "active"
    assert len(values) > 0
    assert any(value["value"] == "Rojo" for value in values)


def test_administrador_can_create_category_and_unit(client):
    admin_cookies = _admin_cookies(client)

    category = _create_category(client, admin_cookies, "Telas")
    unit = _create_unit(client, admin_cookies, "Unidad", "u", False)

    assert category["name"] == "Telas"
    assert category["status"] == "active"
    assert unit["name"] == "Unidad"
    assert unit["allows_fraction"] is False


def test_gerente_can_administer_catalog(client):
    admin_cookies = _admin_cookies(client)
    gerente_cookies = _gerente_cookies(client, admin_cookies)

    response = client.post(
        "/categories",
        json={"name": "Utiles"},
        cookies=gerente_cookies,
        headers=_auth_headers(gerente_cookies),
    )

    assert response.status_code == 201, response.text


def test_empleado_cannot_administer_catalog(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.post(
        "/categories",
        json={"name": "Utiles"},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_empleado_can_read_categories(client):
    admin_cookies = _admin_cookies(client)
    _create_category(client, admin_cookies, "Lanas")
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    response = client.get("/categories", cookies=empleado_cookies)

    assert response.status_code == 200
    assert any(category["name"] == "Lanas" for category in response.json())


def test_unauthenticated_request_cannot_list_categories(client):
    response = client.get("/categories")

    assert response.status_code == 401


def test_duplicate_category_name_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _create_category(client, admin_cookies, "Agujas")

    response = client.post(
        "/categories",
        json={"name": "agujas"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_update_category_renames_it(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Hilos")

    response = client.patch(
        f"/categories/{category['id']}",
        json={"name": "Hilos y lanas"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Hilos y lanas"


def test_create_attribute_value_rejects_case_and_accent_duplicates(client):
    admin_cookies = _admin_cookies(client)
    color, _ = _get_color_attribute(client, admin_cookies)

    response = client.post(
        f"/attributes/{color['id']}/values",
        json={"value": "ROJO"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_create_attribute_value_allows_new_value_and_it_is_listed(client):
    admin_cookies = _admin_cookies(client)
    color, _ = _get_color_attribute(client, admin_cookies)

    response = client.post(
        f"/attributes/{color['id']}/values",
        json={"value": "Turquesa"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 201, response.text
    _, values = _get_color_attribute(client, admin_cookies)
    assert any(value["value"] == "Turquesa" for value in values)


def test_create_product_without_variants_creates_implicit_variant(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Libreria")
    unit = _create_unit(client, admin_cookies, "Unidad", "u", False)

    response = client.post(
        "/products",
        json={
            "name": "Cuaderno tapa dura 48 hojas",
            "category_id": category["id"],
            "unit_id": unit["id"],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    variants = body["product"]["variants"]
    assert len(variants) == 1
    assert variants[0]["is_implicit"] is True
    assert variants[0]["label"] is None
    assert body["possible_duplicates"] == []


def test_create_product_with_explicit_variants_and_colors(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Merceria")
    unit = _create_unit(client, admin_cookies, "Metro", "m", True)
    color, values = _get_color_attribute(client, admin_cookies)
    red = next(value for value in values if value["value"] == "Rojo")
    blue = next(value for value in values if value["value"] == "Azul")

    response = client.post(
        "/products",
        json={
            "name": "Cinta bebe N 2",
            "category_id": category["id"],
            "unit_id": unit["id"],
            "variants": [
                {"attribute_value_ids": [red["id"]]},
                {"attribute_value_ids": [blue["id"]]},
            ],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    variants = body["product"]["variants"]
    assert len(variants) == 2
    assert all(variant["is_implicit"] is False for variant in variants)
    assert {red["id"]} in [set(v["attribute_value_ids"]) for v in variants]
    assert {blue["id"]} in [set(v["attribute_value_ids"]) for v in variants]


def test_create_product_warns_about_possible_duplicate_variant(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Merceria duplicados")
    unit = _create_unit(client, admin_cookies, "Metro duplicado", "md", True)
    color, values = _get_color_attribute(client, admin_cookies)
    red = next(value for value in values if value["value"] == "Rojo")

    first = client.post(
        "/products",
        json={
            "name": "Cinta bebe N 2",
            "category_id": category["id"],
            "unit_id": unit["id"],
            "variants": [{"attribute_value_ids": [red["id"]]}],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert first.status_code == 201, first.text

    second = client.post(
        "/products",
        json={
            "name": "cinta bebe n 2",
            "category_id": category["id"],
            "unit_id": unit["id"],
            "variants": [{"attribute_value_ids": [red["id"]]}],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert second.status_code == 201, second.text
    body = second.json()
    assert len(body["possible_duplicates"]) == 1


def test_add_variant_rejects_unlabeled_implicit_variant(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Bebidas")
    unit = _create_unit(client, admin_cookies, "Unidad bebida", "ub", False)

    created = client.post(
        "/products",
        json={
            "name": "Gaseosa cola",
            "category_id": category["id"],
            "unit_id": unit["id"],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    ).json()
    product_id = created["product"]["id"]

    response = client.post(
        f"/products/{product_id}/variants",
        json={"label": "1.5 litros"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text


def test_labeling_the_implicit_variant_allows_adding_a_new_one(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Bebidas")
    unit = _create_unit(client, admin_cookies, "Unidad bebida", "ub", False)

    created = client.post(
        "/products",
        json={
            "name": "Gaseosa cola",
            "category_id": category["id"],
            "unit_id": unit["id"],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    ).json()
    product_id = created["product"]["id"]
    implicit_variant_id = created["product"]["variants"][0]["id"]

    label_response = client.patch(
        f"/variants/{implicit_variant_id}",
        json={"label": "1 litro"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert label_response.status_code == 200, label_response.text
    assert label_response.json()["variant"]["is_implicit"] is False

    response = client.post(
        f"/products/{product_id}/variants",
        json={"label": "1.5 litros"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert response.status_code == 201, response.text

    product = client.get(f"/products/{product_id}", cookies=admin_cookies).json()
    labels = {variant["label"] for variant in product["variants"]}
    assert labels == {"1 litro", "1.5 litros"}


def test_update_variant_changes_label_and_attribute_values(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Cintas variante")
    unit = _create_unit(client, admin_cookies, "Metro variante", "mv", True)
    color, values = _get_color_attribute(client, admin_cookies)
    green = next(value for value in values if value["value"] == "Verde")

    created = client.post(
        "/products",
        json={
            "name": "Cinta N 3",
            "category_id": category["id"],
            "unit_id": unit["id"],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    ).json()
    variant_id = created["product"]["variants"][0]["id"]

    response = client.patch(
        f"/variants/{variant_id}",
        json={"label": "Verde brillante", "attribute_value_ids": [green["id"]]},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200, response.text
    body = response.json()["variant"]
    assert body["label"] == "Verde brillante"
    assert body["attribute_value_ids"] == [green["id"]]


def test_create_product_rejects_repeated_attribute_on_same_variant(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Cintas repetidas")
    unit = _create_unit(client, admin_cookies, "Metro repetido", "mr", True)
    color, values = _get_color_attribute(client, admin_cookies)
    red = next(value for value in values if value["value"] == "Rojo")
    blue = next(value for value in values if value["value"] == "Azul")

    response = client.post(
        "/products",
        json={
            "name": "Cinta con dos colores",
            "category_id": category["id"],
            "unit_id": unit["id"],
            "variants": [{"attribute_value_ids": [red["id"], blue["id"]]}],
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422
