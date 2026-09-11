from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.audit_mixin import AuditedMixin
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.business import Business
    from app.db.models.category import Category
    from app.db.models.product import Product


class Provider(Base, AuditedMixin):
    __tablename__ = "provider"
    __table_args__ = (
        status_check_constraint(),
        UniqueConstraint("business_id", "name", name="uq_provider_business_id_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(NAME_MAX_LENGTH), nullable=True)
    email: Mapped[str | None] = mapped_column(String(NAME_MAX_LENGTH), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(NAME_MAX_LENGTH), nullable=True)
    last_purchase_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    business: Mapped["Business"] = relationship(back_populates="providers")
    categories: Mapped[list["Category"]] = relationship(
        secondary="provider_category", back_populates="providers"
    )
    products: Mapped[list["Product"]] = relationship(back_populates="provider")
