from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.limits import PRICE_PRECISION, PRICE_SCALE
from app.constants.status import EntityStatus
from app.db.models import Account, Price, Product, Variant
from app.domain.catalog.products import (
    get_product,
    get_variant,
    get_variant_for_update,
    get_variants_for_update,
)
from app.domain.pricing.errors import InvalidPriceAmount, ProductHasNoPriceableVariants

MAX_PRICE = Decimal(10) ** (PRICE_PRECISION - PRICE_SCALE)
PRICE_STEP = Decimal(1).scaleb(-PRICE_SCALE)


def get_account_names(db: Session, account_ids: list[int]) -> dict[int, str]:
    if not account_ids:
        return {}

    rows = db.scalars(select(Account).where(Account.id.in_(account_ids))).all()
    return {account.id: account.name for account in rows}


def _validate_scale_and_range(value: Decimal, message: str) -> Decimal:
    if not value.is_finite() or abs(value) >= MAX_PRICE:
        raise InvalidPriceAmount(message)
    if value != value.quantize(PRICE_STEP):
        raise InvalidPriceAmount(f"Usá como máximo {PRICE_SCALE} decimales")
    return value.quantize(PRICE_STEP)


def _validate_amount(amount: Decimal) -> Decimal:
    amount = _validate_scale_and_range(amount, "El precio es demasiado grande")
    if amount <= 0:
        raise InvalidPriceAmount("El precio debe ser estrictamente mayor que cero")
    return amount


def _validate_delta(delta: Decimal) -> Decimal:
    delta = _validate_scale_and_range(delta, "La diferencia es demasiado grande")
    if delta == 0:
        raise InvalidPriceAmount("La diferencia no puede ser cero: no hay ningún cambio")
    return delta


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
    variant = get_variant(db, business_id, variant_id)
    return _get_current_price(db, variant.id, business_id)


def list_price_history(db: Session, variant_id: int, business_id: int) -> list[Price]:
    variant = get_variant(db, business_id, variant_id)
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
    actor_account_id: int,
    delta: Decimal | None = None,
    amount: Decimal | None = None,
) -> Price:
    if (delta is None) == (amount is None):
        raise InvalidPriceAmount("Indicá una diferencia o un precio inicial, pero no ambos")

    get_variant(db, business_id, variant_id)
    if delta is not None:
        delta = _validate_delta(delta)
    if amount is not None:
        amount = _validate_amount(amount)

    variant = get_variant_for_update(db, business_id, variant_id)
    current_price = _get_current_price(db, variant.id, business_id)

    if delta is not None:
        if current_price is None:
            db.rollback()
            raise InvalidPriceAmount("La variante todavía no tiene precio: cargá el precio inicial")
        new_amount = current_price.amount + delta
        if new_amount <= 0:
            db.rollback()
            raise InvalidPriceAmount("El precio no puede quedar en cero o menos")
        if new_amount >= MAX_PRICE:
            db.rollback()
            raise InvalidPriceAmount("El precio resultante es demasiado grande")
    else:
        if current_price is not None:
            db.rollback()
            raise InvalidPriceAmount(
                "La variante ya tiene precio: indicá cuánto sumar o restar en lugar del precio"
            )
        new_amount = amount

    now = datetime.now(UTC)
    new_price = _apply_price_change(
        db, variant.id, business_id, new_amount, actor_account_id, now, current_price
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
    delta: Decimal,
    actor_account_id: int,
) -> tuple[list[Price], list[int]]:
    product = get_product(db, business_id, product_id)
    delta = _validate_delta(delta)

    active_variant_ids = sorted(variant.id for variant in _active_variants(product))
    if not active_variant_ids:
        raise ProductHasNoPriceableVariants

    locked_variants = get_variants_for_update(db, active_variant_ids)
    current_prices = get_current_prices_for_variants(db, active_variant_ids, business_id)

    priced_variants = [variant for variant in locked_variants if variant.id in current_prices]
    skipped_variant_ids = [
        variant.id for variant in locked_variants if variant.id not in current_prices
    ]
    if not priced_variants:
        db.rollback()
        raise InvalidPriceAmount(
            "Ninguna variante activa tiene precio: cargá el precio inicial de cada una"
        )

    new_amounts = {
        variant.id: current_prices[variant.id].amount + delta for variant in priced_variants
    }
    too_low = [
        variant.label or product.name for variant in priced_variants if new_amounts[variant.id] <= 0
    ]
    if too_low:
        db.rollback()
        raise InvalidPriceAmount(
            "El precio no puede quedar en cero o menos en: " + ", ".join(too_low)
        )
    too_high = [
        variant.label or product.name
        for variant in priced_variants
        if new_amounts[variant.id] >= MAX_PRICE
    ]
    if too_high:
        db.rollback()
        raise InvalidPriceAmount(
            "El precio resultante es demasiado grande en: " + ", ".join(too_high)
        )

    now = datetime.now(UTC)
    new_prices = [
        _apply_price_change(
            db,
            variant.id,
            business_id,
            new_amounts[variant.id],
            actor_account_id,
            now,
            current_prices[variant.id],
        )
        for variant in priced_variants
    ]

    db.commit()
    for new_price in new_prices:
        db.refresh(new_price)
    return new_prices, skipped_variant_ids
