from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.estado import EstadoEntidad
from app.constants.limits import ESTADO_MAX_LENGTH, NOMBRE_MAX_LENGTH, RUBRO_MAX_LENGTH
from app.db.base import Base
from app.db.constraints import estado_check_constraint

if TYPE_CHECKING:
    from app.db.models.organizacion import Organizacion


class Negocio(Base):
    __tablename__ = "negocio"
    __table_args__ = (estado_check_constraint(),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organizacion_id: Mapped[int] = mapped_column(ForeignKey("organizacion.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(NOMBRE_MAX_LENGTH), nullable=False)
    rubro: Mapped[str] = mapped_column(String(RUBRO_MAX_LENGTH), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(ESTADO_MAX_LENGTH), nullable=False, default=EstadoEntidad.ACTIVO.value
    )

    organizacion: Mapped["Organizacion"] = relationship(back_populates="negocios")
