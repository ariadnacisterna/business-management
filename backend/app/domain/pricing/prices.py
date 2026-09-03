from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.db.models import Price, Product, Variant
from app.domain.catalog.products import get_product, get_variant
from app.domain.pricing.errors import (
    InvalidPriceAmount,
    MissingExpectedPrice,
    PriceConflict,
    ProductHasNoPriceableVariants,
    ProductPriceConflict,
)


def _validate_amount(amount: Decimal) -> Decimal:
    if amount <= 0:
        raise InvalidPriceAmount("El precio debe ser estrictamente mayor que cero")
    return amount


def get_current_prices_for_variants(
    db: Session, variant_ids: list[int], business_id: int
) -> dict[int, Price]:
    if not variant_ids:
        return {}

    rows = db.scalars(
        select(Price).where(
            Price.variant_id.in_(variant_ids),
            Price.business_id == business_id,
            Price.effective_to.is_(None),
        )
    ).all()
    return {price.variant_id: price for price in rows}


def _get_current_price(db: Session, variant_id: int, business_id: int) -> Price | None:
    return get_current_prices_for_variants(db, [variant_id], business_id).get(variant_id)


def _current_price_id(current_price: Price | None) -> int | None:
    return current_price.id if current_price is not None else None


def _apply_price_change(
    db: Session,
    variant_id: int,
    business_id: int,
    amount: Decimal,
    actor_account_id: int,
    now: datetime,
    current_price: Price | None,
) -> Price:
    if current_price is not None:
        current_price.effective_to = now

    new_price = Price(
        variant_id=variant_id,
        business_id=business_id,
        amount=amount,
        effective_from=now,
        effective_to=None,
        created_by_account_id=actor_account_id,
        created_at=now,
    )
    db.add(new_price)
    db.flush()
    return new_price


def get_current_price_for_variant(db: Session, variant_id: int, business_id: int) -> Price | None:
    variant = get_variant(db, variant_id)
    return _get_current_price(db, variant.id, business_id)


def list_price_history(db: Session, variant_id: int, business_id: int) -> list[Price]:
    variant = get_variant(db, variant_id)
    return list(
        db.scalars(
            select(Price)
            .where(Price.variant_id == variant.id, Price.business_id == business_id)
            .order_by(Price.effective_from)
        ).all()
    )


def change_variant_price(
    db: Session,
    variant_id: int,
    business_id: int,
    amount: Decimal,
    actor_account_id: int,
    expected_current_price_id: int | None,
) -> Price:
    variant = get_variant(db, variant_id)
    amount = _validate_amount(amount)

    current_price = _get_current_price(db, variant.id, business_id)
    if _current_price_id(current_price) != expected_current_price_id:
        raise PriceConflict(current_price)

    now = datetime.now(UTC)
    new_price = _apply_price_change(
        db, variant.id, business_id, amount, actor_account_id, now, current_price
    )

    db.commit()
    db.refresh(new_price)
    return new_price


def _active_variants(product: Product) -> list[Variant]:
    return [variant for variant in product.variants if variant.status == EntityStatus.ACTIVE.value]


def change_product_price(
    db: Session,
    product_id: int,
    business_id: int,
    amount: Decimal,
    actor_account_id: int,
    expected_current_price_ids: dict[int, int | None],
) -> list[Price]:
    product = get_product(db, product_id)
    amount = _validate_amount(amount)

    active_variants = _active_variants(product)
    if not active_variants:
        raise ProductHasNoPriceableVariants

    active_variant_ids = {variant.id for variant in active_variants}
    if set(expected_current_price_ids) != active_variant_ids:
        raise MissingExpectedPrice(
            "Debe indicarse el precio vigente esperado de cada variante activa del producto"
        )

    current_prices = {
        variant.id: _get_current_price(db, variant.id, business_id) for variant in active_variants
    }

    has_conflict = any(
        _current_price_id(current_prices[variant_id]) != expected_current_price_ids[variant_id]
        for variant_id in active_variant_ids
    )
    if has_conflict:
        raise ProductPriceConflict(current_prices)

    now = datetime.now(UTC)
    new_prices = [
        _apply_price_change(
            db,
            variant.id,
            business_id,
            amount,
            actor_account_id,
            now,
            current_prices[variant.id],
        )
        for variant in active_variants
    ]

    db.commit()
    for new_price in new_prices:
        db.refresh(new_price)
    return new_prices
