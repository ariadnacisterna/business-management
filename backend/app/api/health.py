import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.constants.observability import (
    DATABASE_UNAVAILABLE_MESSAGE,
    HEALTH_DATABASE_PROBE,
    HEALTH_STATUS_OK,
    HEALTH_STATUS_UNAVAILABLE,
)
from app.db.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/health",
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "La base de datos no responde"}
    },
)
def get_health(response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text(HEALTH_DATABASE_PROBE))
    except SQLAlchemyError:
        logger.error(DATABASE_UNAVAILABLE_MESSAGE, exc_info=True)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": HEALTH_STATUS_UNAVAILABLE}
    return {"status": HEALTH_STATUS_OK}
