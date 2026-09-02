from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import Attribute
from app.domain.catalog.errors import AttributeNotFound, DuplicateAttributeName, InvalidCatalogInput


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidCatalogInput("El nombre no puede estar vacio")
    return stripped


def _check_duplicate_name(db: Session, organization_id: int, name: str) -> None:
    normalized = normalize_for_comparison(name)
    existing = db.scalars(select(Attribute).where(Attribute.organization_id == organization_id))
    for candidate in existing:
        if normalize_for_comparison(candidate.name) == normalized:
            raise DuplicateAttributeName


def create_attribute(
    db: Session, organization_id: int, name: str, actor_account_id: int
) -> Attribute:
    name = _validate_name(name)
    _check_duplicate_name(db, organization_id, name)

    now = datetime.now(UTC)
    attribute = Attribute(
        organization_id=organization_id,
        name=name,
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(attribute)
    db.commit()
    db.refresh(attribute)
    return attribute


def list_attributes(db: Session, organization_id: int) -> list[Attribute]:
    return list(
        db.scalars(
            select(Attribute)
            .where(Attribute.organization_id == organization_id)
            .order_by(Attribute.name)
        ).all()
    )


def get_attribute(db: Session, attribute_id: int) -> Attribute:
    attribute = db.get(Attribute, attribute_id)
    if attribute is None:
        raise AttributeNotFound
    return attribute
