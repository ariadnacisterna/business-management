from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import INDUSTRY_MAX_LENGTH, NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.business_access import BusinessAccess
    from app.db.models.organization import Organization


class Business(Base):
    __tablename__ = "business"
    __table_args__ = (status_check_constraint(),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organization.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    industry: Mapped[str] = mapped_column(String(INDUSTRY_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    organization: Mapped["Organization"] = relationship(back_populates="businesses")
    accesses: Mapped[list["BusinessAccess"]] = relationship(back_populates="business")
