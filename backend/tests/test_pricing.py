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
            "initial_password": "clave-segura-1",
            "role": role,
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _gerente_cookies(client, admin_cookies, user_name="gerente-precios"):
    _create_account(client, admin_cookies, user_name, GERENTE)
    return _login(client, user_name, "clave-segura-1")


def _empleado_cookies(client, admin_cookies, user_name="empleado-precios"):
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
        json={"amount": "150.00", "expected_current_price_id": None},
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


def test_empleado_cannot_change_price(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "permiso")

    response = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "50.00", "expected_current_price_id": None},
        cookies=empleado_cookies,
        headers=_auth_headers(empleado_cookies),
    )

    assert response.status_code == 403


def test_empleado_can_read_current_price_and_history(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "lectura")
    client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "60.00", "expected_current_price_id": None},
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
        json={"amount": "0.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text
    current = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies).json()
    assert current["price"] is None


def test_changing_price_closes_the_previous_one_and_keeps_history(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "historial")

    first = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "100.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    ).json()

    second = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "120.00", "expected_current_price_id": first["id"]},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

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


def test_stale_expected_price_is_rejected_with_current_value(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "conflicto")

    first = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "200.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    ).json()

    stale_attempt = client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "999.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert stale_attempt.status_code == 409, stale_attempt.text
    detail = stale_attempt.json()["detail"]
    assert detail["current_price"]["id"] == first["id"]
    assert detail["current_price"]["amount"] == "200.00"

    current = client.get(f"/variants/{variant_id}/price", cookies=admin_cookies).json()
    assert current["price"]["amount"] == "200.00"
    history = client.get(f"/variants/{variant_id}/prices", cookies=admin_cookies).json()
    assert len(history) == 1


def test_two_variants_of_the_same_product_keep_independent_prices(client):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "independiente"
    )

    client.put(
        f"/variants/{red_id}/price",
        json={"amount": "30.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    client.put(
        f"/variants/{blue_id}/price",
        json={"amount": "45.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    red_price = client.get(f"/variants/{red_id}/price", cookies=admin_cookies).json()
    blue_price = client.get(f"/variants/{blue_id}/price", cookies=admin_cookies).json()
    assert red_price["price"]["amount"] == "30.00"
    assert blue_price["price"]["amount"] == "45.00"


def test_change_product_price_applies_to_all_active_variants_in_one_operation(client):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, blue_id) = _set_up_product_with_two_variants(client, admin_cookies, "lote")
    product_id = _product["id"]

    response = client.put(
        f"/products/{product_id}/price",
        json={
            "amount": "75.50",
            "expected_current_price_ids": {red_id: None, blue_id: None},
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200, response.text
    changed = response.json()["prices"]
    assert len(changed) == 2
    assert {price["variant_id"] for price in changed} == {red_id, blue_id}
    assert all(price["amount"] == "75.50" for price in changed)

    red_price = client.get(f"/variants/{red_id}/price", cookies=admin_cookies).json()
    blue_price = client.get(f"/variants/{blue_id}/price", cookies=admin_cookies).json()
    assert red_price["price"]["amount"] == "75.50"
    assert blue_price["price"]["amount"] == "75.50"
    assert red_price["price"]["id"] != blue_price["price"]["id"]


def test_change_product_price_rejects_all_when_one_variant_is_stale(client):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "loteconflicto"
    )
    product_id = _product["id"]

    client.put(
        f"/variants/{red_id}/price",
        json={"amount": "10.00", "expected_current_price_id": None},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    response = client.put(
        f"/products/{product_id}/price",
        json={
            "amount": "99.00",
            "expected_current_price_ids": {red_id: None, blue_id: None},
        },
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert str(red_id) in detail["current_prices"]
    assert detail["current_prices"][str(red_id)]["amount"] == "10.00"
    assert detail["current_prices"][str(blue_id)] is None

    red_price = client.get(f"/variants/{red_id}/price", cookies=admin_cookies).json()
    blue_price = client.get(f"/variants/{blue_id}/price", cookies=admin_cookies).json()
    assert red_price["price"]["amount"] == "10.00"
    assert blue_price["price"] is None


def test_change_product_price_requires_expected_id_for_every_active_variant(client):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, _blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "incompleto"
    )
    product_id = _product["id"]

    response = client.put(
        f"/products/{product_id}/price",
        json={"amount": "20.00", "expected_current_price_ids": {red_id: None}},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text


def test_change_product_price_ignores_inactive_variants(client, db_session):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "inactiva"
    )
    product_id = _product["id"]

    inactive_variant = db_session.get(Variant, blue_id)
    inactive_variant.status = "inactive"
    db_session.commit()

    response = client.put(
        f"/products/{product_id}/price",
        json={"amount": "33.00", "expected_current_price_ids": {red_id: None}},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200, response.text
    changed = response.json()["prices"]
    assert len(changed) == 1
    assert changed[0]["variant_id"] == red_id

    blue_price = client.get(f"/variants/{blue_id}/price", cookies=admin_cookies).json()
    assert blue_price["price"] is None


def test_change_product_price_fails_when_no_active_variants_remain(client, db_session):
    admin_cookies = _admin_cookies(client)
    product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "sinactivas")

    only_variant = db_session.get(Variant, variant_id)
    only_variant.status = "inactive"
    db_session.commit()

    response = client.put(
        f"/products/{product['id']}/price",
        json={"amount": "10.00", "expected_current_price_ids": {}},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text


def test_change_product_price_is_atomic_when_a_variant_fails_mid_operation(
    client, db_session, monkeypatch
):
    admin_cookies = _admin_cookies(client)
    _product, (red_id, blue_id) = _set_up_product_with_two_variants(
        client, admin_cookies, "atomico"
    )
    product_id = _product["id"]
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
            db_session,
            product_id,
            business_id,
            Decimal("55.00"),
            admin_account_id,
            expected_current_price_ids={red_id: None, blue_id: None},
        )
    db_session.rollback()

    red_price = pricing_module.get_current_price_for_variant(db_session, red_id, business_id)
    blue_price = pricing_module.get_current_price_for_variant(db_session, blue_id, business_id)
    assert red_price is None
    assert blue_price is None


def test_price_amount_is_stored_as_an_exact_decimal(client, db_session):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _set_up_product_with_single_variant(client, admin_cookies, "decimal")

    client.put(
        f"/variants/{variant_id}/price",
        json={"amount": "19.99", "expected_current_price_id": None},
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
