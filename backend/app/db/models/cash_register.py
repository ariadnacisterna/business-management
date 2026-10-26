from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import (
    CASH_MOVEMENT_REASON_MAX_LENGTH,
    PRICE_PRECISION,
    PRICE_SCALE,
    STATUS_MAX_LENGTH,
)
from app.constants.status import CashMovementKind
from app.db.base import Base

MONEY = Numeric(PRICE_PRECISION, PRICE_SCALE)


class CashRegister(Base):
    __tablename__ = "cash_register"
    __table_args__ = (
        CheckConstraint("ends_at > opened_at", name="ends_after_opening"),
        CheckConstraint(
            "(closed_at IS NULL AND closed_by_account_id IS NULL AND expected_cash IS NULL "
            "AND counted_cash IS NULL AND cash_difference IS NULL) OR "
            "(closed_at IS NOT NULL AND closed_by_account_id IS NOT NULL "
            "AND expected_cash IS NOT NULL AND counted_cash IS NOT NULL "
            "AND cash_difference IS NOT NULL)",
            name="close_complete",
        ),
        CheckConstraint("counted_cash IS NULL OR counted_cash >= 0", name="counted_cash_valid"),
        CheckConstraint(
            "(transfers_closed_at IS NULL AND transfers_closed_by_account_id IS NULL "
            "AND expected_transfer IS NULL AND counted_transfer IS NULL "
            "AND transfer_difference IS NULL) OR "
            "(transfers_closed_at IS NOT NULL AND transfers_closed_by_account_id IS NOT NULL "
            "AND expected_transfer IS NOT NULL AND counted_transfer IS NOT NULL "
            "AND transfer_difference IS NOT NULL AND closed_at IS NOT NULL)",
            name="transfers_close_complete",
        ),
        CheckConstraint(
            "counted_transfer IS NULL OR counted_transfer >= 0", name="counted_transfer_valid"
        ),
        Index("ix_cash_register_business_id_opened_at", "business_id", "opened_at"),
        Index("ix_cash_register_account_id_business_id", "account_id", "business_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("account.id"), nullable=True
    )
    expected_cash: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    counted_cash: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    cash_difference: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    transfers_closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    transfers_closed_by_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("account.id"), nullable=True
    )
    expected_transfer: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    counted_transfer: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    transfer_difference: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)

    movements: Mapped[list["CashMovement"]] = relationship(
        back_populates="cash_register", order_by="CashMovement.id"
    )


class CashMovement(Base):
    __tablename__ = "cash_movement"
    __table_args__ = (
        CheckConstraint(
            f"kind IN ('{CashMovementKind.INGRESO.value}', '{CashMovementKind.RETIRO.value}')",
            name="kind_valid",
        ),
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_cash_movement_cash_register_id", "cash_register_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cash_register_id: Mapped[int] = mapped_column(ForeignKey("cash_register.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(STATUS_MAX_LENGTH), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    reason: Mapped[str | None] = mapped_column(
        String(CASH_MOVEMENT_REASON_MAX_LENGTH), nullable=True
    )
    created_by_account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    cash_register: Mapped["CashRegister"] = relationship(back_populates="movements")
