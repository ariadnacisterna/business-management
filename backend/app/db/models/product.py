from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.audit_mixin import AuditedMixin
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.category import Category
    from app.db.models.organization import Organization
    from app.db.models.unit import Unit
    from app.db.models.variant import Variant


class Product(Base, AuditedMixin):
    __tablename__ = "product"
    __table_args__ = (status_check_constraint(),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organization.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    unit_id: Mapped[int] = mapped_column(ForeignKey("unit.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    organization: Mapped["Organization"] = relationship(back_populates="products")
    category: Mapped["Category"] = relationship(back_populates="products")
    unit: Mapped["Unit"] = relationship(back_populates="products")
    variants: Mapped[list["Variant"]] = relationship(back_populates="product")
