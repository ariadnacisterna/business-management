from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.access import CSRF_TOKEN_MAX_LENGTH, SESSION_TOKEN_MAX_LENGTH
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.account import Account


class AccountSession(Base):
    __tablename__ = "account_session"

    id: Mapped[str] = mapped_column(String(SESSION_TOKEN_MAX_LENGTH), primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(CSRF_TOKEN_MAX_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active_business_id: Mapped[int | None] = mapped_column(ForeignKey("business.id"), nullable=True)

    account: Mapped["Account"] = relationship(back_populates="sessions")
