from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from app.api.access import router as access_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.pricing import router as pricing_router
from app.api.search import router as search_router
from app.constants.security_headers import API_DOC_PATHS, UNEXPECTED_ERROR_DETAIL
from app.core.config import get_settings
from app.core.security_headers import build_security_headers

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


async def respond_with_generic_error(_request: Request, _exc: Exception) -> Response:
    return JSONResponse({"detail": UNEXPECTED_ERROR_DETAIL}, status_code=500)


def create_app(static_dir: Path = STATIC_DIR) -> FastAPI:
    docs_enabled = get_settings().enable_api_docs
    application = FastAPI(
        title="Negocio API",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    application.add_exception_handler(Exception, respond_with_generic_error)

    application.include_router(health_router)
    application.include_router(access_router)
    application.include_router(catalog_router)
    application.include_router(pricing_router)
    application.include_router(search_router)
    application.include_router(imports_router)

    index_html = static_dir / "index.html"

    @application.middleware("http")
    async def serve_spa_navigation(request: Request, call_next) -> Response:
        if (
            request.method == "GET"
            and request.url.path not in API_DOC_PATHS
            and "text/html" in request.headers.get("accept", "")
            and index_html.is_file()
        ):
            return FileResponse(index_html)
        return await call_next(request)

    @application.middleware("http")
    async def add_security_headers(request: Request, call_next) -> Response:
        response = await call_next(request)
        is_api_doc_page = docs_enabled and request.url.path in API_DOC_PATHS
        response.headers.update(
            build_security_headers(include_content_security_policy=not is_api_doc_page)
        )
        return response

    if static_dir.is_dir():
        application.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return application


app = create_app()
