from datetime import UTC, datetime
from decimal import Decimal

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import EMPLEADO, GERENTE
from app.core.config import get_settings
from app.db.models import Account, Business, Price, Variant
from app.domain.pricing import prices as pricing_module


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


def _gerente_cookies(client, admin_cookies, user_name="gerente-precios"):
    _create_account(client, admin_cookies, user_name, GERENTE)
    return _login(client, user_name, "Clave-segura-1")


def _empleado_cookies(client, admin_cookies, user_name="empleado-precios"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "Clave-segura-1")


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


def _create_product(client, cookies, name, category_id, unit_id, variants=None):
    payload = {"name": name, "category_id": category_id, "unit_id": unit_id}
    if variants is not None:
        payload["variants"] = variants
    response = client.post(
        "/products", json=payload, cookies=cookies, headers=_auth_headers(cookies)
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


def _set_up_product_with_two_variants(client, admin_cookies, suffix):
    category = _create_category(client, admin_cookies, f"Categoria {suffix}")
    unit = _create_unit(client, admin_cookies, f"Unidad {suffix}", suffix[:3], allows_fraction=True)
    product = _create_product(
        client,
        admin_cookies,
        f"Producto {suffix}",
        category["id"],
        unit["id"],
        variants=[{"label": "Roja"}, {"label": "Azul"}],
    )
    variant_ids = [variant["id"] for variant in product["variants"]]
    return product, variant_ids


def _business_id(db_session):
    return db_session.scalars(sa.select(Business)).first().id


def _admin_account_id(db_session):
    settings = get_settings()
    account = db_session.scalars(
        sa.select(Account).where(Account.user_name == settings.initial_admin_username)
    ).first()
    return account.id


def test_variant_without_current_price_reports_null(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "sinprecio")

    response = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies)

    assert response.status_code == 200, response.text
    assert response.json() == {"variant_id": variant_id, "price": None}


def test_gerente_can_set_initial_price_for_a_variant(client):
    admin_cookies = _admin_cookies(client)
    gerente_cookies = _gerente_cookies(client, admin_cookies)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "inicial")

    response = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "150.00"},
        cookies=gerente_cookies,
        headers=_auth_headers(gerente_cookies),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["amount"] == "150.00"
    assert body["effective_to"] is None
    assert body["variant_id"] == variant_id

    current = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies).json()
    assert current["price"]["amount"] == "150.00"


def test_gerente_sees_author_name_in_price_and_history(client):
    admin_cookies = _admin_cookies(client)
    gerente_cookies = _gerente_cookies(client, admin_cookies)
    _product, variant_id = _set_up_product_with_single_variant(
        client, admin_cookies, "autorgerente"
    )

    change = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "80.00"},
        cookies=gerente_cookies,
        headers=_auth_headers(gerente_cookies),
    )
    assert change.status_code == 200, change.text
    assert change.json()["created_by_account_name"] == "Cuenta de prueba"

    current = client.get(f"/variants/{variant_id}/price", cookies=gerente_cookies)
    assert current.status_code == 200, current.text
    assert current.json()["price"]["created_by_account_name"] == "Cuenta de prueba"

    history = client.get(f"/variants/{variant_id}/prices", cookies=gerente_cookies)
    assert history.status_code == 200, history.text
    assert history.json()[0]["created_by_account_name"] == "Cuenta de prueba"


def test_empleado_cannot_change_price(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "permiso")

    response = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "50.00"},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_empleado_can_read_current_price_and_history(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "lectura")
    client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "60.00"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    current = client.get(f"/variants/{variant_id}/price", cookies=empleado_cookies)
    history = client.get(f"/variants/{variant_id}/prices", cookies=empleado_cookies)

    assert current.status_code == 200
    assert current.json()["price"]["amount"] == "60.00"
    assert history.status_code == 200
    assert len(history.json()) == 1


def test_unauthenticated_request_cannot_read_price(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "anonimo")
    client.cookies.clear()

    response = client.get(f"/variants/{variant_id}/price")

    assert response.status_code == 401


def test_zero_or_negative_price_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "invalido")

    response = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "0.00"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text
    current = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies).json()
    assert current["price"] is None


def _put_variant_price(client, cookies, variant_id, **body):
    return client.put(
        f"/variants/{variant_id}/price",
        json=body,
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def _put_product_price(client, cookies, product_id, delta):
    return client.put(
        f"/products/{product_id}/price",
        json={"delta": delta},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def _current_amount(client, cookies, variant_id):
    price = client.get(f"/variants/{variant_id}/price", cookies=cookies).json()["price"]
    return price["amount"] if price else None


def test_changing_price_by_delta_closes_the_previous_one_and_keeps_history(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "historial")
    first = _put_variant_price(client, admin_cookies, variant_id, amount="100.00").json()

    second = _put_variant_price(client, admin_cookies, variant_id, delta="20.00")

    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["amount"] == "120.00"
    assert second_body["effective_to"] is None

    history = client.get(f"/variants/{variant_id}/prices", cookies=admin_cookies).json()
    assert len(history) == 2
    assert history[0]["id"] == first["id"]
    assert history[0]["amount"] == "100.00"
    assert history[0]["effective_to"] is not None
    assert history[1]["id"] == second_body["id"]
    assert history[1]["effective_to"] is None

    current = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies).json()
    assert current["price"]["id"] == second_body["id"]


def test_negative_delta_subtracts_from_the_current_price(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "resta")
    _put_variant_price(client, admin_cookies, variant_id, amount="1000.00")

    response = _put_variant_price(client, admin_cookies, variant_id, delta="-250.50")

    assert response.status_code == 200, response.text
    assert response.json()["amount"] == "749.50"


def test_price_can_land_exactly_at_the_smallest_allowed_value(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "piso")
    _put_variant_price(client, admin_cookies, variant_id, amount="1000.00")

    response = _put_variant_price(client, admin_cookies, variant_id, delta="-999.99")

    assert response.status_code == 200, response.text
    assert response.json()["amount"] == "0.01"


def test_delta_that_leaves_price_at_zero_or_below_is_rejected_without_changes(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "bajopiso")
    _put_variant_price(client, admin_cookies, variant_id, amount="1000.00")

    at_zero = _put_variant_price(client, admin_cookies, variant_id, delta="-1000")
    below_zero = _put_variant_price(client, admin_cookies, variant_id, delta="-1500")

    assert at_zero.status_code == 422, at_zero.text
    assert at_zero.json()["detail"] == "El precio no puede quedar en cero o menos"
    assert below_zero.status_code == 422, below_zero.text
    assert _current_amount(client, admin_cookies, variant_id) == "1000.00"
    history = client.get(f"/variants/{variant_id}/prices", cookies=admin_cookies).json()
    assert len(history) == 1


def test_zero_delta_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "deltacero")
    _put_variant_price(client, admin_cookies, variant_id, amount="100.00")

    response = _put_variant_price(client, admin_cookies, variant_id, delta="0")

    assert response.status_code == 422, response.text
    assert _current_amount(client, admin_cookies, variant_id) == "100.00"


def test_two_consecutive_deltas_compose(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "componen")
    _put_variant_price(client, admin_cookies, variant_id, amount="100.00")

    _put_variant_price(client, admin_cookies, variant_id, delta="50")
    response = _put_variant_price(client, admin_cookies, variant_id, delta="-30")

    assert response.status_code == 200, response.text
    assert response.json()["amount"] == "120.00"


def test_delta_without_a_current_price_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "sinvigente")

    response = _put_variant_price(client, admin_cookies, variant_id, delta="10")

    assert response.status_code == 422, response.text
    assert response.json()["detail"] == (
        "La variante todavía no tiene precio: cargá el precio inicial"
    )
    assert _current_amount(client, admin_cookies, variant_id) is None


def test_initial_amount_is_rejected_when_a_current_price_exists(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "yatiene")
    _put_variant_price(client, admin_cookies, variant_id, amount="100.00")

    response = _put_variant_price(client, admin_cookies, variant_id, amount="999.00")

    assert response.status_code == 422, response.text
    assert _current_amount(client, admin_cookies, variant_id) == "100.00"


def test_price_change_requires_exactly_one_of_delta_or_amount(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "exacto")

    neither = _put_variant_price(client, admin_cookies, variant_id)
    both = _put_variant_price(client, admin_cookies, variant_id, delta="5", amount="10")

    assert neither.status_code == 422, neither.text
    assert both.status_code == 422, both.text
    assert _current_amount(client, admin_cookies, variant_id) is None


@pytest.mark.parametrize("value", ["1.005", "99999999999.00", "-99999999999.00"])
def test_delta_with_too_many_decimals_or_out_of_range_is_rejected(client, value):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "rango")
    _put_variant_price(client, admin_cookies, variant_id, amount="100.00")

    response = _put_variant_price(client, admin_cookies, variant_id, delta=value)

    assert response.status_code == 422, response.text
    assert _current_amount(client, admin_cookies, variant_id) == "100.00"


def test_delta_that_overflows_the_column_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "desborde")
    _put_variant_price(client, admin_cookies, variant_id, amount="9999999999.00")

    response = _put_variant_price(client, admin_cookies, variant_id, delta="5000000000.00")

    assert response.status_code == 422, response.text
    assert _current_amount(client, admin_cookies, variant_id) == "9999999999.00"


def test_two_variants_of_the_same_product_keep_independent_prices(client):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "independiente"
    )

    _put_variant_price(client, admin_cookies, red_id, amount="30.00")
    _put_variant_price(client, admin_cookies, blue_id, amount="45.00")

    assert _current_amount(client, admin_cookies, red_id) == "30.00"
    assert _current_amount(client, admin_cookies, blue_id) == "45.00"


def test_change_product_price_applies_the_delta_to_every_priced_variant(client):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(client, admin_cookies, "lote")
    _put_variant_price(client, admin_cookies, red_id, amount="30.00")
    _put_variant_price(client, admin_cookies, blue_id, amount="45.00")

    response = _put_product_price(client, admin_cookies, product["id"], "10.50")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["skipped_variant_ids"] == []
    amounts = {price["variant_id"]: price["amount"] for price in body["prices"]}
    assert amounts == {red_id: "40.50", blue_id: "55.50"}
    assert _current_amount(client, admin_cookies, red_id) == "40.50"
    assert _current_amount(client, admin_cookies, blue_id) == "55.50"


def test_change_product_price_with_negative_delta_subtracts(client):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(client, admin_cookies, "restal")
    _put_variant_price(client, admin_cookies, red_id, amount="30.00")
    _put_variant_price(client, admin_cookies, blue_id, amount="45.00")

    response = _put_product_price(client, admin_cookies, product["id"], "-10")

    assert response.status_code == 200, response.text
    assert _current_amount(client, admin_cookies, red_id) == "20.00"
    assert _current_amount(client, admin_cookies, blue_id) == "35.00"


def test_change_product_price_is_all_or_nothing_when_one_variant_breaks_the_floor(client):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "todonada"
    )
    _put_variant_price(client, admin_cookies, red_id, amount="100.00")
    _put_variant_price(client, admin_cookies, blue_id, amount="20.00")

    response = _put_product_price(client, admin_cookies, product["id"], "-50")

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert "Azul" in detail
    assert "Roja" not in detail
    assert _current_amount(client, admin_cookies, red_id) == "100.00"
    assert _current_amount(client, admin_cookies, blue_id) == "20.00"
    assert len(client.get(f"/variants/{red_id}/prices", cookies=admin_cookies).json()) == 1


def test_change_product_price_skips_and_reports_variants_without_a_price(client):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "omitidas"
    )
    _put_variant_price(client, admin_cookies, red_id, amount="30.00")

    response = _put_product_price(client, admin_cookies, product["id"], "5")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["skipped_variant_ids"] == [blue_id]
    assert [price["variant_id"] for price in body["prices"]] == [red_id]
    assert _current_amount(client, admin_cookies, red_id) == "35.00"
    assert _current_amount(client, admin_cookies, blue_id) is None


def test_change_product_price_fails_when_no_active_variant_has_a_price(client):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "ningunaconprecio"
    )

    response = _put_product_price(client, admin_cookies, product["id"], "5")

    assert response.status_code == 422, response.text
    assert _current_amount(client, admin_cookies, red_id) is None
    assert _current_amount(client, admin_cookies, blue_id) is None


def test_change_product_price_rejects_a_zero_delta(client):
    admin_cookies = _admin_cookies(client)
    product, (red_id, _blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "lotecero"
    )
    _put_variant_price(client, admin_cookies, red_id, amount="30.00")

    response = _put_product_price(client, admin_cookies, product["id"], "0")

    assert response.status_code == 422, response.text


def test_change_product_price_ignores_inactive_variants(client, db_session):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "inactiva"
    )
    _put_variant_price(client, admin_cookies, red_id, amount="30.00")
    _put_variant_price(client, admin_cookies, blue_id, amount="45.00")

    inactive_variant = db_session.get(Variant, blue_id)
    inactive_variant.status = "inactive"
    db_session.commit()

    response = _put_product_price(client, admin_cookies, product["id"], "3")

    assert response.status_code == 200, response.text
    body = response.json()
    assert [price["variant_id"] for price in body["prices"]] == [red_id]
    assert body["skipped_variant_ids"] == []
    assert _current_amount(client, admin_cookies, blue_id) == "45.00"


def test_change_product_price_fails_when_no_active_variants_remain(client, db_session):
    admin_cookies = _admin_cookies(client)
    product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "sinactivas")

    only_variant = db_session.get(Variant, variant_id)
    only_variant.status = "inactive"
    db_session.commit()

    response = _put_product_price(client, admin_cookies, product["id"], "10")

    assert response.status_code == 422, response.text


def test_change_product_price_is_atomic_when_a_variant_fails_mid_operation(
    client, db_session, monkeypatch
):
    admin_cookies = _admin_cookies(client)
    product, (red_id, blue_id) = _set_up_product_with_two_variants(client, admin_cookies, "atomico")
    _put_variant_price(client, admin_cookies, red_id, amount="30.00")
    _put_variant_price(client, admin_cookies, blue_id, amount="45.00")
    business_id = _business_id(db_session)
    admin_account_id = _admin_account_id(db_session)

    original_apply = pricing_module._apply_price_change
    calls = {"count": 0}

    def _flaky_apply(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 2:
            raise RuntimeError("fallo simulado a mitad de la operacion")
        return original_apply(*args, **kwargs)

    monkeypatch.setattr(pricing_module, "_apply_price_change", _flaky_apply)

    with pytest.raises(RuntimeError):
        pricing_module.change_product_price(
            db_session, product["id"], business_id, Decimal("5.00"), admin_account_id
        )
    db_session.rollback()

    red_price = pricing_module.get_current_price_for_variant(db_session, red_id, business_id)
    blue_price = pricing_module.get_current_price_for_variant(db_session, blue_id, business_id)
    assert red_price.amount == Decimal("30.00")
    assert blue_price.amount == Decimal("45.00")


def test_price_amount_is_stored_as_an_exact_decimal(client, db_session):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "decimal")

    client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "19.99"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    stored_amount = db_session.execute(
        sa.text("SELECT amount FROM price WHERE variant_id = :variant_id"),
        {"variant_id": variant_id},
    ).scalar_one()
    assert stored_amount == Decimal("19.99")


def test_database_rejects_a_second_current_price_for_the_same_variant_and_business(
    client, db_session
):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "indice")
    business_id = _business_id(db_session)
    admin_account_id = _admin_account_id(db_session)
    now = datetime.now(UTC)

    db_session.add(
        Price(
            variant_id=variant_id,
            business_id=business_id,
            amount=Decimal("10.00"),
            effective_from=now,
            effective_to=None,
            created_by_account_id=admin_account_id,
            created_at=now,
        )
    )
    db_session.commit()

    db_session.add(
        Price(
            variant_id=variant_id,
            business_id=business_id,
            amount=Decimal("20.00"),
            effective_from=now,
            effective_to=None,
            created_by_account_id=admin_account_id,
            created_at=now,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_database_rejects_a_non_positive_amount(client, db_session):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "montocero")
    business_id = _business_id(db_session)
    admin_account_id = _admin_account_id(db_session)
    now = datetime.now(UTC)

    db_session.add(
        Price(
            variant_id=variant_id,
            business_id=business_id,
            amount=Decimal("0.00"),
            effective_from=now,
            effective_to=None,
            created_by_account_id=admin_account_id,
            created_at=now,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
