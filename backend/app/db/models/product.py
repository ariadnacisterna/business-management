from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import (
    NAME_MAX_LENGTH,
    PRESENTATION_NAME_MAX_LENGTH,
    STATUS_MAX_LENGTH,
    STOCK_QUANTITY_PRECISION,
    STOCK_QUANTITY_SCALE,
)
from app.constants.status import EntityStatus
from app.db.audit_mixin import AuditedMixin
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.business import Business
    from app.db.models.category import Category
    from app.db.models.provider import Provider
    from app.db.models.unit import Unit
    from app.db.models.variant import Variant

PRODUCT_PRESENTATION_COMPLETE_CONSTRAINT_NAME = "presentation_complete"
PRODUCT_PRESENTATION_QUANTITY_POSITIVE_CONSTRAINT_NAME = "presentation_quantity_positive"


class Product(Base, AuditedMixin):
    __tablename__ = "product"
    __table_args__ = (
        status_check_constraint(),
        CheckConstraint(
            "(presentation_name IS NULL AND presentation_plural_name IS NULL "
            "AND presentation_quantity IS NULL) OR (presentation_name IS NOT NULL "
            "AND presentation_plural_name IS NOT NULL AND presentation_quantity IS NOT NULL)",
            name=PRODUCT_PRESENTATION_COMPLETE_CONSTRAINT_NAME,
        ),
        CheckConstraint(
            "presentation_quantity IS NULL OR presentation_quantity > 0",
            name=PRODUCT_PRESENTATION_QUANTITY_POSITIVE_CONSTRAINT_NAME,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    unit_id: Mapped[int] = mapped_column(ForeignKey("unit.id"), nullable=False)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("provider.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )
    image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    presentation_name: Mapped[str | None] = mapped_column(
        String(PRESENTATION_NAME_MAX_LENGTH), nullable=True
    )
    presentation_plural_name: Mapped[str | None] = mapped_column(
        String(PRESENTATION_NAME_MAX_LENGTH), nullable=True
    )
    presentation_quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(STOCK_QUANTITY_PRECISION, STOCK_QUANTITY_SCALE), nullable=True
    )

    business: Mapped["Business"] = relationship(back_populates="products")
    category: Mapped["Category"] = relationship(back_populates="products")
    unit: Mapped["Unit"] = relationship(back_populates="products")
    provider: Mapped["Provider | None"] = relationship(back_populates="products")
    variants: Mapped[list["Variant"]] = relationship(back_populates="product")
