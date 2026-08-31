from fastapi import FastAPI

from app.api.access import router as access_router
from app.api.health import router as health_router

app = FastAPI(title="Negocio API")

app.include_router(health_router)
app.include_router(access_router)
