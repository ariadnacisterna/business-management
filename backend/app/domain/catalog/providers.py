from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import Category, Provider
from app.domain.catalog.errors import (
    CategoryNotFound,
    DuplicateProviderName,
    InvalidCatalogInput,
    ProviderNotFound,
)


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidCatalogInput("El nombre no puede estar vacio")
    return stripped


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _check_duplicate_name(
    db: Session, business_id: int, name: str, exclude_id: int | None = None
) -> None:
    normalized = normalize_for_comparison(name)
    query = select(Provider).where(Provider.business_id == business_id)
    if exclude_id is not None:
        query = query.where(Provider.id != exclude_id)
    for existing in db.scalars(query):
        if normalize_for_comparison(existing.name) == normalized:
            raise DuplicateProviderName


def _get_categories(db: Session, business_id: int, category_ids: list[int]) -> list[Category]:
    categories = []
    for category_id in category_ids:
        category = db.get(Category, category_id)
        if category is None or category.business_id != business_id:
            raise CategoryNotFound
        categories.append(category)
    return categories


def create_provider(
    db: Session,
    business_id: int,
    name: str,
    actor_account_id: int,
    contact_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    category_ids: list[int] | None = None,
) -> Provider:
    name = _validate_name(name)
    _check_duplicate_name(db, business_id, name)
    categories = _get_categories(db, business_id, category_ids or [])

    now = datetime.now(UTC)
    provider = Provider(
        business_id=business_id,
        name=name,
        contact_name=_normalize_optional(contact_name),
        email=_normalize_optional(email),
        phone=_normalize_optional(phone),
        categories=categories,
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


def update_provider(
    db: Session,
    business_id: int,
    provider_id: int,
    actor_account_id: int,
    name: str | None = None,
    contact_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    last_purchase_at: date | None = None,
) -> Provider:
    provider = get_provider(db, business_id, provider_id)

    if name is not None:
        name = _validate_name(name)
        _check_duplicate_name(db, business_id, name, exclude_id=provider.id)
        provider.name = name

    if contact_name is not None:
        provider.contact_name = _normalize_optional(contact_name)

    if email is not None:
        provider.email = _normalize_optional(email)

    if phone is not None:
        provider.phone = _normalize_optional(phone)

    if last_purchase_at is not None:
        provider.last_purchase_at = last_purchase_at

    provider.updated_by_account_id = actor_account_id
    provider.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(provider)
    return provider


def set_provider_categories(
    db: Session, business_id: int, provider_id: int, actor_account_id: int, category_ids: list[int]
) -> Provider:
    provider = get_provider(db, business_id, provider_id)
    provider.categories = _get_categories(db, business_id, category_ids)
    provider.updated_by_account_id = actor_account_id
    provider.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(provider)
    return provider


def list_providers(db: Session, business_id: int) -> list[Provider]:
    return list(
        db.scalars(
            select(Provider).where(Provider.business_id == business_id).order_by(Provider.name)
        ).all()
    )


def get_provider(db: Session, business_id: int, provider_id: int) -> Provider:
    provider = db.get(Provider, provider_id)
    if provider is None or provider.business_id != business_id:
        raise ProviderNotFound
    return provider


def deactivate_provider(
    db: Session, business_id: int, provider_id: int, actor_account_id: int
) -> Provider:
    provider = get_provider(db, business_id, provider_id)
    provider.status = EntityStatus.INACTIVE.value
    provider.updated_by_account_id = actor_account_id
    provider.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(provider)
    return provider


def reactivate_provider(
    db: Session, business_id: int, provider_id: int, actor_account_id: int
) -> Provider:
    provider = get_provider(db, business_id, provider_id)
    provider.status = EntityStatus.ACTIVE.value
    provider.updated_by_account_id = actor_account_id
    provider.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(provider)
    return provider
