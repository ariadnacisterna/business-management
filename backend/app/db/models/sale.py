from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import (
    PRICE_PRECISION,
    PRICE_SCALE,
    SALE_FREE_LINE_DESCRIPTION_MAX_LENGTH,
    STATUS_MAX_LENGTH,
    STOCK_QUANTITY_PRECISION,
    STOCK_QUANTITY_SCALE,
    VOID_REASON_MAX_LENGTH,
)
from app.constants.status import PaymentMethod
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.customer import Customer
    from app.db.models.variant import Variant

PAYMENT_METHODS_SQL = ", ".join(f"'{method.value}'" for method in PaymentMethod)


class Sale(Base):
    __tablename__ = "sale"
    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount >= 0", name="discount_non_negative"),
        CheckConstraint("total >= 0", name="total_non_negative"),
        CheckConstraint("total = subtotal - discount", name="total_matches"),
        CheckConstraint(
            "(voided_at IS NULL AND voided_by_account_id IS NULL AND void_reason IS NULL) OR "
            "(voided_at IS NOT NULL AND voided_by_account_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name="void_complete",
        ),
        Index("ix_sale_business_id_created_at", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customer.id"), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False)
    insufficient_stock: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_by_account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("account.id"), nullable=True
    )
    void_reason: Mapped[str | None] = mapped_column(String(VOID_REASON_MAX_LENGTH), nullable=True)

    customer: Mapped["Customer | None"] = relationship()
    lines: Mapped[list["SaleLine"]] = relationship(back_populates="sale", order_by="SaleLine.id")
    payments: Mapped[list["SalePayment"]] = relationship(
        back_populates="sale", order_by="SalePayment.id"
    )


class SaleLine(Base):
    __tablename__ = "sale_line"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price > 0", name="unit_price_positive"),
        CheckConstraint("line_total >= 0", name="line_total_non_negative"),
        CheckConstraint(
            "stock_taken >= 0 AND stock_taken <= quantity", name="stock_taken_in_range"
        ),
        CheckConstraint(
            "(variant_id IS NOT NULL AND description IS NULL) OR "
            "(variant_id IS NULL AND description IS NOT NULL AND quantity = 1 "
            "AND stock_taken = 0 AND line_total = unit_price)",
            name="product_or_free_amount",
        ),
        Index("ix_sale_line_sale_id", "sale_id"),
        Index("ix_sale_line_variant_id", "variant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sale.id"), nullable=False)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("variant.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(
        String(SALE_FREE_LINE_DESCRIPTION_MAX_LENGTH), nullable=True
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(STOCK_QUANTITY_PRECISION, STOCK_QUANTITY_SCALE), nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False
    )
    line_total: Mapped[Decimal] = mapped_column(
        Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False
    )
    stock_taken: Mapped[Decimal] = mapped_column(
        Numeric(STOCK_QUANTITY_PRECISION, STOCK_QUANTITY_SCALE), nullable=False
    )

    sale: Mapped["Sale"] = relationship(back_populates="lines")
    variant: Mapped["Variant | None"] = relationship()


class SalePayment(Base):
    __tablename__ = "sale_payment"
    __table_args__ = (
        CheckConstraint(f"method IN ({PAYMENT_METHODS_SQL})", name="method_valid"),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        UniqueConstraint("sale_id", "method"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sale.id"), nullable=False)
    method: Mapped[str] = mapped_column(String(STATUS_MAX_LENGTH), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(PRICE_PRECISION, PRICE_SCALE), nullable=False)

    sale: Mapped["Sale"] = relationship(back_populates="payments")
