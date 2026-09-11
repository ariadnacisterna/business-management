from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import PRICE_PRECISION, PRICE_SCALE, STATUS_MAX_LENGTH
from app.constants.status import CreditType
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.customer import Customer

CREDIT_AMOUNT_POSITIVE_CONSTRAINT_NAME = "credit_amount_positive"
CREDIT_TYPE_CHECK_NAME = "credit_type_valid"


class Credit(Base):
    __tablename__ = "credit"
    __table_args__ = (
        CheckConstraint(
            f"type IN ('{CreditType.CARGO.value}', '{CreditType.PAGO.value}')",
            name=CREDIT_TYPE_CHECK_NAME,
        ),
        CheckConstraint("amount > 0", name=CREDIT_AMOUNT_POSITIVE_CONSTRAINT_NAME),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customer.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(STATUS_MAX_LENGTH), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False)
    created_by_account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    customer: Mapped["Customer"] = relationship(back_populates="credits")
