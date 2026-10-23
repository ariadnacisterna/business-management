from decimal import Decimal

from sqlalchemy import func, select

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import EMPLEADO, GERENTE
from app.constants.status import PaymentMethod
from app.constants.submission import SUBMISSION_KEY_HEADER_NAME
from app.core.config import get_settings
from app.db.models import Sale

PASSWORD = "Clave-segura-1"
EFECTIVO = PaymentMethod.EFECTIVO.value
TRANSFERENCIA = PaymentMethod.TRANSFERENCIA.value
FIADO = PaymentMethod.FIADO.value


def _login(client, user_name, password=PASSWORD):
    response = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies


def _admin_cookies(client):
    settings = get_settings()
    return _login(client, settings.initial_admin_username, settings.initial_admin_password)


def _headers(cookies, submission_key=None):
    headers = {CSRF_HEADER_NAME: cookies["csrf_token"]}
    if submission_key is not None:
        headers[SUBMISSION_KEY_HEADER_NAME] = submission_key
    return headers


def _send(client, cookies, method, path, payload, submission_key=None):
    return client.request(
        method, path, json=payload, cookies=cookies, headers=_headers(cookies, submission_key)
    )


def _write(client, cookies, method, path, payload):
    response = _send(client, cookies, method, path, payload)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _cookies_for(client, admin_cookies, role, user_name):
    _write(
        client,
        admin_cookies,
        "POST",
        "/accounts",
        {
            "name": f"Cuenta {role}",
            "user_name": user_name,
            "initial_password": PASSWORD,
            "role": role,
        },
    )
    return _login(client, user_name)


def _variant(client, cookies, name, price="100", stock="10", allows_fraction=False):
    category = _write(client, cookies, "POST", "/categories", {"name": f"Categoria {name}"})
    unit = _write(
        client,
        cookies,
        "POST",
        "/units",
        {"name": f"Unidad {name}", "abbreviation": "m", "allows_fraction": allows_fraction},
    )
    product = _write(
        client,
        cookies,
        "POST",
        "/products",
        {"name": name, "category_id": category["id"], "unit_id": unit["id"]},
    )["product"]
    variant_id = product["variants"][0]["id"]
    if price is not None:
        _write(client, cookies, "PUT", f"/variants/{variant_id}/price", {"amount": price})
    if stock is not None:
        _write(
            client, cookies, "POST", f"/variants/{variant_id}/stock/adjustments", {"delta": stock}
        )
    return product["id"], variant_id


def _sale_payload(lines, payment_method=EFECTIVO, customer_id=None, discount=None):
    payload = {
        "lines": [
            {"variant_id": variant_id, "quantity": quantity} for variant_id, quantity in lines
        ],
        "payment_method": payment_method,
    }
    if customer_id is not None:
        payload["customer_id"] = customer_id
    if discount is not None:
        payload["discount"] = discount
    return payload


def _sell(client, cookies, lines, **options):
    return _send(client, cookies, "POST", "/sales", _sale_payload(lines, **options))


def _stock(client, cookies, variant_id):
    return Decimal(client.get(f"/variants/{variant_id}/stock", cookies=cookies).json()["quantity"])


def _balance(client, cookies, customer_id):
    response = client.get(f"/customers/{customer_id}/balance", cookies=cookies)
    return Decimal(response.json()["balance"])


def _sale_count(db_session):
    db_session.commit()
    return db_session.scalar(select(func.count()).select_from(Sale))


def test_cash_sale_takes_current_prices_and_discounts_stock(client):
    cookies = _admin_cookies(client)
    _product, cinta = _variant(client, cookies, "Cinta venta", price="150.50")
    _product, hilo = _variant(client, cookies, "Hilo venta", price="80")

    response = _sell(client, cookies, [(cinta, "2"), (hilo, "3")])

    assert response.status_code == 201, response.text
    sale = response.json()
    assert sale["payment_method"] == EFECTIVO
    assert Decimal(sale["subtotal"]) == Decimal("541.00")
    assert Decimal(sale["total"]) == Decimal("541.00")
    assert sale["insufficient_stock"] is False
    assert sale["created_by_account_name"]
    assert [(line["variant_id"], Decimal(line["unit_price"])) for line in sale["lines"]] == [
        (cinta, Decimal("150.50")),
        (hilo, Decimal("80")),
    ]
    assert _stock(client, cookies, cinta) == Decimal("8")
    assert _stock(client, cookies, hilo) == Decimal("7")


def test_a_later_price_change_does_not_change_a_registered_sale(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Botones venta", price="100")
    sale = _sell(client, cookies, [(variant_id, "1")]).json()

    _write(client, cookies, "PUT", f"/variants/{variant_id}/price", {"delta": "50"})

    detail = client.get(f"/sales/{sale['id']}", cookies=cookies).json()
    assert Decimal(detail["lines"][0]["unit_price"]) == Decimal("100")
    assert Decimal(detail["total"]) == Decimal("100")


def test_decimal_quantity_is_priced_and_rounded_to_cents(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(
        client, cookies, "Puntilla venta", price="33.33", allows_fraction=True
    )

    sale = _sell(client, cookies, [(variant_id, "1.5")]).json()

    assert Decimal(sale["lines"][0]["line_total"]) == Decimal("50.00")
    assert _stock(client, cookies, variant_id) == Decimal("8.5")


def test_discount_is_taken_from_the_total(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Lana venta", price="105")

    sale = _sell(client, cookies, [(variant_id, "1")], discount="5").json()

    assert Decimal(sale["subtotal"]) == Decimal("105")
    assert Decimal(sale["discount"]) == Decimal("5")
    assert Decimal(sale["total"]) == Decimal("100")


def test_discount_cannot_leave_the_total_negative(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Aguja venta", price="100")

    too_large = _sell(client, cookies, [(variant_id, "1")], discount="100.01")
    negative = _sell(client, cookies, [(variant_id, "1")], discount="-1")

    assert too_large.status_code == 422
    assert "descuento" in too_large.json()["detail"]
    assert negative.status_code == 422
    assert _sale_count(db_session) == 0
    assert _stock(client, cookies, variant_id) == Decimal("10")


def test_fiado_requires_a_customer(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Elastico venta")

    response = _sell(client, cookies, [(variant_id, "1")], payment_method=FIADO)

    assert response.status_code == 422
    assert "cliente" in response.json()["detail"]


def test_fiado_adds_a_single_charge_linked_to_the_sale(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Cierre venta", price="250")
    customer = _write(client, cookies, "POST", "/customers", {"name": "Cliente fiado"})
    _write(
        client,
        cookies,
        "POST",
        f"/customers/{customer['id']}/credits",
        {"type": "cargo", "amount": "100"},
    )

    sale = _sell(
        client, cookies, [(variant_id, "2")], payment_method=FIADO, customer_id=customer["id"]
    ).json()

    assert sale["customer_name"] == "Cliente fiado"
    assert _balance(client, cookies, customer["id"]) == Decimal("600")
    credits = client.get(f"/customers/{customer['id']}/credits", cookies=cookies).json()
    assert [Decimal(credit["amount"]) for credit in credits] == [Decimal("100"), Decimal("500")]


def test_customer_is_only_chosen_for_fiado(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Hebilla venta")
    customer = _write(client, cookies, "POST", "/customers", {"name": "Cliente efectivo"})

    response = _sell(client, cookies, [(variant_id, "1")], customer_id=customer["id"])

    assert response.status_code == 422


def test_sale_without_enough_stock_is_registered_and_leaves_stock_at_zero(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Encaje venta", stock="2")

    response = _sell(client, cookies, [(variant_id, "5")])

    assert response.status_code == 201, response.text
    sale = response.json()
    assert sale["insufficient_stock"] is True
    assert sale["lines"][0]["insufficient_stock"] is True
    assert Decimal(sale["lines"][0]["stock_taken"]) == Decimal("2")
    assert Decimal(sale["total"]) == Decimal("500")
    assert _stock(client, cookies, variant_id) == Decimal("0")


def test_sale_with_no_stock_at_all_registers_without_a_movement(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Tul venta", stock=None)

    sale = _sell(client, cookies, [(variant_id, "1")]).json()

    assert sale["insufficient_stock"] is True
    movements = client.get(f"/variants/{variant_id}/stock/movements", cookies=cookies).json()
    assert movements == []


def test_sale_and_void_appear_in_the_stock_history(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Raso venta")
    sale = _sell(client, cookies, [(variant_id, "4")]).json()
    _write(client, cookies, "POST", f"/sales/{sale['id']}/void", {"reason": "Se equivocó"})

    movements = client.get(f"/variants/{variant_id}/stock/movements", cookies=cookies).json()

    assert [
        (movement["observation"], movement["quantity_before"], movement["quantity_after"])
        for movement in movements[:2]
    ] == [
        (f"Anulación de la venta N° {sale['id']}", "6.000", "10.000"),
        (f"Venta N° {sale['id']}", "10.000", "6.000"),
    ]


def test_variant_without_current_price_cannot_be_sold(client, db_session):
    cookies = _admin_cookies(client)
    _product, priced = _variant(client, cookies, "Con precio venta")
    _product, unpriced = _variant(client, cookies, "Sin precio venta", price=None)

    response = _sell(client, cookies, [(priced, "1"), (unpriced, "1")])

    assert response.status_code == 422
    assert "no tiene precio" in response.json()["detail"]
    assert _sale_count(db_session) == 0
    assert _stock(client, cookies, priced) == Decimal("10")


def test_inactive_product_cannot_be_sold(client):
    cookies = _admin_cookies(client)
    product_id, variant_id = _variant(client, cookies, "Inactivo venta")
    _write(client, cookies, "POST", f"/products/{product_id}/deactivate", {})

    response = _sell(client, cookies, [(variant_id, "1")])

    assert response.status_code == 422
    assert "dado de baja" in response.json()["detail"]


def test_quantity_must_respect_the_unit(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Entero venta")

    fractional = _sell(client, cookies, [(variant_id, "1.5")])
    zero = _sell(client, cookies, [(variant_id, "0")])
    empty = _sell(client, cookies, [])

    assert fractional.status_code == 422
    assert "decimales" in fractional.json()["detail"]
    assert zero.status_code == 422
    assert empty.status_code == 422


def test_the_same_variant_cannot_appear_twice(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Repetido venta")

    response = _sell(client, cookies, [(variant_id, "1"), (variant_id, "2")])

    assert response.status_code == 422


def test_empleado_registers_and_sees_sales_but_cannot_void(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, admin_cookies, "Empleado venta")
    empleado = _cookies_for(client, admin_cookies, EMPLEADO, "empleado-venta")

    created = _sell(client, empleado, [(variant_id, "1")])
    listing = client.get("/sales", cookies=empleado)
    void = _send(client, empleado, "POST", f"/sales/{created.json()['id']}/void", {"reason": "No"})

    assert created.status_code == 201
    assert listing.json()["total"] == 1
    assert client.get(f"/sales/{created.json()['id']}", cookies=empleado).status_code == 200
    assert void.status_code == 403


def test_gerente_voids_a_fiado_sale_returning_stock_and_the_charge(client):
    admin_cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, admin_cookies, "Anular venta", stock="3")
    customer = _write(client, admin_cookies, "POST", "/customers", {"name": "Cliente anula"})
    sale = _sell(
        client,
        admin_cookies,
        [(variant_id, "5")],
        payment_method=FIADO,
        customer_id=customer["id"],
    ).json()
    gerente = _cookies_for(client, admin_cookies, GERENTE, "gerente-venta")

    response = _send(
        client, gerente, "POST", f"/sales/{sale['id']}/void", {"reason": "  Devolvió todo  "}
    )

    assert response.status_code == 200, response.text
    voided = response.json()
    assert voided["voided_at"] is not None
    assert voided["voided_by_account_name"] == "Cuenta Gerente"
    assert voided["void_reason"] == "Devolvió todo"
    assert _stock(client, admin_cookies, variant_id) == Decimal("3")
    assert _balance(client, admin_cookies, customer["id"]) == Decimal("0")


def test_a_sale_cannot_be_voided_twice_or_without_a_reason(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Doble anula venta")
    sale = _sell(client, cookies, [(variant_id, "1")]).json()
    path = f"/sales/{sale['id']}/void"

    without_reason = _send(client, cookies, "POST", path, {"reason": "   "})
    first = _send(client, cookies, "POST", path, {"reason": "Error"})
    second = _send(client, cookies, "POST", path, {"reason": "Error otra vez"})

    assert without_reason.status_code == 422
    assert first.status_code == 200
    assert second.status_code == 409
    assert _stock(client, cookies, variant_id) == Decimal("10")


def test_the_same_submission_sent_twice_registers_one_sale(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Envio venta")
    payload = _sale_payload([(variant_id, "2")])

    first = _send(client, cookies, "POST", "/sales", payload, "clave-venta-repetida-1")
    second = _send(client, cookies, "POST", "/sales", payload, "clave-venta-repetida-1")

    assert first.status_code == 201
    assert second.json() == first.json()
    assert _sale_count(db_session) == 1
    assert _stock(client, cookies, variant_id) == Decimal("8")


def test_list_filters_by_payment_method_and_date_and_paginates(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Lista venta", stock="100")
    for _ in range(11):
        _sell(client, cookies, [(variant_id, "1")])
    transfer = _sell(client, cookies, [(variant_id, "1")], payment_method=TRANSFERENCIA).json()

    first_page = client.get("/sales", params={"page_size": 10}, cookies=cookies).json()
    second_page = client.get("/sales", params={"page_size": 10, "page": 2}, cookies=cookies).json()
    transfers = client.get(
        "/sales", params={"payment_method": TRANSFERENCIA}, cookies=cookies
    ).json()
    future = client.get(
        "/sales", params={"created_from": "2999-01-01T00:00:00Z"}, cookies=cookies
    ).json()
    until = client.get(
        "/sales", params={"created_to": transfer["created_at"]}, cookies=cookies
    ).json()

    assert first_page["total"] == 12
    assert len(first_page["items"]) == 10
    assert first_page["items"][0]["id"] == transfer["id"]
    assert len(second_page["items"]) == 2
    assert [item["id"] for item in transfers["items"]] == [transfer["id"]]
    assert future["total"] == 0
    assert until["total"] == 11


def test_list_rejects_invalid_filters(client):
    cookies = _admin_cookies(client)

    assert client.get("/sales", params={"page_size": 7}, cookies=cookies).status_code == 422
    assert (
        client.get("/sales", params={"payment_method": "tarjeta"}, cookies=cookies).status_code
        == 422
    )


def test_unknown_payment_method_is_rejected(client):
    cookies = _admin_cookies(client)
    _product, variant_id = _variant(client, cookies, "Tarjeta venta")

    response = _sell(client, cookies, [(variant_id, "1")], payment_method="tarjeta")

    assert response.status_code == 422


def test_search_includes_what_the_sale_screen_needs(client):
    cookies = _admin_cookies(client)
    _variant(client, cookies, "Busqueda venta", stock="4", allows_fraction=True)

    result = client.get("/search", params={"q": "Busqueda venta"}, cookies=cookies).json()

    item = result["results"][0]
    assert item["unit_abbreviation"] == "m"
    assert item["unit_allows_fraction"] is True
    assert Decimal(item["quantity"]) == Decimal("4")
    assert item["presentation"] is None
