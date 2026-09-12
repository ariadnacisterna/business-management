from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import MovementReason
from app.domain.catalog.errors import (
    DuplicateMovementReasonName,
    InvalidCatalogInput,
    MovementReasonNotFound,
)


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidCatalogInput("El nombre no puede estar vacio")
    return stripped


def _check_duplicate_name(
    db: Session, business_id: int, name: str, exclude_id: int | None = None
) -> None:
    normalized = normalize_for_comparison(name)
    query = select(MovementReason).where(MovementReason.business_id == business_id)
    if exclude_id is not None:
        query = query.where(MovementReason.id != exclude_id)
    for existing in db.scalars(query):
        if normalize_for_comparison(existing.name) == normalized:
            raise DuplicateMovementReasonName


def create_movement_reason(
    db: Session, business_id: int, name: str, actor_account_id: int
) -> MovementReason:
    name = _validate_name(name)
    _check_duplicate_name(db, business_id, name)

    now = datetime.now(UTC)
    reason = MovementReason(
        business_id=business_id,
        name=name,
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(reason)
    db.commit()
    db.refresh(reason)
    return reason


def update_movement_reason(
    db: Session,
    business_id: int,
    reason_id: int,
    actor_account_id: int,
    name: str | None = None,
) -> MovementReason:
    reason = get_movement_reason(db, business_id, reason_id)

    if name is not None:
        name = _validate_name(name)
        _check_duplicate_name(db, business_id, name, exclude_id=reason.id)
        reason.name = name

    reason.updated_by_account_id = actor_account_id
    reason.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(reason)
    return reason


def list_movement_reasons(db: Session, business_id: int) -> list[MovementReason]:
    return list(
        db.scalars(
            select(MovementReason)
            .where(MovementReason.business_id == business_id)
            .order_by(MovementReason.name)
        ).all()
    )


def get_movement_reason(db: Session, business_id: int, reason_id: int) -> MovementReason:
    reason = db.get(MovementReason, reason_id)
    if reason is None or reason.business_id != business_id:
        raise MovementReasonNotFound
    return reason


def deactivate_movement_reason(
    db: Session, business_id: int, reason_id: int, actor_account_id: int
) -> MovementReason:
    reason = get_movement_reason(db, business_id, reason_id)
    reason.status = EntityStatus.INACTIVE.value
    reason.updated_by_account_id = actor_account_id
    reason.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(reason)
    return reason


def reactivate_movement_reason(
    db: Session, business_id: int, reason_id: int, actor_account_id: int
) -> MovementReason:
    reason = get_movement_reason(db, business_id, reason_id)
    reason.status = EntityStatus.ACTIVE.value
    reason.updated_by_account_id = actor_account_id
    reason.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(reason)
    return reason
