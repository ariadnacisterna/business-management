from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import (
    OBSERVATION_MAX_LENGTH,
    STOCK_QUANTITY_PRECISION,
    STOCK_QUANTITY_SCALE,
)

if TYPE_CHECKING:
    from app.db.models.variant import Variant

from app.db.base import Base

STOCK_MOVEMENT_QUANTITY_BEFORE_NON_NEGATIVE_CONSTRAINT_NAME = "quantity_before_non_negative"
STOCK_MOVEMENT_QUANTITY_AFTER_NON_NEGATIVE_CONSTRAINT_NAME = "quantity_after_non_negative"


class StockMovement(Base):
    __tablename__ = "stock_movement"
    __table_args__ = (
        CheckConstraint(
            "quantity_before >= 0", name=STOCK_MOVEMENT_QUANTITY_BEFORE_NON_NEGATIVE_CONSTRAINT_NAME
        ),
        CheckConstraint(
            "quantity_after >= 0", name=STOCK_MOVEMENT_QUANTITY_AFTER_NON_NEGATIVE_CONSTRAINT_NAME
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variant.id"), nullable=False)
    quantity_before: Mapped[Decimal] = mapped_column(
        Numeric(STOCK_QUANTITY_PRECISION, STOCK_QUANTITY_SCALE), nullable=False
    )
    quantity_after: Mapped[Decimal] = mapped_column(
        Numeric(STOCK_QUANTITY_PRECISION, STOCK_QUANTITY_SCALE), nullable=False
    )
    observation: Mapped[str | None] = mapped_column(String(OBSERVATION_MAX_LENGTH), nullable=True)
    created_by_account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    variant: Mapped["Variant"] = relationship(back_populates="stock_movements")
