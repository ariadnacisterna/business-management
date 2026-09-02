from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.business_access import BusinessAccess


class Role(Base):
    __tablename__ = "role"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False, unique=True)

    accesses: Mapped[list["BusinessAccess"]] = relationship(back_populates="role")
