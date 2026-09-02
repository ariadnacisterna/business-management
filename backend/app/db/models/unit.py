from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH, UNIT_ABBREVIATION_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.product import Product


class Unit(Base):
    __tablename__ = "unit"
    __table_args__ = (
        status_check_constraint(),
        UniqueConstraint("organization_id", "name", name="uq_unit_organization_id_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organization.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(UNIT_ABBREVIATION_MAX_LENGTH), nullable=False)
    allows_fraction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    organization: Mapped["Organization"] = relationship(back_populates="units")
    products: Mapped[list["Product"]] = relationship(back_populates="unit")
