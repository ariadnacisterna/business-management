from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import (
    NAME_MAX_LENGTH,
    PASSWORD_HASH_MAX_LENGTH,
    STATUS_MAX_LENGTH,
    USERNAME_MAX_LENGTH,
)
from app.constants.status import EntityStatus
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.account_session import AccountSession
    from app.db.models.business_access import BusinessAccess
    from app.db.models.organization import Organization


class Account(Base):
    __tablename__ = "account"
    __table_args__ = (status_check_constraint(),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organization.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    user_name: Mapped[str] = mapped_column(String(USERNAME_MAX_LENGTH), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(PASSWORD_HASH_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    organization: Mapped["Organization"] = relationship(back_populates="accounts")
    accesses: Mapped[list["BusinessAccess"]] = relationship(back_populates="account")
    sessions: Mapped[list["AccountSession"]] = relationship(back_populates="account")
