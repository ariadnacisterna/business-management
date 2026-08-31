from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.estado import EstadoEntidad
from app.constants.limits import ESTADO_MAX_LENGTH
from app.db.base import Base
from app.db.constraints import estado_check_constraint

if TYPE_CHECKING:
    from app.db.models.negocio import Negocio
    from app.db.models.rol import Rol
    from app.db.models.usuario import Usuario


class AccesoANegocio(Base):
    __tablename__ = "acceso_a_negocio"
    __table_args__ = (
        estado_check_constraint(),
        UniqueConstraint(
            "usuario_id", "negocio_id", name="uq_acceso_a_negocio_usuario_id_negocio_id"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    negocio_id: Mapped[int] = mapped_column(ForeignKey("negocio.id"), nullable=False)
    rol_id: Mapped[int] = mapped_column(ForeignKey("rol.id"), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(ESTADO_MAX_LENGTH), nullable=False, default=EstadoEntidad.ACTIVO.value
    )

    usuario: Mapped["Usuario"] = relationship(back_populates="accesos")
    negocio: Mapped["Negocio"] = relationship(back_populates="accesos")
    rol: Mapped["Rol"] = relationship(back_populates="accesos")
