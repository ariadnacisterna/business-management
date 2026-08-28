from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NOMBRE_MAX_LENGTH
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.negocio import Negocio
    from app.db.models.usuario import Usuario


class Organizacion(Base):
    __tablename__ = "organizacion"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(NOMBRE_MAX_LENGTH), nullable=False)

    negocios: Mapped[list["Negocio"]] = relationship(back_populates="organizacion")
    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="organizacion")
