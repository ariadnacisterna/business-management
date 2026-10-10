from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.access import IP_ADDRESS_MAX_LENGTH, LOGIN_OUTCOME_MAX_LENGTH
from app.constants.limits import USERNAME_MAX_LENGTH
from app.db.base import Base


class LoginAttempt(Base):
    __tablename__ = "login_attempt"
    __table_args__ = (
        Index("ix_login_attempt_user_name_attempted_at", "user_name", "attempted_at"),
        Index("ix_login_attempt_ip_address_attempted_at", "ip_address", "attempted_at"),
        Index("ix_login_attempt_attempted_at", "attempted_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_name: Mapped[str] = mapped_column(String(USERNAME_MAX_LENGTH), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(IP_ADDRESS_MAX_LENGTH), nullable=False)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    outcome: Mapped[str] = mapped_column(String(LOGIN_OUTCOME_MAX_LENGTH), nullable=False)
