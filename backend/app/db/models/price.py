from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.limits import PRICE_PRECISION, PRICE_SCALE
from app.db.base import Base

PRICE_AMOUNT_POSITIVE_CONSTRAINT_NAME = "amount_positive"
PRICE_CURRENT_UNIQUE_INDEX_NAME = "uq_price_variant_id_business_id_current"


class Price(Base):
    __tablename__ = "price"
    __table_args__ = (
        CheckConstraint("amount > 0", name=PRICE_AMOUNT_POSITIVE_CONSTRAINT_NAME),
        Index(
            PRICE_CURRENT_UNIQUE_INDEX_NAME,
            "variant_id",
            "business_id",
            unique=True,
            postgresql_where=text("effective_to IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variant.id"), nullable=False)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
