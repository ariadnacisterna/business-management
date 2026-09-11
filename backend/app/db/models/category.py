from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.audit_mixin import AuditedMixin
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.business import Business
    from app.db.models.product import Product
    from app.db.models.provider import Provider


class Category(Base, AuditedMixin):
    __tablename__ = "category"
    __table_args__ = (
        status_check_constraint(),
        UniqueConstraint("business_id", "name", name="uq_category_business_id_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    business: Mapped["Business"] = relationship(back_populates="categories")
    products: Mapped[list["Product"]] = relationship(back_populates="category")
    providers: Mapped[list["Provider"]] = relationship(
        secondary="provider_category", back_populates="categories"
    )
