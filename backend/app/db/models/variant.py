from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.attribute_value import AttributeValue
    from app.db.models.product import Product


class Variant(Base):
    __tablename__ = "variant"
    __table_args__ = (status_check_constraint(),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), nullable=False)
    label: Mapped[str | None] = mapped_column(String(NAME_MAX_LENGTH), nullable=True)
    is_implicit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    product: Mapped["Product"] = relationship(back_populates="variants")
    attribute_values: Mapped[list["AttributeValue"]] = relationship(
        secondary="variant_attribute_value", back_populates="variants"
    )
