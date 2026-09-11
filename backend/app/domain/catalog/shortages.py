from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants.status import SHORTAGE_OPEN_STATUSES, ShortageStatus
from app.db.models import Product, Shortage, Variant
from app.domain.catalog.errors import (
    DuplicateOpenShortage,
    InvalidShortageTransition,
    ShortageNotFound,
)
from app.domain.catalog.products import get_variant

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    ShortageStatus.FALTANTE.value: {ShortageStatus.PEDIDO.value},
    ShortageStatus.PEDIDO.value: {ShortageStatus.RECIBIDO.value, ShortageStatus.FALTANTE.value},
    ShortageStatus.RECIBIDO.value: set(),
}


def _has_open_shortage(db: Session, variant_id: int) -> bool:
    return (
        db.scalars(
            select(Shortage).where(
                Shortage.variant_id == variant_id,
                Shortage.status.in_(SHORTAGE_OPEN_STATUSES),
            )
        ).first()
        is not None
    )


def create_shortage(
    db: Session, business_id: int, variant_id: int, actor_account_id: int
) -> Shortage:
    variant = get_variant(db, business_id, variant_id)
    if _has_open_shortage(db, variant.id):
        raise DuplicateOpenShortage

    now = datetime.now(UTC)
    shortage = Shortage(
        variant_id=variant.id,
        status=ShortageStatus.FALTANTE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(shortage)
    db.commit()
    db.refresh(shortage)
    return shortage


def get_shortage(db: Session, business_id: int, shortage_id: int) -> Shortage:
    shortage = db.get(Shortage, shortage_id)
    if shortage is None or shortage.variant.product.business_id != business_id:
        raise ShortageNotFound
    return shortage


def change_shortage_status(
    db: Session, business_id: int, shortage_id: int, actor_account_id: int, new_status: str
) -> Shortage:
    shortage = get_shortage(db, business_id, shortage_id)
    if new_status not in ALLOWED_TRANSITIONS.get(shortage.status, set()):
        raise InvalidShortageTransition

    shortage.status = new_status
    shortage.updated_by_account_id = actor_account_id
    shortage.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(shortage)
    return shortage


def list_shortages(
    db: Session,
    business_id: int,
    status: str | None = None,
    provider_id: int | None = None,
    category_id: int | None = None,
) -> list[Shortage]:
    query = (
        select(Shortage)
        .join(Variant, Shortage.variant_id == Variant.id)
        .join(Product, Variant.product_id == Product.id)
        .where(Product.business_id == business_id)
    )

    if status is not None:
        query = query.where(Shortage.status == status)
    else:
        query = query.where(Shortage.status.in_(SHORTAGE_OPEN_STATUSES))

    if provider_id is not None:
        query = query.where(Product.provider_id == provider_id)

    if category_id is not None:
        query = query.where(Product.category_id == category_id)

    return list(db.scalars(query.order_by(Shortage.created_at)).all())


def count_open_shortages(db: Session, business_id: int) -> int:
    query = (
        select(func.count())
        .select_from(Shortage)
        .join(Variant, Shortage.variant_id == Variant.id)
        .join(Product, Variant.product_id == Product.id)
        .where(Product.business_id == business_id, Shortage.status.in_(SHORTAGE_OPEN_STATUSES))
    )
    return db.scalar(query) or 0
