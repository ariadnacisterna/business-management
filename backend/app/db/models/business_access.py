from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.account import Account
    from app.db.models.business import Business
    from app.db.models.role import Role


class BusinessAccess(Base):
    __tablename__ = "business_access"
    __table_args__ = (
        status_check_constraint(),
        UniqueConstraint(
            "account_id", "business_id", name="uq_business_access_account_id_business_id"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("role.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    account: Mapped["Account"] = relationship(back_populates="accesses")
    business: Mapped["Business"] = relationship(back_populates="accesses")
    role: Mapped["Role"] = relationship(back_populates="accesses")
