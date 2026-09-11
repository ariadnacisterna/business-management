from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import Customer
from app.domain.catalog.errors import (
    CustomerNotFound,
    DuplicateCustomerName,
    InvalidCatalogInput,
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
    query = select(Customer).where(Customer.business_id == business_id)
    if exclude_id is not None:
        query = query.where(Customer.id != exclude_id)
    for existing in db.scalars(query):
        if normalize_for_comparison(existing.name) == normalized:
            raise DuplicateCustomerName


def create_customer(
    db: Session,
    business_id: int,
    name: str,
    actor_account_id: int,
    phone: str | None = None,
) -> Customer:
    name = _validate_name(name)
    _check_duplicate_name(db, business_id, name)

    now = datetime.now(UTC)
    customer = Customer(
        business_id=business_id,
        name=name,
        phone=_normalize_optional(phone),
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def update_customer(
    db: Session,
    business_id: int,
    customer_id: int,
    actor_account_id: int,
    name: str | None = None,
    phone: str | None = None,
) -> Customer:
    customer = get_customer(db, business_id, customer_id)

    if name is not None:
        name = _validate_name(name)
        _check_duplicate_name(db, business_id, name, exclude_id=customer.id)
        customer.name = name

    if phone is not None:
        customer.phone = _normalize_optional(phone)

    customer.updated_by_account_id = actor_account_id
    customer.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(customer)
    return customer


def list_customers(db: Session, business_id: int) -> list[Customer]:
    return list(
        db.scalars(
            select(Customer).where(Customer.business_id == business_id).order_by(Customer.name)
        ).all()
    )


def get_customer(db: Session, business_id: int, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None or customer.business_id != business_id:
        raise CustomerNotFound
    return customer


def deactivate_customer(
    db: Session, business_id: int, customer_id: int, actor_account_id: int
) -> Customer:
    customer = get_customer(db, business_id, customer_id)
    customer.status = EntityStatus.INACTIVE.value
    customer.updated_by_account_id = actor_account_id
    customer.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(customer)
    return customer


def reactivate_customer(
    db: Session, business_id: int, customer_id: int, actor_account_id: int
) -> Customer:
    customer = get_customer(db, business_id, customer_id)
    customer.status = EntityStatus.ACTIVE.value
    customer.updated_by_account_id = actor_account_id
    customer.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(customer)
    return customer
