from fastapi import FastAPI

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
