from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import GERENTE
from app.constants.submission import (
    MISSING_SUBMISSION_KEY_DETAIL,
    REUSED_SUBMISSION_KEY_DETAIL,
    SUBMISSION_KEY_HEADER_NAME,
    SUBMISSION_RETENTION_HOURS,
)
from app.core.config import get_settings
from app.db.models import Account, Credit, Product, StockMovement, Submission

SUBMISSION_KEY = "clave-de-envio-0001"
OTHER_SUBMISSION_KEY = "clave-de-envio-0002"
PASSWORD = "Clave-segura-1"


def _login(client, user_name, password):
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


def _post(client, cookies, path, payload, submission_key=None):
    return client.post(
        path, json=payload, cookies=cookies, headers=_headers(cookies, submission_key)
    )


def _variant_id(client, cookies, name="Producto envio"):
    category = _post(client, cookies, "/categories", {"name": f"Categoria {name}"}).json()
    unit = _post(client, cookies, "/units", {"name": f"Unidad {name}", "abbreviation": "u"}).json()
    product = _post(
        client,
        cookies,
        "/products",
        {"name": name, "category_id": category["id"], "unit_id": unit["id"]},
    ).json()["product"]
    return product["variants"][0]["id"]


def _customer_id(client, cookies, name="Cliente envio"):
    return _post(client, cookies, "/customers", {"name": name}).json()["id"]


def _movement_count(db_session, variant_id):
    return db_session.scalar(
        select(func.count())
        .select_from(StockMovement)
        .where(StockMovement.variant_id == variant_id)
    )


def test_repeated_stock_adjustment_with_the_same_key_is_applied_once(client, db_session):
    cookies = _admin_cookies(client)
    variant_id = _variant_id(client, cookies)
    path = f"/variants/{variant_id}/stock/adjustments"

    first = _post(client, cookies, path, {"delta": "5"}, SUBMISSION_KEY)
    repeated = _post(client, cookies, path, {"delta": "5"}, SUBMISSION_KEY)

    assert first.status_code == 201, first.text
    assert repeated.status_code == 201, repeated.text
    assert repeated.json() == first.json()
    assert _movement_count(db_session, variant_id) == 1
    stock = client.get(f"/variants/{variant_id}/stock", cookies=cookies).json()
    assert stock["quantity"] == "5.000"


def test_the_same_adjustment_with_a_new_key_is_applied_again(client, db_session):
    cookies = _admin_cookies(client)
    variant_id = _variant_id(client, cookies)
    path = f"/variants/{variant_id}/stock/adjustments"

    _post(client, cookies, path, {"delta": "5"}, SUBMISSION_KEY)
    second = _post(client, cookies, path, {"delta": "5"}, OTHER_SUBMISSION_KEY)

    assert second.status_code == 201, second.text
    assert second.json()["quantity_after"] == "10.000"
    assert _movement_count(db_session, variant_id) == 2


def test_repeated_credit_with_the_same_key_is_registered_once(client, db_session):
    cookies = _admin_cookies(client)
    customer_id = _customer_id(client, cookies)
    path = f"/customers/{customer_id}/credits"
    payload = {"type": "cargo", "amount": "250.00"}

    first = _post(client, cookies, path, payload, SUBMISSION_KEY)
    repeated = _post(client, cookies, path, payload, SUBMISSION_KEY)

    assert first.status_code == 201, first.text
    assert repeated.json()["id"] == first.json()["id"]
    assert (
        db_session.scalar(
            select(func.count()).select_from(Credit).where(Credit.customer_id == customer_id)
        )
        == 1
    )
    balance = client.get(f"/customers/{customer_id}/balance", cookies=cookies).json()
    assert balance["balance"] == "250.00"


def test_repeated_price_change_with_the_same_key_is_applied_once(client):
    cookies = _admin_cookies(client)
    variant_id = _variant_id(client, cookies)
    path = f"/variants/{variant_id}/price"
    client.put(path, json={"amount": "100"}, cookies=cookies, headers=_headers(cookies))

    first = client.put(
        path, json={"delta": "50"}, cookies=cookies, headers=_headers(cookies, SUBMISSION_KEY)
    )
    repeated = client.put(
        path, json={"delta": "50"}, cookies=cookies, headers=_headers(cookies, SUBMISSION_KEY)
    )

    assert first.status_code == 200, first.text
    assert repeated.json() == first.json()
    current = client.get(path, cookies=cookies).json()
    assert current["price"]["amount"] == "150.00"


def test_repeated_product_creation_with_the_same_key_creates_one_product(client, db_session):
    cookies = _admin_cookies(client)
    category = _post(client, cookies, "/categories", {"name": "Categoria repetida"}).json()
    unit = _post(client, cookies, "/units", {"name": "Unidad repetida", "abbreviation": "u"}).json()
    payload = {"name": "Producto repetido", "category_id": category["id"], "unit_id": unit["id"]}

    first = _post(client, cookies, "/products", payload, SUBMISSION_KEY)
    repeated = _post(client, cookies, "/products", payload, SUBMISSION_KEY)

    assert first.status_code == 201, first.text
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["product"]["id"] == first.json()["product"]["id"]
    assert (
        db_session.scalar(
            select(func.count()).select_from(Product).where(Product.name == "Producto repetido")
        )
        == 1
    )


def test_missing_or_invalid_key_is_rejected_and_nothing_is_applied(client, db_session):
    cookies = _admin_cookies(client)
    variant_id = _variant_id(client, cookies)
    path = f"/variants/{variant_id}/stock/adjustments"

    for invalid_key in ("", "corta", "clave con espacios no vale"):
        response = _post(client, cookies, path, {"delta": "5"}, invalid_key)
        assert response.status_code == 422
        assert response.json()["detail"] == MISSING_SUBMISSION_KEY_DETAIL

    assert _movement_count(db_session, variant_id) == 0


def test_reusing_a_key_for_a_different_operation_is_rejected(client, db_session):
    cookies = _admin_cookies(client)
    variant_id = _variant_id(client, cookies)
    path = f"/variants/{variant_id}/stock/adjustments"
    _post(client, cookies, path, {"delta": "5"}, SUBMISSION_KEY)

    different_amount = _post(client, cookies, path, {"delta": "7"}, SUBMISSION_KEY)
    customer_id = _customer_id(client, cookies)
    different_path = _post(
        client,
        cookies,
        f"/customers/{customer_id}/credits",
        {"type": "cargo", "amount": "10.00"},
        SUBMISSION_KEY,
    )

    for response in (different_amount, different_path):
        assert response.status_code == 422
        assert response.json()["detail"] == REUSED_SUBMISSION_KEY_DETAIL
    assert _movement_count(db_session, variant_id) == 1


def test_a_rejected_operation_is_not_remembered(client, db_session):
    cookies = _admin_cookies(client)
    variant_id = _variant_id(client, cookies)
    path = f"/variants/{variant_id}/stock/adjustments"

    rejected = _post(client, cookies, path, {"delta": "-5"}, SUBMISSION_KEY)
    accepted = _post(client, cookies, path, {"delta": "5"}, SUBMISSION_KEY)

    assert rejected.status_code == 422
    assert accepted.status_code == 201, accepted.text
    assert _movement_count(db_session, variant_id) == 1


def test_keys_belong_to_each_account(client, db_session):
    admin_cookies = _admin_cookies(client)
    _post(
        client,
        admin_cookies,
        "/accounts",
        {
            "name": "Gerente envio",
            "user_name": "gerente-envio",
            "initial_password": PASSWORD,
            "role": GERENTE,
        },
    )
    gerente_cookies = _login(client, "gerente-envio", PASSWORD)
    variant_id = _variant_id(client, admin_cookies)
    path = f"/variants/{variant_id}/stock/adjustments"

    _post(client, admin_cookies, path, {"delta": "5"}, SUBMISSION_KEY)
    from_gerente = _post(client, gerente_cookies, path, {"delta": "5"}, SUBMISSION_KEY)

    assert from_gerente.status_code == 201, from_gerente.text
    assert from_gerente.json()["quantity_after"] == "10.000"
    assert _movement_count(db_session, variant_id) == 2


def test_submissions_older_than_the_retention_are_deleted(client, db_session):
    cookies = _admin_cookies(client)
    owner = db_session.scalars(select(Account).order_by(Account.id)).first()
    db_session.add(
        Submission(
            account_id=owner.id,
            key="clave-vieja-000001",
            operation="POST /categories",
            request_fingerprint="0" * 64,
            response_body={},
            created_at=datetime.now(UTC) - timedelta(hours=SUBMISSION_RETENTION_HOURS + 1),
        )
    )
    db_session.commit()

    _post(client, cookies, "/categories", {"name": "Categoria limpieza"}, SUBMISSION_KEY)

    keys = db_session.scalars(select(Submission.key).where(Submission.account_id == owner.id))
    assert set(keys) == {SUBMISSION_KEY}
