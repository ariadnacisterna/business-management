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


def _empleado_cookies(client, admin_cookies, user_name="empleado-clientes"):
    _create_account(client, admin_cookies, user_name, EMPLEADO)
    return _login(client, user_name, "Clave-segura-1")


def _create_customer(client, cookies, name="Maria Gomez", phone=None):
    response = client.post(
        "/customers",
        json={"name": name, "phone": phone},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_credit(client, cookies, customer_id, credit_type, amount):
    return client.post(
        f"/customers/{customer_id}/credits",
        json={"type": credit_type, "amount": amount},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )


def test_empleado_can_create_customer(client):
    admin_cookies = _admin_cookies(client)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    customer = _create_customer(client, empleado_cookies, "Maria Gomez", "1122334455")

    assert customer["name"] == "Maria Gomez"
    assert customer["phone"] == "1122334455"
    assert customer["status"] == "active"


def test_customer_phone_is_optional(client):
    admin_cookies = _admin_cookies(client)

    customer = _create_customer(client, admin_cookies, "Juan Diaz")

    assert customer["phone"] is None


def test_unauthenticated_request_cannot_create_customer(client):
    response = client.post("/customers", json={"name": "Sin sesion"})

    assert response.status_code == 401


def test_duplicate_customer_name_is_rejected(client):
    admin_cookies = _admin_cookies(client)
    _create_customer(client, admin_cookies, "Ana Lopez")

    response = client.post(
        "/customers",
        json={"name": "ana lopez"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 409


def test_update_customer_renames_it(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)

    response = client.patch(
        f"/customers/{customer['id']}",
        json={"name": "Maria Gomez Actualizada"},
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Maria Gomez Actualizada"


def test_deactivate_and_reactivate_customer(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)

    deactivate_response = client.post(
        f"/customers/{customer['id']}/deactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["status"] == "inactive"

    reactivate_response = client.post(
        f"/customers/{customer['id']}/reactivate",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["status"] == "active"


def test_empleado_can_register_a_charge_and_a_payment(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)
    empleado_cookies = _empleado_cookies(client, admin_cookies)

    charge = _create_credit(client, empleado_cookies, customer["id"], "cargo", "100.00")
    assert charge.status_code == 201, charge.text
    assert charge.json()["type"] == "cargo"
    assert charge.json()["created_by_account_id"] is not None

    payment = _create_credit(client, empleado_cookies, customer["id"], "pago", "40.00")
    assert payment.status_code == 201, payment.text


def test_unauthenticated_request_cannot_create_credit(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)
    client.cookies.clear()

    response = client.post(
        f"/customers/{customer['id']}/credits", json={"type": "cargo", "amount": "10.00"}
    )

    assert response.status_code == 401


def test_credit_amount_must_be_positive(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)

    response = _create_credit(client, admin_cookies, customer["id"], "cargo", "0")

    assert response.status_code == 422


def test_credit_type_must_be_cargo_or_pago(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)

    response = _create_credit(client, admin_cookies, customer["id"], "otro", "10.00")

    assert response.status_code == 422


def test_customer_balance_is_charges_minus_payments(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)
    _create_credit(client, admin_cookies, customer["id"], "cargo", "100.00")
    _create_credit(client, admin_cookies, customer["id"], "pago", "30.00")

    response = client.get(f"/customers/{customer['id']}/balance", cookies=admin_cookies)

    assert response.status_code == 200
    assert response.json()["balance"] == "70.00"


def test_customer_balance_can_reach_zero_after_payment(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)
    _create_credit(client, admin_cookies, customer["id"], "cargo", "50.00")

    response = _create_credit(client, admin_cookies, customer["id"], "pago", "50.00")
    assert response.status_code == 201, response.text

    balance = client.get(f"/customers/{customer['id']}/balance", cookies=admin_cookies)
    assert balance.status_code == 200
    assert balance.json()["balance"] == "0.00"


def test_list_customers_with_pending_balance(client):
    admin_cookies = _admin_cookies(client)
    with_debt = _create_customer(client, admin_cookies, "Con deuda")
    without_debt = _create_customer(client, admin_cookies, "Sin deuda")
    _create_credit(client, admin_cookies, with_debt["id"], "cargo", "50.00")
    _create_credit(client, admin_cookies, without_debt["id"], "cargo", "50.00")
    _create_credit(client, admin_cookies, without_debt["id"], "pago", "50.00")

    response = client.get("/customers/pending-balance", cookies=admin_cookies)

    assert response.status_code == 200
    ids = [item["customer"]["id"] for item in response.json()]
    assert with_debt["id"] in ids
    assert without_debt["id"] not in ids


def test_customer_credits_are_listed_in_order(client):
    admin_cookies = _admin_cookies(client)
    customer = _create_customer(client, admin_cookies)
    _create_credit(client, admin_cookies, customer["id"], "cargo", "100.00")
    _create_credit(client, admin_cookies, customer["id"], "pago", "40.00")

    response = client.get(f"/customers/{customer['id']}/credits", cookies=admin_cookies)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["type"] == "cargo"
    assert body[1]["type"] == "pago"


def test_customer_not_found_returns_404(client):
    admin_cookies = _admin_cookies(client)

    response = client.get("/customers/999999", cookies=admin_cookies)

    assert response.status_code == 404
