from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import AttributeValue
from app.domain.catalog.attributes import get_attribute
from app.domain.catalog.errors import (
    AttributeValueNotFound,
    DuplicateAttributeValue,
    InvalidCatalogInput,
)


def _validate_value(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise InvalidCatalogInput("El valor no puede estar vacio")
    return stripped


def _check_duplicate_value(
    db: Session, attribute_id: int, normalized_value: str, exclude_id: int | None = None
) -> None:
    query = select(AttributeValue).where(
        AttributeValue.attribute_id == attribute_id,
        AttributeValue.status == EntityStatus.ACTIVE.value,
    )
    if exclude_id is not None:
        query = query.where(AttributeValue.id != exclude_id)
    for existing in db.scalars(query):
        if existing.normalized_value == normalized_value:
            raise DuplicateAttributeValue


def _build_attribute_value(
    db: Session, attribute_id: int, value: str, actor_account_id: int
) -> AttributeValue:
    attribute = get_attribute(db, attribute_id)
    value = _validate_value(value)
    normalized_value = normalize_for_comparison(value)
    _check_duplicate_value(db, attribute.id, normalized_value)

    now = datetime.now(UTC)
    attribute_value = AttributeValue(
        attribute_id=attribute.id,
        value=value,
        normalized_value=normalized_value,
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(attribute_value)
    db.flush()
    return attribute_value


def create_attribute_value(
    db: Session, attribute_id: int, value: str, actor_account_id: int
) -> AttributeValue:
    attribute_value = _build_attribute_value(db, attribute_id, value, actor_account_id)
    db.commit()
    db.refresh(attribute_value)
    return attribute_value


def update_attribute_value(
    db: Session, attribute_value_id: int, value: str, actor_account_id: int
) -> AttributeValue:
    attribute_value = get_attribute_value(db, attribute_value_id)
    value = _validate_value(value)
    normalized_value = normalize_for_comparison(value)
    _check_duplicate_value(
        db, attribute_value.attribute_id, normalized_value, exclude_id=attribute_value.id
    )

    attribute_value.value = value
    attribute_value.normalized_value = normalized_value
    attribute_value.updated_by_account_id = actor_account_id
    attribute_value.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(attribute_value)
    return attribute_value


def list_attribute_values(
    db: Session, attribute_id: int, active_only: bool = True
) -> list[AttributeValue]:
    query = select(AttributeValue).where(AttributeValue.attribute_id == attribute_id)
    if active_only:
        query = query.where(AttributeValue.status == EntityStatus.ACTIVE.value)
    return list(db.scalars(query.order_by(AttributeValue.value)).all())


def get_attribute_value(db: Session, attribute_value_id: int) -> AttributeValue:
    attribute_value = db.get(AttributeValue, attribute_value_id)
    if attribute_value is None:
        raise AttributeValueNotFound
    return attribute_value
