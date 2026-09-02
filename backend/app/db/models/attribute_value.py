from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.attribute import Attribute
    from app.db.models.variant import Variant


class AttributeValue(Base):
    __tablename__ = "attribute_value"
    __table_args__ = (
        status_check_constraint(),
        Index(
            "uq_attribute_value_attribute_id_normalized_value",
            "attribute_id",
            "normalized_value",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    attribute_id: Mapped[int] = mapped_column(ForeignKey("attribute.id"), nullable=False)
    value: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    normalized_value: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    attribute: Mapped["Attribute"] = relationship(back_populates="values")
    variants: Mapped[list["Variant"]] = relationship(
        secondary="variant_attribute_value", back_populates="attribute_values"
    )
