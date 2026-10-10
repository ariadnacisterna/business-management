from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.submission import (
    SUBMISSION_FINGERPRINT_LENGTH,
    SUBMISSION_KEY_MAX_LENGTH,
    SUBMISSION_OPERATION_MAX_LENGTH,
    SUBMISSION_UNIQUE_CONSTRAINT_NAME,
)
from app.db.base import Base


class Submission(Base):
    __tablename__ = "submission"
    __table_args__ = (
        UniqueConstraint("account_id", "key", name=SUBMISSION_UNIQUE_CONSTRAINT_NAME),
        Index("ix_submission_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(SUBMISSION_KEY_MAX_LENGTH), nullable=False)
    operation: Mapped[str] = mapped_column(String(SUBMISSION_OPERATION_MAX_LENGTH), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(
        String(SUBMISSION_FINGERPRINT_LENGTH), nullable=False
    )
    response_body: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
