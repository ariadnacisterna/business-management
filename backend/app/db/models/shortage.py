from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import STATUS_MAX_LENGTH
from app.constants.status import ShortageStatus
from app.db.audit_mixin import AuditedMixin
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.variant import Variant

SHORTAGE_STATUS_CHECK_NAME = "status_valid"


class Shortage(Base, AuditedMixin):
    __tablename__ = "shortage"
    __table_args__ = (
        CheckConstraint(
            "status IN ('faltante', 'pedido', 'recibido')", name=SHORTAGE_STATUS_CHECK_NAME
        ),
        Index(
            "uq_shortage_variant_id_open",
            "variant_id",
            unique=True,
            postgresql_where=text("status IN ('faltante', 'pedido')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variant.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=ShortageStatus.FALTANTE.value
    )

    variant: Mapped["Variant"] = relationship(back_populates="shortages")
