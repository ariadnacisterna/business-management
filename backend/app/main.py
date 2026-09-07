from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from app.api.access import router as access_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.pricing import router as pricing_router
from app.api.search import router as search_router

app = FastAPI(title="Negocio API")

app.include_router(health_router)
app.include_router(access_router)
app.include_router(catalog_router)
app.include_router(pricing_router)
app.include_router(search_router)
app.include_router(imports_router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"
DOC_PATHS = {"/docs", "/redoc", "/openapi.json"}


@app.middleware("http")
async def serve_spa_navigation(request: Request, call_next) -> Response:
    if (
        request.method == "GET"
        and request.url.path not in DOC_PATHS
        and "text/html" in request.headers.get("accept", "")
        and INDEX_HTML.is_file()
    ):
        return FileResponse(INDEX_HTML)
    return await call_next(request)


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
