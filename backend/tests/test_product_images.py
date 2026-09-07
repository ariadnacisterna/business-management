import sqlalchemy as sa

from app.constants.access import CSRF_HEADER_NAME
from app.constants.roles import DUENO
from app.constants.status import EntityStatus
from app.core.config import get_settings
from app.db.models import Account, Business, BusinessAccess, Role


def _login(client, user_name, password):
    response = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies


def _admin_cookies(client):
    settings = get_settings()
    return _login(client, settings.initial_admin_username, settings.initial_admin_password)


def _auth_headers(cookies):
    return {CSRF_HEADER_NAME: cookies["csrf_token"]}


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


def _create_product(client, cookies, name, category_id, unit_id):
    response = client.post(
        "/products",
        json={"name": name, "category_id": category_id, "unit_id": unit_id},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 201, response.text
    return response.json()["product"]


def _setup_product(client, cookies):
    category = _create_category(client, cookies, "Bazar")
    unit = _create_unit(client, cookies, "Unidad", "u")
    return _create_product(client, cookies, "Taza", category["id"], unit["id"])


def _configure_supabase(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role-key")
    monkeypatch.setattr(settings, "supabase_storage_bucket", "product-images")


class _FakeResponse:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


def _mock_httpx(monkeypatch, put_status=200, delete_status=200):
    calls = {"put": [], "delete": []}

    def fake_put(url, content=None, headers=None, timeout=None):
        calls["put"].append((url, content, headers))
        return _FakeResponse(put_status)

    def fake_delete(url, headers=None, timeout=None):
        calls["delete"].append((url, headers))
        return _FakeResponse(delete_status)

    import app.core.storage as storage_module

    monkeypatch.setattr(storage_module.httpx, "put", fake_put)
    monkeypatch.setattr(storage_module.httpx, "delete", fake_delete)
    return calls


def _image_file(content=b"fake-image-bytes", content_type="image/png", filename="photo.png"):
    return {"file": (filename, content, content_type)}


def test_upload_valid_image_succeeds(client, monkeypatch):
    admin_cookies = _admin_cookies(client)
    product = _setup_product(client, admin_cookies)
    _configure_supabase(monkeypatch)
    _mock_httpx(monkeypatch)

    response = client.post(
        f"/products/{product['id']}/image",
        files=_image_file(),
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["image_url"] is not None
    assert "product-images" in body["image_url"]


def test_reject_invalid_file_type(client, monkeypatch):
    admin_cookies = _admin_cookies(client)
    product = _setup_product(client, admin_cookies)
    _configure_supabase(monkeypatch)
    _mock_httpx(monkeypatch)

    response = client.post(
        f"/products/{product['id']}/image",
        files=_image_file(content_type="application/pdf", filename="doc.pdf"),
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text


def test_reject_file_too_large(client, monkeypatch):
    admin_cookies = _admin_cookies(client)
    product = _setup_product(client, admin_cookies)
    _configure_supabase(monkeypatch)
    _mock_httpx(monkeypatch)

    oversized_content = b"0" * (5 * 1024 * 1024 + 1)
    response = client.post(
        f"/products/{product['id']}/image",
        files=_image_file(content=oversized_content),
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 422, response.text


def test_remove_image_succeeds(client, monkeypatch):
    admin_cookies = _admin_cookies(client)
    product = _setup_product(client, admin_cookies)
    _configure_supabase(monkeypatch)
    _mock_httpx(monkeypatch)

    upload = client.post(
        f"/products/{product['id']}/image",
        files=_image_file(),
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )
    assert upload.status_code == 200, upload.text

    response = client.delete(
        f"/products/{product['id']}/image",
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 200, response.text
    assert response.json()["image_url"] is None


def _admin_account_id(db_session):
    settings = get_settings()
    account = db_session.scalars(
        sa.select(Account).where(Account.user_name == settings.initial_admin_username)
    ).first()
    return account.id


def _create_second_business(db_session, name="Despensa", industry="Despensa"):
    organization_id = db_session.scalars(sa.select(Business.organization_id)).first()
    business = Business(
        organization_id=organization_id,
        name=name,
        industry=industry,
        status=EntityStatus.ACTIVE.value,
    )
    db_session.add(business)
    db_session.commit()
    db_session.refresh(business)
    return business


def _grant_access(db_session, account_id, business_id, role_name):
    role = db_session.scalars(sa.select(Role).where(Role.name == role_name)).first()
    access = BusinessAccess(
        account_id=account_id,
        business_id=business_id,
        role_id=role.id,
        status=EntityStatus.ACTIVE.value,
    )
    db_session.add(access)
    db_session.commit()
    return access


def _switch_business(client, cookies, business_id):
    response = client.post(
        "/auth/active-business",
        json={"business_id": business_id},
        cookies=cookies,
        headers=_auth_headers(cookies),
    )
    assert response.status_code == 200, response.text


def test_business_scope_respected(client, db_session, monkeypatch):
    admin_cookies = _admin_cookies(client)
    product = _setup_product(client, admin_cookies)
    _configure_supabase(monkeypatch)
    _mock_httpx(monkeypatch)

    admin_account_id = _admin_account_id(db_session)
    second_business = _create_second_business(db_session)
    _grant_access(db_session, admin_account_id, second_business.id, DUENO)
    _switch_business(client, admin_cookies, second_business.id)

    response = client.post(
        f"/products/{product['id']}/image",
        files=_image_file(),
        cookies=admin_cookies,
        headers=_auth_headers(admin_cookies),
    )

    assert response.status_code == 404, response.text
