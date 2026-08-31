from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.access import CSRF_TOKEN_MAX_LENGTH, SESSION_TOKEN_MAX_LENGTH
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.usuario import Usuario


class Sesion(Base):
    __tablename__ = "sesion"

    id: Mapped[str] = mapped_column(String(SESSION_TOKEN_MAX_LENGTH), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(CSRF_TOKEN_MAX_LENGTH), nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    usuario: Mapped["Usuario"] = relationship(back_populates="sesiones")
