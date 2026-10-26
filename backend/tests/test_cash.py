from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import text

from app.constants.access import CSRF_HEADER_NAME
from app.constants.cash import CASH_SHIFT_DURATION
from app.constants.roles import ADMINISTRADOR, EMPLEADO, GERENTE
from app.core.config import get_settings
from app.domain.audit.integrity import find_integrity_problems

PASSWORD = "Clave-segura-1"


def _login(client, user_name, password=PASSWORD):
    response = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies


def _owner(client):
    settings = get_settings()
    return _login(client, settings.initial_admin_username, settings.initial_admin_password)


def _send(client, cookies, method, path, payload=None):
    return client.request(
        method,
        path,
        json=payload,
        cookies=cookies,
        headers={CSRF_HEADER_NAME: cookies["csrf_token"]},
    )


def _write(client, cookies, method, path, payload):
    response = _send(client, cookies, method, path, payload)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _account(client, owner, role, user_name):
    _write(
        client,
        owner,
        "POST",
        "/accounts",
        {
            "name": f"Cuenta {user_name}",
            "user_name": user_name,
            "initial_password": PASSWORD,
            "role": role,
        },
    )
    return _login(client, user_name)


def _variant(client, owner):
    category = _write(client, owner, "POST", "/categories", {"name": "Categoria caja"})
    unit = _write(client, owner, "POST", "/units", {"name": "Unidad caja", "abbreviation": "u"})
    product = _write(
        client,
        owner,
        "POST",
        "/products",
        {"name": "Producto caja", "category_id": category["id"], "unit_id": unit["id"]},
    )["product"]
    variant_id = product["variants"][0]["id"]
    _write(client, owner, "PUT", f"/variants/{variant_id}/price", {"amount": "100"})
    _write(client, owner, "POST", f"/variants/{variant_id}/stock/adjustments", {"delta": "100"})
    return variant_id


def _sell(client, cookies, variant_id, quantity, payments):
    return _write(
        client,
        cookies,
        "POST",
        "/sales",
        {
            "lines": [{"variant_id": variant_id, "quantity": str(quantity)}],
            "payments": [{"method": method, "amount": str(amount)} for method, amount in payments],
        },
    )


def _current(client, cookies):
    response = client.get("/cash-registers/current", cookies=cookies)
    assert response.status_code == 200, response.text
    return response.json()


def test_login_opens_a_register_without_initial_cash_and_reuses_it(client):
    owner = _owner(client)
    first = _current(client, owner)
    second = _current(client, _owner(client))

    assert first["status"] == "abierta"
    assert Decimal(first["expected_cash"]) == 0
    assert first["id"] == second["id"]
    opened = datetime.fromisoformat(first["opened_at"])
    assert (
        datetime.fromisoformat(first["ends_at"]) - opened
        == CASH_SHIFT_DURATION
        == timedelta(hours=4, minutes=15)
    )


def test_sales_and_voids_add_and_subtract_by_payment_method(client):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    employee = _account(client, owner, EMPLEADO, "caja-empleada")
    sale = _sell(client, employee, variant_id, 3, [("efectivo", 200), ("transferencia", 100)])
    _sell(client, employee, variant_id, 1, [("efectivo", 100)])

    register = _current(client, employee)
    assert Decimal(register["cash_sales"]) == 300
    assert Decimal(register["expected_cash"]) == 300
    assert register["transfers_visible"] is False
    assert register["transfer_sales"] is None

    _write(client, owner, "POST", f"/sales/{sale['id']}/void", {"reason": "Error"})
    employee_register = _current(client, employee)
    owner_register = _current(client, owner)

    assert Decimal(employee_register["cash_voided"]) == 0
    assert Decimal(owner_register["cash_voided"]) == 200
    assert Decimal(owner_register["transfer_voided"]) == 100
    assert Decimal(owner_register["expected_cash"]) == -200


def test_cash_movements_change_the_expected_cash_and_reason_is_optional(client):
    employee = _account(client, _owner(client), EMPLEADO, "caja-movimientos")
    _write(
        client,
        employee,
        "POST",
        "/cash-registers/current/movements",
        {"kind": "ingreso", "amount": "500"},
    )
    register = _write(
        client,
        employee,
        "POST",
        "/cash-registers/current/movements",
        {"kind": "retiro", "amount": "120.50", "reason": "Luz"},
    )

    assert Decimal(register["deposits"]) == 500
    assert Decimal(register["withdrawals"]) == Decimal("120.50")
    assert Decimal(register["expected_cash"]) == Decimal("379.50")
    assert [movement["reason"] for movement in register["movements"]] == [None, "Luz"]
    for payload in (
        {"kind": "otro", "amount": "10"},
        {"kind": "retiro", "amount": "0"},
        {"kind": "retiro", "amount": "-5"},
        {"kind": "retiro", "amount": "1.234"},
    ):
        response = _send(client, employee, "POST", "/cash-registers/current/movements", payload)
        assert response.status_code == 422


def test_manager_closes_only_cash_and_sees_surplus_or_shortage(client):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    manager = _account(client, owner, GERENTE, "caja-gerente")
    employee = _account(client, owner, EMPLEADO, "caja-empleado-cierre")
    _sell(client, employee, variant_id, 2, [("efectivo", 100), ("transferencia", 100)])
    register_id = _current(client, employee)["id"]

    assert (
        _send(
            client, employee, "POST", f"/cash-registers/{register_id}/close", {"counted_cash": "0"}
        ).status_code
        == 403
    )
    assert (
        _send(
            client,
            manager,
            "POST",
            f"/cash-registers/{register_id}/close",
            {"counted_cash": "100", "counted_transfer": "100"},
        ).status_code
        == 403
    )
    closed = _write(
        client, manager, "POST", f"/cash-registers/{register_id}/close", {"counted_cash": "90"}
    )

    assert closed["status"] == "cerrada"
    assert Decimal(closed["expected_cash"]) == 100
    assert Decimal(closed["cash_difference"]) == -10
    assert closed["transfer_sales"] is None
    assert closed["expected_transfer"] is None
    again = _send(
        client, manager, "POST", f"/cash-registers/{register_id}/close", {"counted_cash": "90"}
    )
    assert again.status_code == 409

    assert _current(client, employee)["id"] != register_id


def test_administrator_closes_transfers_and_cannot_before_cash_is_closed(client, db_session):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    manager = _account(client, owner, GERENTE, "caja-gerente-2")
    administrator = _account(client, owner, ADMINISTRADOR, "caja-administrador")
    employee = _account(client, owner, EMPLEADO, "caja-empleado-2")
    _sell(client, employee, variant_id, 2, [("efectivo", 100), ("transferencia", 100)])
    register_id = _current(client, employee)["id"]
    path = f"/cash-registers/{register_id}/close-transfers"

    assert _send(client, manager, "POST", path, {"counted_transfer": "100"}).status_code == 403
    assert (
        _send(client, administrator, "POST", path, {"counted_transfer": "100"}).status_code == 409
    )

    _write(client, manager, "POST", f"/cash-registers/{register_id}/close", {"counted_cash": "100"})
    hidden = client.get(f"/cash-registers/{register_id}", cookies=manager).json()
    assert hidden["transfer_sales"] is None

    closed = _write(client, administrator, "POST", path, {"counted_transfer": "110"})
    assert Decimal(closed["expected_transfer"]) == 100
    assert Decimal(closed["transfer_difference"]) == 10
    assert (
        _send(client, administrator, "POST", path, {"counted_transfer": "110"}).status_code == 409
    )
    assert find_integrity_problems(db_session) == []


def test_owner_closes_cash_and_transfers_at_once(client):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    _sell(client, owner, variant_id, 1, [("transferencia", 100)])
    register_id = _current(client, owner)["id"]

    closed = _write(
        client,
        owner,
        "POST",
        f"/cash-registers/{register_id}/close",
        {"counted_cash": "0", "counted_transfer": "100"},
    )

    assert Decimal(closed["cash_difference"]) == 0
    assert Decimal(closed["transfer_difference"]) == 0
    assert closed["transfers_closed_at"] is not None


def test_shift_ends_by_itself_and_a_new_register_opens_when_selling_again(client, db_session):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    _sell(client, owner, variant_id, 1, [("efectivo", 100)])
    old = _current(client, owner)
    db_session.execute(
        text("UPDATE cash_register SET opened_at = :opened, ends_at = :ended WHERE id = :id"),
        {
            "opened": datetime.now(UTC) - timedelta(hours=5),
            "ended": datetime.now(UTC) - timedelta(minutes=1),
            "id": old["id"],
        },
    )
    db_session.execute(
        text("UPDATE sale SET created_at = :moment WHERE cash_register_id = :id"),
        {"moment": datetime.now(UTC) - timedelta(hours=4), "id": old["id"]},
    )
    db_session.commit()

    pending = client.get(f"/cash-registers/{old['id']}", cookies=owner).json()
    assert pending["status"] == "pendiente"

    _sell(client, owner, variant_id, 1, [("efectivo", 100)])
    new = _current(client, owner)

    assert new["id"] != old["id"]
    assert new["status"] == "abierta"
    assert Decimal(new["cash_sales"]) == 100
    assert (
        Decimal(client.get(f"/cash-registers/{old['id']}", cookies=owner).json()["cash_sales"])
        == 100
    )
    closed = _write(
        client, owner, "POST", f"/cash-registers/{old['id']}/close", {"counted_cash": "100"}
    )
    assert closed["status"] == "cerrada"
    history = client.get("/cash-registers", cookies=owner).json()
    assert history["total"] == 2
    assert history["items"][0]["id"] == new["id"]


def test_register_history_is_per_business_and_hidden_from_employees(client):
    owner = _owner(client)
    employee = _account(client, owner, EMPLEADO, "caja-sin-historial")

    assert client.get("/cash-registers", cookies=employee).status_code == 403
    assert client.get("/cash-registers", cookies=owner).json()["total"] >= 1


def test_integrity_reports_a_closed_register_that_does_not_match_its_sales(client, db_session):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    _sell(client, owner, variant_id, 1, [("efectivo", 100)])
    register_id = _current(client, owner)["id"]
    _write(client, owner, "POST", f"/cash-registers/{register_id}/close", {"counted_cash": "100"})
    assert find_integrity_problems(db_session) == []

    db_session.execute(
        text("UPDATE cash_register SET expected_cash = 5, cash_difference = 95 WHERE id = :id"),
        {"id": register_id},
    )
    db_session.commit()

    problems = [problem.description for problem in find_integrity_problems(db_session)]
    assert any(f"Caja N° {register_id}" in problem for problem in problems)


def test_integrity_reports_a_sale_placed_in_another_persons_register(client, db_session):
    owner = _owner(client)
    variant_id = _variant(client, owner)
    employee = _account(client, owner, EMPLEADO, "caja-ajena")
    sale = _sell(client, employee, variant_id, 1, [("efectivo", 100)])
    owner_register = _current(client, owner)
    db_session.execute(
        text("UPDATE sale SET cash_register_id = :register WHERE id = :id"),
        {"register": owner_register["id"], "id": sale["id"]},
    )
    db_session.commit()

    problems = [problem.description for problem in find_integrity_problems(db_session)]
    assert any(f"Venta N° {sale['id']}" in problem for problem in problems)
