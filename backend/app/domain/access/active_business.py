from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.estado import EstadoEntidad
from app.db.models import Negocio


def get_active_business(db: Session) -> Negocio:
    negocio = db.scalars(
        select(Negocio).where(Negocio.estado == EstadoEntidad.ACTIVO.value)
    ).first()
    if negocio is None:
        raise RuntimeError("No hay un negocio activo configurado")
    return negocio
