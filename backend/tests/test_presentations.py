from decimal import Decimal
from types import SimpleNamespace

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.constants.access import CSRF_HEADER_NAME
from app.core.config import get_settings
from app.domain.audit.integrity import find_integrity_problems
from app.domain.catalog.quantities import format_stock_amount

ROLL = {"name": "rollo", "plural_name": "rollos", "quantity": "50"}


def _admin_cookies(client):
    settings = get_settings()
    response = client.post(
        "/auth/login",
        json={
            "user_name": settings.initial_admin_username,
            "password": settings.initial_admin_password,
        },
    )
    assert response.status_code == 200, response.text
    return response.cookies


def _headers(cookies):
    return {CSRF_HEADER_NAME: cookies["csrf_token"]}


def _post(client, cookies, path, payload):
    return client.post(path, json=payload, cookies=cookies, headers=_headers(cookies))


def _patch(client, cookies, path, payload):
    return client.patch(path, json=payload, cookies=cookies, headers=_headers(cookies))


def _unit(client, cookies, name, abbreviation, allows_fraction):
    response = _post(
        client,
        cookies,
        "/units",
        {"name": name, "abbreviation": abbreviation, "allows_fraction": allows_fraction},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _product(client, cookies, name, presentation=ROLL, allows_fraction=True):
    category = _post(client, cookies, "/categories", {"name": f"Categoria {name}"}).json()
    unit = _unit(client, cookies, f"Metro {name}", "m", allows_fraction)
    payload = {"name": name, "category_id": category["id"], "unit_id": unit["id"]}
    if presentation is not None:
        payload["presentation"] = presentation
    return _post(client, cookies, "/products", payload), unit


def _created(client, cookies, name, presentation=ROLL, allows_fraction=True):
    response, unit = _product(client, cookies, name, presentation, allows_fraction)
    assert response.status_code == 201, response.text
    product = response.json()["product"]
    return product, product["variants"][0]["id"], unit


def _adjust(client, cookies, variant_id, delta, in_presentations=False, presentation_quantity=None):
    payload = {"delta": delta, "in_presentations": in_presentations}
    if presentation_quantity is not None:
        payload["presentation_quantity"] = presentation_quantity
    return _post(client, cookies, f"/variants/{variant_id}/stock/adjustments", payload)


def _quantity(client, cookies, variant_id):
    return Decimal(client.get(f"/variants/{variant_id}/stock", cookies=cookies).json()["quantity"])


def test_product_is_created_with_a_presentation_and_lists_it(client):
    cookies = _admin_cookies(client)
    product, _variant_id, _unit_row = _created(client, cookies, "Cinta raso")

    assert product["presentation"] == {
        "name": "rollo",
        "plural_name": "rollos",
        "quantity": "50.000",
    }
    rows = client.get("/stock", params={"search": "Cinta raso"}, cookies=cookies).json()["items"]
    assert rows[0]["presentation"]["plural_name"] == "rollos"


def test_product_without_presentation_keeps_working_as_before(client):
    cookies = _admin_cookies(client)
    product, variant_id, _unit_row = _created(client, cookies, "Hilo suelto", presentation=None)

    assert product["presentation"] is None
    assert _adjust(client, cookies, variant_id, "3").status_code == 201
    assert _quantity(client, cookies, variant_id) == Decimal(3)


@pytest.mark.parametrize(
    ("presentation", "allows_fraction", "message"),
    [
        ({**ROLL, "quantity": "0"}, True, "mayor que cero"),
        ({**ROLL, "quantity": "-5"}, True, "mayor que cero"),
        ({**ROLL, "quantity": "2.5"}, False, "no admite decimales"),
        ({**ROLL, "quantity": "2.0005"}, True, "decimales"),
        ({**ROLL, "name": "  "}, True, "singular y en plural"),
        ({**ROLL, "plural_name": ""}, True, "singular y en plural"),
        ({**ROLL, "name": "r" * 51}, True, "hasta 50 letras"),
    ],
)
def test_invalid_presentation_is_rejected(client, presentation, allows_fraction, message):
    cookies = _admin_cookies(client)
    response, _unit_row = _product(client, cookies, "Cinta invalida", presentation, allows_fraction)

    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_adjust_in_presentations_and_in_loose_units(client):
    cookies = _admin_cookies(client)
    _product_data, variant_id, _unit_row = _created(client, cookies, "Cinta gros")

    response = _adjust(client, cookies, variant_id, "2", True, "50")
    assert response.status_code == 201, response.text
    assert Decimal(response.json()["quantity_after"]) == Decimal(100)

    response = _adjust(client, cookies, variant_id, "-12")
    assert response.status_code == 201, response.text
    assert _quantity(client, cookies, variant_id) == Decimal(88)


def test_presentations_must_be_whole_numbers(client):
    cookies = _admin_cookies(client)
    _product_data, variant_id, _unit_row = _created(client, cookies, "Cinta media")

    response = _adjust(client, cookies, variant_id, "1.5", True, "50")

    assert response.status_code == 422
    assert "rollos se cargan en números enteros" in response.json()["detail"]


def test_presentations_need_the_length_seen_on_screen(client):
    cookies = _admin_cookies(client)
    _product_data, variant_id, _unit_row = _created(client, cookies, "Cinta sin largo")

    response = _adjust(client, cookies, variant_id, "1", True)

    assert response.status_code == 422
    assert _quantity(client, cookies, variant_id) == 0


def test_adjust_in_presentations_without_presentation_is_rejected(client):
    cookies = _admin_cookies(client)
    _product_data, variant_id, _unit_row = _created(
        client, cookies, "Cinta comun", presentation=None
    )

    response = _adjust(client, cookies, variant_id, "1", True)

    assert response.status_code == 422
    assert "no tiene presentación" in response.json()["detail"]
    assert _quantity(client, cookies, variant_id) == 0


def test_adjust_with_an_outdated_presentation_is_rejected(client):
    cookies = _admin_cookies(client)
    product, variant_id, _unit_row = _created(client, cookies, "Cinta cambiada")
    _patch(
        client, cookies, f"/products/{product['id']}", {"presentation": {**ROLL, "quantity": "25"}}
    )

    response = _adjust(client, cookies, variant_id, "1", True, "50")

    assert response.status_code == 409
    assert "La presentación de este producto cambió" in response.json()["detail"]
    assert _quantity(client, cookies, variant_id) == 0


def test_floor_message_shows_presentations_and_loose_units(client):
    cookies = _admin_cookies(client)
    _product_data, variant_id, _unit_row = _created(client, cookies, "Cinta piso")
    _adjust(client, cookies, variant_id, "88")

    response = _adjust(client, cookies, variant_id, "-2", True, "50")

    assert response.status_code == 422
    assert response.json()["detail"] == "No podés descontar más de lo que hay (1 rollo y 38 m)"
    assert _quantity(client, cookies, variant_id) == Decimal(88)


def test_minimum_stock_in_presentations(client):
    cookies = _admin_cookies(client)
    _product_data, variant_id, _unit_row = _created(client, cookies, "Cinta minimo")
    path = f"/variants/{variant_id}/stock/minimum"

    response = _patch(
        client,
        cookies,
        path,
        {"minimum_quantity": "2", "in_presentations": True, "presentation_quantity": "50"},
    )
    assert response.status_code == 200, response.text
    assert Decimal(response.json()["minimum_quantity"]) == Decimal(100)

    response = _patch(
        client,
        cookies,
        path,
        {"minimum_quantity": "0.5", "in_presentations": True, "presentation_quantity": "50"},
    )
    assert response.status_code == 422


def test_changing_or_removing_the_presentation_keeps_the_stored_quantity(client):
    cookies = _admin_cookies(client)
    product, variant_id, _unit_row = _created(client, cookies, "Cinta editada")
    _adjust(client, cookies, variant_id, "150")
    path = f"/products/{product['id']}"

    response = _patch(client, cookies, path, {"presentation": {**ROLL, "quantity": "100"}})
    assert response.status_code == 200, response.text
    assert response.json()["presentation"]["quantity"] == "100.000"
    assert _quantity(client, cookies, variant_id) == Decimal(150)

    response = _patch(client, cookies, path, {"name": "Cinta editada bis"})
    assert response.json()["presentation"]["quantity"] == "100.000"

    response = _patch(client, cookies, path, {"presentation": None})
    assert response.status_code == 200, response.text
    assert response.json()["presentation"] is None
    assert _quantity(client, cookies, variant_id) == Decimal(150)


def test_unit_change_is_blocked_by_a_presentation_with_decimals(client):
    cookies = _admin_cookies(client)
    product, _variant_id, unit = _created(
        client, cookies, "Cinta decimal", presentation={**ROLL, "quantity": "2.5"}
    )
    whole_unit = _unit(client, cookies, "Rollo entero presentacion", "r", False)

    response = _patch(client, cookies, f"/products/{product['id']}", {"unit_id": whole_unit["id"]})
    assert response.status_code == 409

    response = _patch(client, cookies, f"/units/{unit['id']}", {"allows_fraction": False})
    assert response.status_code == 409
    assert "Cinta decimal" in response.json()["detail"]


def test_presentation_is_validated_against_the_new_unit_when_both_change(client):
    cookies = _admin_cookies(client)
    product, _variant_id, _unit_row = _created(client, cookies, "Cinta doble cambio")
    whole_unit = _unit(client, cookies, "Unidad doble cambio", "u", False)

    response = _patch(
        client,
        cookies,
        f"/products/{product['id']}",
        {"unit_id": whole_unit["id"], "presentation": {**ROLL, "quantity": "2.5"}},
    )

    assert response.status_code == 422
    assert "no admite decimales" in response.json()["detail"]


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE product SET presentation_quantity = 0 WHERE id = :id",
        "UPDATE product SET presentation_name = NULL WHERE id = :id",
    ],
)
def test_database_rejects_an_incomplete_or_non_positive_presentation(client, db_session, statement):
    cookies = _admin_cookies(client)
    product, _variant_id, _unit_row = _created(client, cookies, "Cinta base")

    with pytest.raises(IntegrityError):
        db_session.execute(sa.text(statement), {"id": product["id"]})
        db_session.flush()
    db_session.rollback()


def test_integrity_reports_a_presentation_with_decimals_in_a_whole_unit(client, db_session):
    cookies = _admin_cookies(client)
    _product_data, _variant_id, unit = _created(
        client, cookies, "Cinta integridad presentacion", presentation={**ROLL, "quantity": "2.5"}
    )
    db_session.execute(
        sa.text("UPDATE unit SET allows_fraction = false WHERE id = :id"), {"id": unit["id"]}
    )
    db_session.commit()

    descriptions = [problem.description for problem in find_integrity_problems(db_session)]

    assert descriptions == [
        'Producto "Cinta integridad presentacion": la presentación "rollo" de 2.5 no es válida '
        'para la unidad "Metro Cinta integridad presentacion" (tiene que ser mayor que cero y '
        "respetar sus decimales)."
    ]


@pytest.mark.parametrize(
    ("quantity", "expected"),
    [
        ("138", "2 rollos y 38 m"),
        ("150", "3 rollos"),
        ("50", "1 rollo"),
        ("38", "38 m"),
        ("88.5", "1 rollo y 38.5 m"),
        ("0", "0 rollos"),
    ],
)
def test_format_stock_amount(quantity, expected):
    product = SimpleNamespace(
        presentation_name="rollo",
        presentation_plural_name="rollos",
        presentation_quantity=Decimal(50),
    )

    assert format_stock_amount(Decimal(quantity), product, SimpleNamespace(abbreviation="m")) == (
        expected
    )


def test_format_stock_amount_without_presentation_is_the_plain_quantity():
    product = SimpleNamespace(presentation_quantity=None)

    assert format_stock_amount(Decimal("12.500"), product, SimpleNamespace(abbreviation="m")) == (
        "12.5"
    )
