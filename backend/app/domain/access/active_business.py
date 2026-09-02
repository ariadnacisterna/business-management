from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.db.models import Business


def get_active_business(db: Session) -> Business:
    business = db.scalars(
        select(Business).where(Business.status == EntityStatus.ACTIVE.value)
    ).first()
    if business is None:
        raise RuntimeError("No hay un negocio activo configurado")
    return business
