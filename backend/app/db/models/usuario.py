from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.estado import EstadoEntidad
from app.constants.limits import (
    ESTADO_MAX_LENGTH,
    NOMBRE_MAX_LENGTH,
    PASSWORD_HASH_MAX_LENGTH,
    USERNAME_MAX_LENGTH,
)
from app.db.base import Base
from app.db.constraints import estado_check_constraint

if TYPE_CHECKING:
    from app.db.models.acceso_a_negocio import AccesoANegocio
    from app.db.models.organizacion import Organizacion
    from app.db.models.sesion import Sesion


class Usuario(Base):
    __tablename__ = "usuario"
    __table_args__ = (estado_check_constraint(),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organizacion_id: Mapped[int] = mapped_column(ForeignKey("organizacion.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(NOMBRE_MAX_LENGTH), nullable=False)
    user_name: Mapped[str] = mapped_column(String(USERNAME_MAX_LENGTH), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(PASSWORD_HASH_MAX_LENGTH), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(ESTADO_MAX_LENGTH), nullable=False, default=EstadoEntidad.ACTIVO.value
    )

    organizacion: Mapped["Organizacion"] = relationship(back_populates="usuarios")
    accesos: Mapped[list["AccesoANegocio"]] = relationship(back_populates="usuario")
    sesiones: Mapped[list["Sesion"]] = relationship(back_populates="usuario")
