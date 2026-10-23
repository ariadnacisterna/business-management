import re
from collections.abc import Callable
from dataclasses import dataclass

import sqlalchemy as sa
from httpx import Cookies

from app.constants.access import CSRF_HEADER_NAME, CSRF_SAFE_METHODS, INVALID_CSRF_DETAIL
from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE, ROLE_HIERARCHY, ROLE_RANK
from app.constants.status import CreditType, EntityStatus, PaymentMethod, ShortageStatus
from app.core.config import get_settings
from app.db.models import Account, Business, BusinessAccess, Role
from app.main import app
from tests.access_matrix import ANY_SESSION, ENDPOINT_ACCESS_MATRIX, PUBLIC

MISSING_ID = 999_999
ACCOUNT_PASSWORD = "Clave-segura-1"
WRONG_CSRF_TOKEN = "token-incorrecto"
OTHER_BUSINESS_MARKER = "Exclusivo del otro negocio"
PATH_PARAMETER_PATTERN = re.compile(r"{(\w+)}")
SESSION_CLOSING_ENDPOINTS = {("POST", "/auth/logout")}
TEST_USER_NAMES = {
    EMPLEADO: "cuenta-empleado",
    GERENTE: "cuenta-gerente",
    ADMINISTRADOR: "cuenta-administrador",
}
OWN_BUSINESS_ONLY_OWNER_USER_NAME = "duenio-un-solo-negocio"
OTHER_BUSINESS_ACCOUNT_USER_NAME = "cuenta-otro-negocio"

REQUEST_BODIES_FOR_ID_PROBES: dict[tuple[str, str], dict] = {
    ("PATCH", "/accounts/{account_id}"): {"json": {"name": "Nombre nuevo"}},
    ("POST", "/accounts/{account_id}/reset-password"): {"json": {"new_password": "Clave-nueva-1"}},
    ("PATCH", "/categories/{category_id}"): {"json": {"name": "Nombre nuevo"}},
    ("PATCH", "/units/{unit_id}"): {"json": {"name": "Nombre nuevo"}},
    ("POST", "/attributes/{attribute_id}/values"): {"json": {"value": "Valor nuevo"}},
    ("PATCH", "/attribute-values/{attribute_value_id}"): {"json": {"value": "Valor nuevo"}},
    ("PATCH", "/products/{product_id}"): {"json": {"name": "Nombre nuevo"}},
    ("POST", "/products/{product_id}/variants"): {"json": {"label": "Variante nueva"}},
    ("POST", "/products/{product_id}/image"): {
        "files": {"file": ("foto.png", b"imagen", "image/png")}
    },
    ("PUT", "/products/{product_id}/provider"): {"json": {"provider_id": None}},
    ("PUT", "/products/{product_id}/price"): {"json": {"delta": "10"}},
    ("PATCH", "/variants/{variant_id}"): {"json": {"label": "Variante nueva"}},
    ("PUT", "/variants/{variant_id}/price"): {"json": {"amount": "200"}},
    ("PATCH", "/variants/{variant_id}/stock/minimum"): {"json": {"minimum_quantity": "1"}},
    ("POST", "/variants/{variant_id}/stock/adjustments"): {"json": {"delta": "1"}},
    ("PATCH", "/providers/{provider_id}"): {"json": {"name": "Nombre nuevo"}},
    ("PUT", "/providers/{provider_id}/categories"): {"json": {"category_ids": []}},
    ("PATCH", "/shortages/{shortage_id}"): {"json": {"status": ShortageStatus.PEDIDO.value}},
    ("PATCH", "/customers/{customer_id}"): {"json": {"name": "Nombre nuevo"}},
    ("POST", "/customers/{customer_id}/credits"): {
        "json": {"type": CreditType.CARGO.value, "amount": "10"}
    },
    ("POST", "/sales/{sale_id}/void"): {"json": {"reason": "Prueba de acceso"}},
}


@dataclass(frozen=True)
class TwoBusinesses:
    own_business_actor_cookies: Cookies
    other_business_owner_cookies: Cookies
    other_business_ids: dict[str, int]


def _api_endpoints() -> list[tuple[str, str]]:
    return sorted(
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    )


def _minimum_role(method: str, path: str) -> str:
    return ENDPOINT_ACCESS_MATRIX[(method, path)].minimum_role


def _path_parameters(path: str) -> list[str]:
    return PATH_PARAMETER_PATTERN.findall(path)


def _fill_path(path: str, ids: dict[str, int]) -> str:
    return PATH_PARAMETER_PATTERN.sub(lambda match: str(ids[match.group(1)]), path)


def _fill_path_with_missing_ids(path: str) -> str:
    return PATH_PARAMETER_PATTERN.sub(str(MISSING_ID), path)


def _roles_below(minimum_role: str) -> list[str]:
    return [role for role in ROLE_HIERARCHY if ROLE_RANK[role] < ROLE_RANK[minimum_role]]


def _csrf_headers(cookies) -> dict[str, str]:
    return {CSRF_HEADER_NAME: cookies["csrf_token"]}


def _login(client, user_name: str, password: str = ACCOUNT_PASSWORD):
    response = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies


def _owner_cookies(client):
    settings = get_settings()
    return _login(client, settings.initial_admin_username, settings.initial_admin_password)


def _login_as(client, role: str):
    if role == DUENO:
        return _owner_cookies(client)
    return _login(client, TEST_USER_NAMES[role])


def _write(client, cookies, method: str, path: str, payload: dict) -> dict:
    response = client.request(
        method, path, json=payload, cookies=cookies, headers=_csrf_headers(cookies)
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


def _create_account(client, cookies, name: str, user_name: str, role: str) -> dict:
    return _write(
        client,
        cookies,
        "POST",
        "/accounts",
        {
            "name": name,
            "user_name": user_name,
            "initial_password": ACCOUNT_PASSWORD,
            "role": role,
        },
    )


def _cookies_by_role(client) -> dict:
    owner_cookies = _owner_cookies(client)
    for role, user_name in TEST_USER_NAMES.items():
        _create_account(client, owner_cookies, f"Cuenta {role}", user_name, role)
    return {role: _login_as(client, role) for role in ROLE_HIERARCHY}


def _request_with_session(client, method: str, url: str, cookies, **kwargs):
    return client.request(method, url, cookies=cookies, headers=_csrf_headers(cookies), **kwargs)


def test_every_api_endpoint_has_an_entry_in_the_access_matrix():
    endpoints = set(_api_endpoints())

    assert endpoints

    endpoints_missing_from_matrix = endpoints - ENDPOINT_ACCESS_MATRIX.keys()
    matrix_entries_without_endpoint = ENDPOINT_ACCESS_MATRIX.keys() - endpoints

    assert endpoints_missing_from_matrix == set()
    assert matrix_entries_without_endpoint == set()


def test_requests_without_a_session_are_rejected_except_on_public_endpoints(client):
    client.cookies.clear()
    unexpected = []

    for method, path in _api_endpoints():
        response = client.request(method, _fill_path_with_missing_ids(path))
        is_public = _minimum_role(method, path) == PUBLIC
        if is_public and response.status_code in (401, 403):
            unexpected.append((method, path, response.status_code))
        if not is_public and response.status_code != 401:
            unexpected.append((method, path, response.status_code))

    assert unexpected == []


def test_roles_below_the_minimum_are_forbidden(client):
    cookies_by_role = _cookies_by_role(client)
    unexpected = []

    for method, path in _api_endpoints():
        minimum_role = _minimum_role(method, path)
        if minimum_role in (PUBLIC, ANY_SESSION):
            continue
        for role in _roles_below(minimum_role):
            response = _request_with_session(
                client, method, _fill_path_with_missing_ids(path), cookies_by_role[role]
            )
            if response.status_code != 403:
                unexpected.append((method, path, role, response.status_code))

    assert unexpected == []


def test_the_minimum_role_is_neither_unauthorized_nor_forbidden(client):
    cookies_by_role = _cookies_by_role(client)
    unexpected = []

    for method, path in _api_endpoints():
        minimum_role = _minimum_role(method, path)
        if minimum_role == PUBLIC:
            continue
        role = EMPLEADO if minimum_role == ANY_SESSION else minimum_role
        cookies = (
            _login_as(client, role)
            if (method, path) in SESSION_CLOSING_ENDPOINTS
            else cookies_by_role[role]
        )
        response = _request_with_session(client, method, _fill_path_with_missing_ids(path), cookies)
        if response.status_code in (401, 403):
            unexpected.append((method, path, role, response.status_code, response.text))

    assert unexpected == []


def test_every_mutation_without_a_valid_csrf_token_is_rejected(client):
    owner_cookies = _owner_cookies(client)
    mutating_endpoints = [
        (method, path)
        for method, path in _api_endpoints()
        if method not in CSRF_SAFE_METHODS and _minimum_role(method, path) != PUBLIC
    ]
    unexpected = []

    for method, path in mutating_endpoints:
        url = _fill_path_with_missing_ids(path)
        for headers in ({}, {CSRF_HEADER_NAME: WRONG_CSRF_TOKEN}):
            response = client.request(method, url, cookies=owner_cookies, headers=headers)
            rejected_for_csrf = (
                response.status_code == 403 and response.json()["detail"] == INVALID_CSRF_DETAIL
            )
            if not rejected_for_csrf:
                unexpected.append((method, path, headers, response.status_code))

    assert ("POST", "/imports/preview") in mutating_endpoints
    assert unexpected == []


def _first_business_id(db_session) -> int:
    return db_session.scalars(sa.select(Business.id).order_by(Business.id)).first()


def _owner_account_id(db_session) -> int:
    settings = get_settings()
    return db_session.scalars(
        sa.select(Account.id).where(Account.user_name == settings.initial_admin_username)
    ).first()


def _create_other_business(db_session) -> Business:
    organization_id = db_session.scalars(sa.select(Business.organization_id)).first()
    business = Business(
        organization_id=organization_id,
        name=f"{OTHER_BUSINESS_MARKER} negocio",
        industry="General",
        status=EntityStatus.ACTIVE.value,
    )
    db_session.add(business)
    db_session.commit()
    db_session.refresh(business)
    return business


def _grant_access(db_session, account_id: int, business_id: int, role_name: str) -> None:
    role = db_session.scalars(sa.select(Role).where(Role.name == role_name)).first()
    db_session.add(
        BusinessAccess(
            account_id=account_id,
            business_id=business_id,
            role_id=role.id,
            status=EntityStatus.ACTIVE.value,
        )
    )
    db_session.commit()


def _owner_cookies_in_business(client, business_id: int):
    cookies = _owner_cookies(client)
    _write(client, cookies, "POST", "/auth/active-business", {"business_id": business_id})
    return cookies


def _create_other_business_data(client, cookies, business_id: int) -> dict[str, int]:
    marker = OTHER_BUSINESS_MARKER
    category = _write(client, cookies, "POST", "/categories", {"name": f"{marker} categoria"})
    unit = _write(
        client, cookies, "POST", "/units", {"name": f"{marker} unidad", "abbreviation": "uon"}
    )
    attribute = _write(client, cookies, "POST", "/attributes", {"name": f"{marker} atributo"})
    attribute_value = _write(
        client, cookies, "POST", f"/attributes/{attribute['id']}/values", {"value": f"{marker} v"}
    )
    product = _write(
        client,
        cookies,
        "POST",
        "/products",
        {
            "name": f"{marker} producto",
            "category_id": category["id"],
            "unit_id": unit["id"],
            "variants": [
                {"label": f"{marker} variante", "attribute_value_ids": [attribute_value["id"]]}
            ],
        },
    )["product"]
    variant_id = product["variants"][0]["id"]
    _write(client, cookies, "PUT", f"/variants/{variant_id}/price", {"amount": "150"})
    _write(client, cookies, "POST", f"/variants/{variant_id}/stock/adjustments", {"delta": "3"})
    provider = _write(
        client,
        cookies,
        "POST",
        "/providers",
        {"name": f"{marker} proveedor", "category_ids": [category["id"]]},
    )
    _write(
        client,
        cookies,
        "PUT",
        f"/products/{product['id']}/provider",
        {"provider_id": provider["id"]},
    )
    shortage = _write(client, cookies, "POST", "/shortages", {"variant_id": variant_id})
    customer = _write(client, cookies, "POST", "/customers", {"name": f"{marker} cliente"})
    _write(
        client,
        cookies,
        "POST",
        f"/customers/{customer['id']}/credits",
        {"type": CreditType.CARGO.value, "amount": "100"},
    )
    sale = _write(
        client,
        cookies,
        "POST",
        "/sales",
        {
            "lines": [{"variant_id": variant_id, "quantity": "1"}],
            "payment_method": PaymentMethod.FIADO.value,
            "customer_id": customer["id"],
        },
    )
    account = _create_account(
        client, cookies, f"{marker} cuenta", OTHER_BUSINESS_ACCOUNT_USER_NAME, EMPLEADO
    )
    return {
        "business_id": business_id,
        "account_id": account["id"],
        "category_id": category["id"],
        "unit_id": unit["id"],
        "attribute_id": attribute["id"],
        "attribute_value_id": attribute_value["id"],
        "product_id": product["id"],
        "variant_id": variant_id,
        "provider_id": provider["id"],
        "shortage_id": shortage["id"],
        "customer_id": customer["id"],
        "sale_id": sale["id"],
    }


def _set_up_two_businesses(client, db_session) -> TwoBusinesses:
    own_business_id = _first_business_id(db_session)
    other_business = _create_other_business(db_session)
    _grant_access(db_session, _owner_account_id(db_session), other_business.id, DUENO)

    other_business_owner_cookies = _owner_cookies_in_business(client, other_business.id)
    other_business_ids = _create_other_business_data(
        client, other_business_owner_cookies, other_business.id
    )

    own_business_owner_cookies = _owner_cookies_in_business(client, own_business_id)
    _create_account(
        client,
        own_business_owner_cookies,
        "Duenio de un solo negocio",
        OWN_BUSINESS_ONLY_OWNER_USER_NAME,
        DUENO,
    )
    own_business_actor_cookies = _login(client, OWN_BUSINESS_ONLY_OWNER_USER_NAME)

    return TwoBusinesses(
        own_business_actor_cookies=own_business_actor_cookies,
        other_business_owner_cookies=other_business_owner_cookies,
        other_business_ids=other_business_ids,
    )


def _snapshot_of_reads(client, cookies, ids: dict[str, int]) -> dict:
    snapshot = {}
    for method, path in _api_endpoints():
        if method != "GET":
            continue
        response = client.get(_fill_path(path, ids), cookies=cookies)
        snapshot[path] = (response.status_code, response.text)
    return snapshot


def _discard_uncommitted_changes(db_session) -> None:
    db_session.rollback()


def _probe_with_ids(client, cookies, method: str, path: str, ids: dict[str, int]):
    return _request_with_session(
        client,
        method,
        _fill_path(path, ids),
        cookies,
        **REQUEST_BODIES_FOR_ID_PROBES.get((method, path), {}),
    )


def test_ids_from_another_business_in_the_path_are_answered_like_missing_ones(client, db_session):
    setup = _set_up_two_businesses(client, db_session)
    other_ids = setup.other_business_ids
    missing_ids = {name: MISSING_ID for name in other_ids}
    snapshot_before = _snapshot_of_reads(client, setup.other_business_owner_cookies, other_ids)
    unexpected = []

    for method, path in _api_endpoints():
        parameters = _path_parameters(path)
        if not parameters:
            continue
        assert set(parameters) <= other_ids.keys(), (method, path)
        cookies = setup.own_business_actor_cookies
        other_response = _probe_with_ids(client, cookies, method, path, other_ids)
        _discard_uncommitted_changes(db_session)
        missing_response = _probe_with_ids(client, cookies, method, path, missing_ids)
        _discard_uncommitted_changes(db_session)
        if other_response.status_code != 404 or other_response.text != missing_response.text:
            unexpected.append((method, path, other_response.status_code, other_response.text))

    snapshot_after = _snapshot_of_reads(client, setup.other_business_owner_cookies, other_ids)
    assert unexpected == []
    assert snapshot_after == snapshot_before


def _create_own_business_data(client, cookies) -> dict[str, int]:
    category = _write(client, cookies, "POST", "/categories", {"name": "Categoria propia"})
    unit = _write(
        client, cookies, "POST", "/units", {"name": "Unidad propia", "abbreviation": "up"}
    )
    product = _write(
        client,
        cookies,
        "POST",
        "/products",
        {
            "name": "Producto propio",
            "category_id": category["id"],
            "unit_id": unit["id"],
            "variants": [{"label": "Variante propia"}],
        },
    )["product"]
    provider = _write(client, cookies, "POST", "/providers", {"name": "Proveedor propio"})
    return {
        "category_id": category["id"],
        "unit_id": unit["id"],
        "product_id": product["id"],
        "variant_id": product["variants"][0]["id"],
        "provider_id": provider["id"],
    }


def _requests_referencing_another_business(
    own: dict[str, int],
) -> list[tuple[str, Callable[[int], tuple[str, str, dict]]]]:
    product_path = f"/products/{own['product_id']}"
    return [
        (
            "category_id",
            lambda ref: (
                "POST",
                "/products",
                {"json": {"name": "Producto A", "category_id": ref, "unit_id": own["unit_id"]}},
            ),
        ),
        (
            "unit_id",
            lambda ref: (
                "POST",
                "/products",
                {"json": {"name": "Producto B", "category_id": own["category_id"], "unit_id": ref}},
            ),
        ),
        (
            "attribute_value_id",
            lambda ref: (
                "POST",
                "/products",
                {
                    "json": {
                        "name": "Producto C",
                        "category_id": own["category_id"],
                        "unit_id": own["unit_id"],
                        "variants": [{"label": "Variante C", "attribute_value_ids": [ref]}],
                    }
                },
            ),
        ),
        (
            "attribute_value_id",
            lambda ref: (
                "POST",
                f"{product_path}/variants",
                {"json": {"label": "Variante D", "attribute_value_ids": [ref]}},
            ),
        ),
        (
            "attribute_value_id",
            lambda ref: (
                "PATCH",
                f"/variants/{own['variant_id']}",
                {"json": {"attribute_value_ids": [ref]}},
            ),
        ),
        ("category_id", lambda ref: ("PATCH", product_path, {"json": {"category_id": ref}})),
        ("unit_id", lambda ref: ("PATCH", product_path, {"json": {"unit_id": ref}})),
        (
            "provider_id",
            lambda ref: ("PUT", f"{product_path}/provider", {"json": {"provider_id": ref}}),
        ),
        (
            "category_id",
            lambda ref: (
                "POST",
                "/providers",
                {"json": {"name": "Proveedor E", "category_ids": [ref]}},
            ),
        ),
        (
            "category_id",
            lambda ref: (
                "PUT",
                f"/providers/{own['provider_id']}/categories",
                {"json": {"category_ids": [ref]}},
            ),
        ),
        ("variant_id", lambda ref: ("POST", "/shortages", {"json": {"variant_id": ref}})),
        (
            "variant_id",
            lambda ref: (
                "POST",
                "/sales",
                {
                    "json": {
                        "lines": [{"variant_id": ref, "quantity": "1"}],
                        "payment_method": PaymentMethod.EFECTIVO.value,
                    }
                },
            ),
        ),
        (
            "customer_id",
            lambda ref: (
                "POST",
                "/sales",
                {
                    "json": {
                        "lines": [{"variant_id": own["variant_id"], "quantity": "1"}],
                        "payment_method": PaymentMethod.FIADO.value,
                        "customer_id": ref,
                    }
                },
            ),
        ),
        (
            "business_id",
            lambda ref: ("POST", "/auth/active-business", {"json": {"business_id": ref}}),
        ),
        ("category_id", lambda ref: ("GET", f"/search?category_id={ref}", {})),
        ("category_id", lambda ref: ("GET", f"/products?category_id={ref}", {})),
        ("category_id", lambda ref: ("GET", f"/stock?category_id={ref}", {})),
        ("category_id", lambda ref: ("GET", f"/shortages?category_id={ref}", {})),
        ("provider_id", lambda ref: ("GET", f"/shortages?provider_id={ref}", {})),
    ]


def _comparable_response(response, reference_id: int) -> tuple[int, str]:
    if response.is_success:
        return response.status_code, response.text
    return response.status_code, response.text.replace(str(reference_id), "{id}")


def test_ids_from_another_business_inside_requests_are_answered_like_missing_ones(
    client, db_session
):
    setup = _set_up_two_businesses(client, db_session)
    cookies = setup.own_business_actor_cookies
    own_ids = _create_own_business_data(client, cookies)
    other_ids = setup.other_business_ids
    snapshot_before = _snapshot_of_reads(client, setup.other_business_owner_cookies, other_ids)
    unexpected = []

    for reference_name, build_request in _requests_referencing_another_business(own_ids):
        other_id = other_ids[reference_name]
        other_method, other_url, other_kwargs = build_request(other_id)
        missing_method, missing_url, missing_kwargs = build_request(MISSING_ID)
        other_response = _request_with_session(
            client, other_method, other_url, cookies, **other_kwargs
        )
        _discard_uncommitted_changes(db_session)
        missing_response = _request_with_session(
            client, missing_method, missing_url, cookies, **missing_kwargs
        )
        _discard_uncommitted_changes(db_session)
        other_result = _comparable_response(other_response, other_id)
        missing_result = _comparable_response(missing_response, MISSING_ID)
        if other_result != missing_result:
            unexpected.append((other_method, other_url, other_response.text, missing_response.text))

    snapshot_after = _snapshot_of_reads(client, setup.other_business_owner_cookies, other_ids)
    assert unexpected == []
    assert snapshot_after == snapshot_before


def test_lists_searches_and_counts_never_include_data_from_another_business(client, db_session):
    setup = _set_up_two_businesses(client, db_session)
    cookies = setup.own_business_actor_cookies
    listing_urls = [
        path for method, path in _api_endpoints() if method == "GET" and not _path_parameters(path)
    ]
    reads = [(url, None) for url in listing_urls] + [
        ("/search", {"q": OTHER_BUSINESS_MARKER}),
        ("/products", {"search": OTHER_BUSINESS_MARKER}),
        ("/stock", {"search": OTHER_BUSINESS_MARKER}),
    ]

    leaking_reads = [
        (url, params)
        for url, params in reads
        if OTHER_BUSINESS_MARKER in client.get(url, params=params, cookies=cookies).text
    ]
    other_business_products = client.get("/products", cookies=setup.other_business_owner_cookies)

    assert OTHER_BUSINESS_MARKER in other_business_products.text
    assert leaking_reads == []
    assert client.get("/shortages/count", cookies=cookies).json() == {"count": 0}
    assert client.get("/stock/low-count", cookies=cookies).json() == {"count": 0}
    assert client.get("/stock/counts", cookies=cookies).json() == {
        "total": 0,
        "stock_bajo": 0,
        "sin_stock": 0,
    }
