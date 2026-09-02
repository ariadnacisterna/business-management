from sqlalchemy import CheckConstraint

from app.constants.status import EntityStatus

STATUS_CHECK_CONSTRAINT_NAME = "status_valid"


def status_check_constraint(name: str = STATUS_CHECK_CONSTRAINT_NAME) -> CheckConstraint:
    allowed_values = ", ".join(f"'{status.value}'" for status in EntityStatus)
    return CheckConstraint(f"status IN ({allowed_values})", name=name)
