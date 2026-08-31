from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NOMBRE_MAX_LENGTH
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.acceso_a_negocio import AccesoANegocio


class Rol(Base):
    __tablename__ = "rol"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(NOMBRE_MAX_LENGTH), nullable=False, unique=True)

    accesos: Mapped[list["AccesoANegocio"]] = relationship(back_populates="rol")
