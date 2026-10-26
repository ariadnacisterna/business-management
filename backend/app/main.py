import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from app.api.access import router as access_router
from app.api.cash import router as cash_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.pricing import router as pricing_router
from app.api.sales import router as sales_router
from app.api.search import router as search_router
from app.constants.observability import (
    FIRST_SERVER_ERROR_STATUS,
    MILLISECONDS_PER_SECOND,
    QUIET_LOG_PATHS,
    REQUEST_FINISHED_MESSAGE,
    REQUEST_ID_HEADER_NAME,
    UNEXPECTED_ERROR_MESSAGE,
)
from app.constants.security_headers import API_DOC_PATHS, UNEXPECTED_ERROR_WITH_CODE_DETAIL
from app.core.config import get_settings
from app.core.http_cache import cache_control_for
from app.core.security_headers import build_security_headers
from app.core.structured_logging import configure_logging, current_request_id, new_request_id

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

logger = logging.getLogger(__name__)


def generic_error_response(request_id: str) -> Response:
    return JSONResponse(
        {"detail": UNEXPECTED_ERROR_WITH_CODE_DETAIL.format(request_id=request_id)},
        status_code=FIRST_SERVER_ERROR_STATUS,
        headers={REQUEST_ID_HEADER_NAME: request_id},
    )


async def respond_with_generic_error(request: Request, _exc: Exception) -> Response:
    request_id = getattr(request.state, "request_id", None) or new_request_id()
    logger.error(
        UNEXPECTED_ERROR_MESSAGE,
        exc_info=True,
        extra={"method": request.method, "path": request.url.path, "error_request_id": request_id},
    )
    return generic_error_response(request_id)


def _log_request_finished(request: Request, status_code: int, started_at: float) -> None:
    if request.url.path in QUIET_LOG_PATHS and status_code < FIRST_SERVER_ERROR_STATUS:
        return
    logger.info(
        REQUEST_FINISHED_MESSAGE,
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": status_code,
            "duration_ms": round((time.perf_counter() - started_at) * MILLISECONDS_PER_SECOND),
        },
    )


def create_app(static_dir: Path = STATIC_DIR) -> FastAPI:
    configure_logging()
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
    application.include_router(sales_router)
    application.include_router(cash_router)

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
    async def track_request(request: Request, call_next) -> Response:
        request_id = new_request_id()
        request.state.request_id = request_id
        context_token = current_request_id.set(request_id)
        started_at = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception:
                logger.exception(
                    UNEXPECTED_ERROR_MESSAGE,
                    extra={"method": request.method, "path": request.url.path},
                )
                response = generic_error_response(request_id)
            response.headers[REQUEST_ID_HEADER_NAME] = request_id
            _log_request_finished(request, response.status_code, started_at)
            return response
        finally:
            current_request_id.reset(context_token)

    @application.middleware("http")
    async def add_cache_headers(request: Request, call_next) -> Response:
        response = await call_next(request)
        cache_control = cache_control_for(
            request.url.path, response.status_code, response.headers.get("content-type", "")
        )
        if cache_control is not None:
            response.headers["Cache-Control"] = cache_control
        return response

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
