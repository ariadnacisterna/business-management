from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants.limits import DEFAULT_MINIMUM_STOCK
from app.constants.status import EntityStatus, StockStatus
from app.db.models import Product, StockMovement, Variant
from app.domain.catalog.errors import InactiveMovementReason, InvalidStockQuantity
from app.domain.catalog.movement_reasons import get_movement_reason
from app.domain.catalog.products import get_variant


def effective_minimum_quantity(variant: Variant) -> int:
    if variant.minimum_quantity is not None:
        return variant.minimum_quantity
    return DEFAULT_MINIMUM_STOCK


def stock_status(variant: Variant) -> str:
    if variant.quantity == 0:
        return StockStatus.SIN_STOCK.value
    if variant.quantity <= effective_minimum_quantity(variant):
        return StockStatus.STOCK_BAJO.value
    return StockStatus.NORMAL.value


def set_minimum_quantity(
    db: Session,
    business_id: int,
    variant_id: int,
    actor_account_id: int,
    minimum_quantity: int | None,
) -> Variant:
    variant = get_variant(db, business_id, variant_id)
    if minimum_quantity is not None and minimum_quantity < 0:
        raise InvalidStockQuantity("El stock minimo no puede ser negativo")

    variant.minimum_quantity = minimum_quantity
    variant.updated_by_account_id = actor_account_id
    variant.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(variant)
    return variant


def adjust_stock(
    db: Session,
    business_id: int,
    variant_id: int,
    actor_account_id: int,
    new_quantity: int,
    reason_id: int,
    observation: str | None = None,
) -> StockMovement:
    variant = get_variant(db, business_id, variant_id)
    if new_quantity < 0:
        raise InvalidStockQuantity("La cantidad no puede ser negativa")

    reason = get_movement_reason(db, business_id, reason_id)
    if reason.status != EntityStatus.ACTIVE.value:
        raise InactiveMovementReason

    stripped_observation = observation.strip() if observation else None

    quantity_before = variant.quantity
    variant.quantity = new_quantity

    now = datetime.now(UTC)
    movement = StockMovement(
        variant_id=variant.id,
        reason_id=reason.id,
        quantity_before=quantity_before,
        quantity_after=new_quantity,
        observation=stripped_observation or None,
        created_by_account_id=actor_account_id,
        created_at=now,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    db.refresh(variant)
    return movement


def list_stock_movements(db: Session, business_id: int, variant_id: int) -> list[StockMovement]:
    get_variant(db, business_id, variant_id)
    return list(
        db.scalars(
            select(StockMovement)
            .where(StockMovement.variant_id == variant_id)
            .order_by(StockMovement.created_at.desc())
        ).all()
    )


def count_low_stock(db: Session, business_id: int) -> int:
    query = (
        select(func.count())
        .select_from(Variant)
        .join(Product, Variant.product_id == Product.id)
        .where(
            Product.business_id == business_id,
            Product.status == EntityStatus.ACTIVE.value,
            Variant.status == EntityStatus.ACTIVE.value,
            Variant.quantity <= func.coalesce(Variant.minimum_quantity, DEFAULT_MINIMUM_STOCK),
        )
    )
    return db.scalar(query) or 0
