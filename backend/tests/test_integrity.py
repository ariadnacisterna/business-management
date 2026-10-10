from decimal import Decimal

import pytest
import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.constants.access import CSRF_HEADER_NAME
from app.core.config import get_settings
from app.db.models import Business
from app.domain.audit.integrity import find_integrity_problems
from scripts import check_integrity
from scripts.database_connection import DATABASE_FAILED_MESSAGE


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


def _post(client, cookies, path, payload):
    response = client.post(
        path, json=payload, cookies=cookies, headers={CSRF_HEADER_NAME: cookies["csrf_token"]}
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


def _put(client, cookies, path, payload):
    response = client.put(
        path, json=payload, cookies=cookies, headers={CSRF_HEADER_NAME: cookies["csrf_token"]}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _product_with_history(client, cookies, name="Cinta integridad", allows_fraction=False):
    category = _post(client, cookies, "/categories", {"name": f"Categoria {name}"})
    unit = _post(
        client,
        cookies,
        "/units",
        {"name": f"Unidad {name}", "abbreviation": "u", "allows_fraction": allows_fraction},
    )
    product = _post(
        client,
        cookies,
        "/products",
        {"name": name, "category_id": category["id"], "unit_id": unit["id"]},
    )["product"]
    variant_id = product["variants"][0]["id"]
    _put(client, cookies, f"/variants/{variant_id}/price", {"amount": "100"})
    _put(client, cookies, f"/variants/{variant_id}/price", {"delta": "20"})
    _post(client, cookies, f"/variants/{variant_id}/stock/adjustments", {"delta": "10"})
    _post(client, cookies, f"/variants/{variant_id}/stock/adjustments", {"delta": "-4"})
    return product, variant_id, unit["id"]


def _descriptions(db_session):
    db_session.commit()
    return [problem.description for problem in find_integrity_problems(db_session)]


def _business_name(db_session):
    return db_session.scalars(select(Business.name).order_by(Business.id)).first()


def _execute(db_session, statement, **parameters):
    db_session.execute(sa.text(statement), parameters)
    db_session.commit()


def _run_script(monkeypatch, connection_url):
    monkeypatch.setattr(check_integrity, "getpass", lambda prompt="": connection_url)
    check_integrity.main()


def _supabase_style_url(test_url):
    return make_url(test_url).set(drivername="postgresql").render_as_string(hide_password=False)


def test_data_written_by_the_application_has_no_problems(client, db_session):
    cookies = _admin_cookies(client)
    _product_with_history(client, cookies)
    _product, other_variant_id, _unit_id = _product_with_history(client, cookies, "Hilo integridad")
    _post(client, cookies, "/shortages", {"variant_id": other_variant_id})
    customer = _post(client, cookies, "/customers", {"name": "Cliente integridad"})
    credit = {"type": "cargo", "amount": "5"}
    _post(client, cookies, f"/customers/{customer['id']}/credits", credit)

    assert _descriptions(db_session) == []


def test_reports_stock_that_does_not_match_the_last_movement(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    _execute(db_session, "UPDATE variant SET quantity = 9 WHERE id = :id", id=variant_id)

    problems = find_integrity_problems(db_session)

    assert len(problems) == 1
    assert problems[0].business_name == _business_name(db_session)
    assert problems[0].description == (
        'Producto "Cinta integridad": el stock actual es 9, pero el último movimiento lo dejó en 6.'
    )


def test_reports_stock_without_any_movement(client, db_session):
    cookies = _admin_cookies(client)
    category = _post(client, cookies, "/categories", {"name": "Categoria sin movimientos"})
    unit = _post(client, cookies, "/units", {"name": "Unidad sin movimientos", "abbreviation": "u"})
    product = _post(
        client,
        cookies,
        "/products",
        {"name": "Sin movimientos", "category_id": category["id"], "unit_id": unit["id"]},
    )["product"]
    _execute(
        db_session,
        "UPDATE variant SET quantity = 3 WHERE id = :id",
        id=product["variants"][0]["id"],
    )

    assert _descriptions(db_session) == [
        'Producto "Sin movimientos": el stock actual es 3, pero no tiene ningún movimiento de '
        "stock que lo explique (tendría que ser 0)."
    ]


def test_reports_a_broken_chain_of_stock_movements(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    _execute(
        db_session,
        "UPDATE stock_movement SET quantity_before = 7, quantity_after = 6 "
        "WHERE id = (SELECT max(id) FROM stock_movement WHERE variant_id = :id)",
        id=variant_id,
    )

    descriptions = _descriptions(db_session)

    assert len(descriptions) == 1
    assert "arranca en 7, pero el movimiento anterior había dejado 10." in descriptions[0]


def test_reports_a_first_movement_that_does_not_start_at_zero(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    _execute(
        db_session,
        "UPDATE stock_movement SET quantity_before = 2 "
        "WHERE id = (SELECT min(id) FROM stock_movement WHERE variant_id = :id)",
        id=variant_id,
    )

    descriptions = _descriptions(db_session)

    assert len(descriptions) == 1
    assert "arranca en 2, pero el primer movimiento tiene que arrancar en 0." in descriptions[0]


def test_reports_decimals_in_a_unit_that_does_not_allow_them(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, unit_id = _product_with_history(
        client, cookies, "Vellon integridad", allows_fraction=True
    )
    _post(client, cookies, f"/variants/{variant_id}/stock/adjustments", {"delta": "0.5"})
    _execute(db_session, "UPDATE unit SET allows_fraction = false WHERE id = :id", id=unit_id)

    assert _descriptions(db_session) == [
        'Producto "Vellon integridad": se vende por "Unidad Vellon integridad", que no admite '
        "decimales, pero tiene stock 6.5 y stock mínimo 0."
    ]


def test_reports_a_gap_in_the_price_history(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    _execute(
        db_session,
        "UPDATE price SET effective_from = effective_from + interval '1 hour' "
        "WHERE variant_id = :id AND effective_to IS NULL",
        id=variant_id,
    )

    descriptions = _descriptions(db_session)

    assert len(descriptions) == 1
    assert "el historial de precios no es continuo" in descriptions[0]


def test_reports_a_product_without_variants(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    for table in ("price", "stock_movement"):
        _execute(db_session, f"DELETE FROM {table} WHERE variant_id = :id", id=variant_id)
    _execute(db_session, "DELETE FROM variant WHERE id = :id", id=variant_id)

    assert _descriptions(db_session) == [
        'Producto "Cinta integridad": no tiene ninguna variante (tiene que tener al menos una).'
    ]


def test_reports_old_data_that_breaks_a_rule_added_later(client, db_session):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    _execute(
        db_session,
        "ALTER TABLE stock_movement DROP CONSTRAINT ck_stock_movement_quantity_changed",
    )
    _execute(
        db_session,
        "UPDATE stock_movement SET quantity_after = quantity_before "
        "WHERE id = (SELECT max(id) FROM stock_movement WHERE variant_id = :id)",
        id=variant_id,
    )
    _execute(db_session, "UPDATE variant SET quantity = 10 WHERE id = :id", id=variant_id)
    _execute(
        db_session,
        "ALTER TABLE stock_movement ADD CONSTRAINT ck_stock_movement_quantity_changed "
        "CHECK (quantity_before <> quantity_after) NOT VALID",
    )

    problems = find_integrity_problems(db_session)

    assert len(problems) == 2
    assert "pasa de 10 a 10; tiene que cambiar la cantidad" in problems[0].description
    assert problems[1].business_name is None
    assert "cada movimiento de stock tiene que cambiar la cantidad" in problems[1].description


def test_script_prints_no_problems_on_clean_data(
    client, db_session, monkeypatch, capsys, postgres_empty_schema
):
    cookies = _admin_cookies(client)
    _product_with_history(client, cookies)
    db_session.commit()

    _run_script(monkeypatch, _supabase_style_url(postgres_empty_schema))

    assert capsys.readouterr().out.strip() == check_integrity.NO_PROBLEMS_MESSAGE


def test_script_lists_problems_by_business_and_exits_with_an_error_code(
    client, db_session, monkeypatch, capsys, postgres_empty_schema
):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    _execute(db_session, "UPDATE variant SET quantity = 9 WHERE id = :id", id=variant_id)

    with pytest.raises(SystemExit) as raised:
        _run_script(monkeypatch, _supabase_style_url(postgres_empty_schema))

    output = capsys.readouterr().out
    assert raised.value.code == check_integrity.PROBLEMS_FOUND_EXIT_CODE
    assert "Se encontraron 1 problema:" in output
    assert f'Negocio "{_business_name(db_session)}":' in output
    assert '  - Producto "Cinta integridad": el stock actual es 9' in output


def test_script_cannot_modify_the_database(
    client, db_session, monkeypatch, capsys, postgres_empty_schema
):
    cookies = _admin_cookies(client)
    _product, variant_id, _unit_id = _product_with_history(client, cookies)
    db_session.commit()

    def try_to_write(db):
        db.execute(sa.text("UPDATE variant SET quantity = 0 WHERE id = :id"), {"id": variant_id})
        return []

    monkeypatch.setattr(check_integrity, "find_integrity_problems", try_to_write)

    with pytest.raises(SystemExit) as raised:
        _run_script(monkeypatch, _supabase_style_url(postgres_empty_schema))

    assert str(raised.value) == DATABASE_FAILED_MESSAGE
    db_session.expire_all()
    quantity = db_session.execute(
        sa.text("SELECT quantity FROM variant WHERE id = :id"), {"id": variant_id}
    ).scalar_one()
    assert quantity == Decimal("6")
