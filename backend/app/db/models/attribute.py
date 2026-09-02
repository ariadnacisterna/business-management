from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH, STATUS_MAX_LENGTH
from app.constants.status import EntityStatus
from app.db.audit_mixin import AuditedMixin
from app.db.base import Base
from app.db.constraints import status_check_constraint

if TYPE_CHECKING:
    from app.db.models.attribute_value import AttributeValue
    from app.db.models.organization import Organization


class Attribute(Base, AuditedMixin):
    __tablename__ = "attribute"
    __table_args__ = (
        status_check_constraint(),
        UniqueConstraint("organization_id", "name", name="uq_attribute_organization_id_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organization.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(
        String(STATUS_MAX_LENGTH), nullable=False, default=EntityStatus.ACTIVE.value
    )

    organization: Mapped["Organization"] = relationship(back_populates="attributes")
    values: Mapped[list["AttributeValue"]] = relationship(back_populates="attribute")
