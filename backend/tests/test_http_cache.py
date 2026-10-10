import pytest
from fastapi.testclient import TestClient

from app.main import create_app

INDEX_HTML_CONTENT = "<!doctype html><html><body><div id='root'></div></body></html>"
LONG_CACHE = "public, max-age=31536000, immutable"


@pytest.fixture
def client(tmp_path) -> TestClient:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(INDEX_HTML_CONTENT, encoding="utf-8")
    (tmp_path / "assets" / "index-a1b2c3.js").write_text("console.log('app')", encoding="utf-8")
    (tmp_path / "assets" / "index-d4e5f6.css").write_text("body { margin: 0; }", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    return TestClient(create_app(tmp_path))


def test_index_html_must_be_revalidated_on_every_visit(client):
    for response in (
        client.get("/", headers={"Accept": "text/html"}),
        client.get("/products", headers={"Accept": "text/html"}),
        client.get("/index.html"),
        client.get("/"),
    ):
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        assert response.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_cached_for_a_long_time(client):
    for path in ("/assets/index-a1b2c3.js", "/assets/index-d4e5f6.css"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == LONG_CACHE


def test_a_missing_asset_is_not_cached(client):
    response = client.get("/assets/index-viejo.js")

    assert response.status_code == 404
    assert response.headers.get("cache-control") != LONG_CACHE


def test_files_outside_assets_and_api_responses_are_not_cached_for_long(client):
    for response in (
        client.get("/favicon.svg"),
        client.get("/no-existe", headers={"Accept": "application/json"}),
    ):
        assert response.headers.get("cache-control") != LONG_CACHE
