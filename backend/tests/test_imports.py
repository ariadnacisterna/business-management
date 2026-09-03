import io

from openpyxl import Workbook

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import EMPLEADO, GERENTE
from app.core.config import get_settings
from app.db.models import Account, ImportRun, Product


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


def _gerente_cookies(client, admin_cookies, user_name="gerente-import"):
    _create_account(client, admin_cookies, user_name, GERENTE)
    return _login(client, user_name, "clave-segura-1")


def _empleado_cookies(client, admin_cookies, user_name="empleado-import"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "clave-segura-1")


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


def _create_product(client, cookies, name, category_id, unit_id, variants=None):
    payload = {"name": name, "category_id": category_id, "unit_id": unit_id}
    if variants is not None:
        payload["variants"] = variants
    response = client.post(
        "/products", json=payload, cookies=cookies, headers=_auth_headers(cookies)
    )
    assert response.status_code == 201, response.text
    return response.json()["product"]


def _csv_file(text, filename="catalogo.csv"):
    return {"file": (filename, text.encode("utf-8"), "text/csv")}


def _xlsx_file(rows, filename="catalogo.xlsx"):
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return {
        "file": (
            filename,
            buffer.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }


def _preview(client, cookies, files):
    return client.post("/imports/preview", files=files, cookies=cookies)


def _confirm(client, cookies, files):
    return client.post("/imports", files=files, cookies=cookies, headers=_auth_headers(cookies))


BASIC_HEADER = "category,product_name,unit,variant_label,attributes,price\n"


def test_preview_of_new_catalog_classifies_rows_as_new_and_lists_taxonomy_alta(client):
    admin_cookies = _admin_cookies(client)
    csv_text = (
        BASIC_HEADER
        + "Cintas,Cinta Bebe N2,Metro,Rojo,color=Rojo,150.50\n"
        + "Cintas,Cinta Bebe N2,Metro,Azul,color=Azul,150.50\n"
        + "Libreria,Cuaderno Tapa Dura,Unidad,,,899.00\n"
    )

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == {
        "total_rows": 3,
        "new_count": 3,
        "update_count": 0,
        "duplicate_count": 0,
        "warning_count": 3,
        "error_count": 0,
        "can_confirm": True,
    }
    assert set(body["taxonomy"]["categories"]) == {"Cintas", "Libreria"}
    assert set(body["taxonomy"]["units"]) == {"Metro", "Unidad"}
    assert all(row["outcome"] == "new" for row in body["rows"])


def test_preview_does_not_modify_the_catalog(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))
    assert response.status_code == 200, response.text

    assert client.get("/categories", cookies=admin_cookies).json() == []
    assert client.get("/units", cookies=admin_cookies).json() == []
    assert client.get("/products", cookies=admin_cookies).json() == []


def test_confirm_creates_taxonomy_products_variants_and_prices(client, db_session):
    admin_cookies = _admin_cookies(client)
    csv_text = (
        BASIC_HEADER
        + "Cintas,Cinta Bebe N2,Metro,Rojo,color=Rojo,150.50\n"
        + "Cintas,Cinta Bebe N2,Metro,Azul,color=Azul,150.50\n"
        + "Libreria,Cuaderno Tapa Dura,Unidad,,,899.00\n"
    )

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 201, response.text
    run = response.json()["import_run"]
    assert run["row_count"] == 3
    assert run["created_categories_count"] == 2
    assert run["created_units_count"] == 2
    assert run["created_products_count"] == 2
    assert run["created_variants_count"] == 3
    assert run["updated_variants_count"] == 0

    products = client.get("/products", cookies=admin_cookies).json()
    names = {product["name"] for product in products}
    assert names == {"Cinta Bebe N2", "Cuaderno Tapa Dura"}
    cuaderno = next(p for p in products if p["name"] == "Cuaderno Tapa Dura")
    assert cuaderno["variants"][0]["is_implicit"] is True
    assert cuaderno["variants"][0]["label"] is None

    stored_run = db_session.get(ImportRun, run["id"])
    settings = get_settings()
    admin_account = (
        db_session.query(Account).filter_by(user_name=settings.initial_admin_username).one()
    )
    assert stored_run.created_by_account_id == admin_account.id
    assert stored_run.created_at is not None
    assert stored_run.file_name == "catalogo.csv"


def test_two_new_products_sharing_a_new_category_and_unit_create_each_only_once(client):
    admin_cookies = _admin_cookies(client)
    csv_text = (
        BASIC_HEADER + "Ferreteria,Tornillo,Caja,,,25.00\n" + "Ferreteria,Tuerca,Caja,,,12.50\n"
    )

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 201, response.text
    run = response.json()["import_run"]
    assert run["created_categories_count"] == 1
    assert run["created_units_count"] == 1
    assert run["created_products_count"] == 2
    categories = client.get("/categories", cookies=admin_cookies).json()
    units = client.get("/units", cookies=admin_cookies).json()
    assert len(categories) == 1
    assert len(units) == 1


def test_reimporting_with_a_changed_price_previews_the_update_with_both_amounts(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,Rojo,color=Rojo,150.50\n"
    first = _confirm(client, admin_cookies, _csv_file(csv_text))
    assert first.status_code == 201, first.text

    changed_csv = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,Rojo,color=Rojo,175.00\n"
    response = _preview(client, admin_cookies, _csv_file(changed_csv))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["new_count"] == 0
    assert body["summary"]["update_count"] == 1
    assert body["taxonomy"] == {"categories": [], "units": [], "attribute_values": []}
    row = body["rows"][0]
    assert row["warnings"] == []
    assert row["current_price"] == "150.50"
    assert row["price"] == "175.00"


def test_reimport_with_unchanged_price_does_not_add_price_history(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"
    _confirm(client, admin_cookies, _csv_file(csv_text))
    product = client.get("/products", cookies=admin_cookies).json()[0]
    variant_id = product["variants"][0]["id"]
    before = client.get(f"/variants/{variant_id}/prices", cookies=admin_cookies).json()

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 201, response.text
    assert response.json()["import_run"]["updated_variants_count"] == 0
    after = client.get(f"/variants/{variant_id}/prices", cookies=admin_cookies).json()
    assert len(after) == len(before) == 1


def test_reimport_with_changed_price_updates_it_and_keeps_history(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"
    _confirm(client, admin_cookies, _csv_file(csv_text))
    product = client.get("/products", cookies=admin_cookies).json()[0]
    variant_id = product["variants"][0]["id"]

    changed_csv = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,175.00\n"
    response = _confirm(client, admin_cookies, _csv_file(changed_csv))

    assert response.status_code == 201, response.text
    assert response.json()["import_run"]["updated_variants_count"] == 1
    history = client.get(f"/variants/{variant_id}/prices", cookies=admin_cookies).json()
    assert len(history) == 2
    current = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies).json()
    assert current["price"]["amount"] == "175.00"


def test_invalid_price_is_reported_with_row_field_and_reason(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Papeleria,Lapiz,Unidad,,,-5.00\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    row = response.json()["rows"][0]
    assert row["row_number"] == 2
    assert row["is_valid"] is False
    assert row["errors"] == [
        {"field": "price", "reason": "El precio debe ser estrictamente mayor que cero"}
    ]
    assert response.json()["summary"]["can_confirm"] is False


def test_nonexistent_attribute_type_is_a_row_error(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Bazar,Taza,Unidad,,material=Ceramica,30.00\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    row = response.json()["rows"][0]
    assert row["is_valid"] is False
    assert row["errors"] == [{"field": "attributes", "reason": "El atributo 'material' no existe"}]


def test_new_attribute_value_is_created_as_taxonomy_alta(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Cintas,Cinta Turquesa,Metro,,color=Turquesa,80.00\n"

    preview = _preview(client, admin_cookies, _csv_file(csv_text))
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["taxonomy"]["attribute_values"] == [
        {"attribute_name": "color", "value": "Turquesa"}
    ]
    assert body["rows"][0]["is_valid"] is True

    confirm = _confirm(client, admin_cookies, _csv_file(csv_text))
    assert confirm.status_code == 201, confirm.text
    assert confirm.json()["import_run"]["created_attribute_values_count"] == 1

    color_attribute = next(
        a for a in client.get("/attributes", cookies=admin_cookies).json() if a["name"] == "color"
    )
    values = client.get(f"/attributes/{color_attribute['id']}/values", cookies=admin_cookies).json()
    assert any(v["value"] == "Turquesa" for v in values)


def test_repeated_rows_in_the_same_file_are_reported_as_errors(client):
    admin_cookies = _admin_cookies(client)
    csv_text = (
        BASIC_HEADER + "Bazar,Vaso,Unidad,Chico,,10.00\n" + "Bazar,vaso,Unidad,chico,,20.00\n"
    )

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert rows[0]["is_valid"] is True
    assert rows[1]["is_valid"] is False
    assert rows[1]["errors"] == [
        {"field": "variant_label", "reason": "Fila repetida: coincide con la fila 2"}
    ]
    assert response.json()["summary"]["can_confirm"] is False


def test_blank_variant_label_is_required_when_product_has_more_than_one_row(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Bazar,Plato,Unidad,,,15.00\n" + "Bazar,Plato,Unidad,Hondo,,18.00\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    row = response.json()["rows"][0]
    assert row["is_valid"] is False
    assert any(error["field"] == "variant_label" for error in row["errors"])


def test_single_row_product_with_blank_label_becomes_an_implicit_variant(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Bazar,Escoba,Unidad,,,20.00\n"

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 201, response.text
    product = client.get("/products", cookies=admin_cookies).json()[0]
    assert product["variants"][0]["is_implicit"] is True


def test_confirm_is_atomic_and_applies_nothing_when_one_row_is_invalid(client, db_session):
    admin_cookies = _admin_cookies(client)
    csv_text = (
        BASIC_HEADER + "Papeleria,Resma A4,Paquete,,,500.00\n" + "Papeleria,Lapiz,Unidad,,,-5.00\n"
    )

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 422, response.text
    assert client.get("/products", cookies=admin_cookies).json() == []
    assert client.get("/categories", cookies=admin_cookies).json() == []
    assert client.get("/units", cookies=admin_cookies).json() == []
    assert db_session.query(Product).count() == 0


def test_confirm_validates_independently_without_a_prior_preview_call(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Papeleria,Lapiz,Unidad,,,0.00\n"

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["rows"][0]["errors"][0]["field"] == "price"


def _assert_row_was_not_treated_as_an_unrelated_brand_new_product(row):
    assert row["is_valid"] is True
    if row["outcome"] == "update":
        assert row["possible_duplicates"] == []
    else:
        assert row["outcome"] == "new"
        assert len(row["possible_duplicates"]) == 1


def test_row_matching_two_pre_existing_same_named_products_updates_or_flags_duplicate(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Merceria")
    unit = _create_unit(client, admin_cookies, "Metro merceria", "mm")
    _create_product(
        client,
        admin_cookies,
        "Cinta Bebe N 2",
        category["id"],
        unit["id"],
        variants=[{"label": "Verde"}],
    )
    _create_product(
        client,
        admin_cookies,
        "cinta bebe n 2",
        category["id"],
        unit["id"],
        variants=[{"label": "Amarillo"}],
    )
    csv_text = BASIC_HEADER + "Merceria,Cinta bebe N 2,Metro merceria,Amarillo,,60.00\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    _assert_row_was_not_treated_as_an_unrelated_brand_new_product(response.json()["rows"][0])


def test_adding_a_new_variant_to_a_product_with_an_unlabeled_implicit_variant_is_an_error(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Libreria")
    unit = _create_unit(client, admin_cookies, "Unidad libreria", "ul")
    _create_product(client, admin_cookies, "Cuaderno Tapa Dura", category["id"], unit["id"])
    csv_text = BASIC_HEADER + "Libreria,Cuaderno Tapa Dura,Unidad libreria,Con espiral,,950.00\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 200, response.text
    row = response.json()["rows"][0]
    assert row["is_valid"] is False
    assert any("variante implicita sin nombre" in error["reason"] for error in row["errors"])


def test_adding_a_new_labeled_variant_to_an_existing_labeled_product(client):
    admin_cookies = _admin_cookies(client)
    category = _create_category(client, admin_cookies, "Cintas existentes")
    unit = _create_unit(client, admin_cookies, "Metro existente", "me")
    product = _create_product(
        client,
        admin_cookies,
        "Cinta N3",
        category["id"],
        unit["id"],
        variants=[{"label": "Rojo"}],
    )
    csv_text = BASIC_HEADER + "Cintas existentes,Cinta N3,Metro existente,Verde,,60.00\n"

    response = _confirm(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 201, response.text
    assert response.json()["import_run"]["created_variants_count"] == 1
    assert response.json()["import_run"]["created_products_count"] == 0
    refreshed = client.get(f"/products/{product['id']}", cookies=admin_cookies).json()
    labels = {v["label"] for v in refreshed["variants"]}
    assert labels == {"Rojo", "Verde"}


def test_gerente_cannot_import(client):
    admin_cookies = _admin_cookies(client)
    gerente_cookies = _gerente_cookies(client, admin_cookies)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"

    preview = _preview(client, gerente_cookies, _csv_file(csv_text))
    confirm = _confirm(client, gerente_cookies, _csv_file(csv_text))

    assert preview.status_code == 403
    assert confirm.status_code == 403


def test_empleado_cannot_import(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"

    preview = _preview(client, empleado_cookies, _csv_file(csv_text))
    confirm = _confirm(client, empleado_cookies, _csv_file(csv_text))

    assert preview.status_code == 403
    assert confirm.status_code == 403


def test_unauthenticated_request_cannot_preview_or_confirm(client):
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"

    preview = client.post("/imports/preview", files=_csv_file(csv_text))
    confirm = client.post("/imports", files=_csv_file(csv_text))

    assert preview.status_code == 401
    assert confirm.status_code == 401


def test_confirm_without_csrf_token_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Cintas,Cinta Bebe N2,Metro,,,150.50\n"

    response = client.post("/imports", files=_csv_file(csv_text), cookies=admin_cookies)

    assert response.status_code == 403
    assert client.get("/products", cookies=admin_cookies).json() == []


def test_missing_required_column_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    csv_text = "product_name,unit,price\nLapiz,Unidad,10\n"

    response = _preview(client, admin_cookies, _csv_file(csv_text))

    assert response.status_code == 422
    assert "category" in response.json()["detail"]


def test_cp1252_encoded_csv_from_windows_excel_is_accepted(client):
    admin_cookies = _admin_cookies(client)
    csv_text = BASIC_HEADER + "Merceria,Cinta bebé ñandú,Metro,,,150.50\n"
    files = {"file": ("catalogo.csv", csv_text.encode("cp1252"), "text/csv")}

    response = _preview(client, admin_cookies, files)

    assert response.status_code == 200, response.text
    row = response.json()["rows"][0]
    assert row["is_valid"] is True
    assert row["product_name"] == "Cinta bebé ñandú"


def test_csv_with_unrecognizable_encoding_is_rejected_with_a_clear_message(client):
    admin_cookies = _admin_cookies(client)
    invalid_bytes = BASIC_HEADER.encode("utf-8") + b"Merceria,Cinta \x81,Metro,,,150.50\n"
    files = {"file": ("catalogo.csv", invalid_bytes, "text/csv")}

    response = _preview(client, admin_cookies, files)

    assert response.status_code == 422, response.text
    assert "UTF-8" in response.json()["detail"]


def test_unsupported_file_extension_is_rejected(client):
    admin_cookies = _admin_cookies(client)

    response = _preview(
        client, admin_cookies, {"file": ("catalogo.txt", b"whatever", "text/plain")}
    )

    assert response.status_code == 422


def test_file_with_only_a_header_is_rejected(client):
    admin_cookies = _admin_cookies(client)

    response = _preview(client, admin_cookies, _csv_file(BASIC_HEADER))

    assert response.status_code == 422


def test_excel_file_is_accepted_and_imported(client):
    admin_cookies = _admin_cookies(client)
    rows = [
        ["category", "product_name", "unit", "variant_label", "attributes", "price"],
        ["Ferreteria", "Tornillo", "Caja", None, None, 25],
        ["Ferreteria", "Tuerca", "Caja", None, None, 12.5],
    ]

    preview = _preview(client, admin_cookies, _xlsx_file(rows))
    assert preview.status_code == 200, preview.text
    assert preview.json()["summary"]["new_count"] == 2

    confirm = _confirm(client, admin_cookies, _xlsx_file(rows))
    assert confirm.status_code == 201, confirm.text
    products = client.get("/products", cookies=admin_cookies).json()
    assert {p["name"] for p in products} == {"Tornillo", "Tuerca"}
