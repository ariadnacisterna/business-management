from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.constants.limits import DEFAULT_MINIMUM_STOCK, MAX_STOCK_QUANTITY
from app.constants.status import EntityStatus, StockStatus
from app.db.models import Product, StockMovement, Unit, Variant
from app.domain.catalog.errors import InvalidStockQuantity, PresentationChanged
from app.domain.catalog.products import (
    get_variant,
    get_variant_for_update,
    get_variants_for_update,
    lock_product_against_unit_change,
)
from app.domain.catalog.quantities import (
    STOCK_STEP,
    format_stock_amount,
    validate_quantity_for_unit,
)
from app.domain.catalog.shortages import open_shortage_if_missing, receive_open_shortages
from app.domain.catalog.units import lock_unit_against_changes


def effective_minimum_quantity(variant: Variant) -> Decimal:
    if variant.minimum_quantity is not None:
        return variant.minimum_quantity
    return Decimal(DEFAULT_MINIMUM_STOCK).quantize(STOCK_STEP)


def stock_status(variant: Variant) -> str:
    if variant.quantity == 0:
        return StockStatus.SIN_STOCK.value
    if variant.quantity <= effective_minimum_quantity(variant):
        return StockStatus.STOCK_BAJO.value
    return StockStatus.NORMAL.value


def _lock_product_and_unit(db: Session, variant: Variant) -> tuple[Product, Unit]:
    product = lock_product_against_unit_change(db, variant.product_id)
    return product, lock_unit_against_changes(db, product.unit_id)


def _to_product_unit(
    value: Decimal,
    product: Product,
    unit: Unit,
    in_presentations: bool,
    presentation_quantity: Decimal | None,
    too_large_message: str,
) -> Decimal:
    if presentation_quantity is not None and presentation_quantity != product.presentation_quantity:
        raise PresentationChanged(
            "La presentación de este producto cambió mientras cargabas el dato. "
            "Revisá cómo se ve el stock ahora y volvé a intentar."
        )
    if in_presentations:
        if product.presentation_quantity is None:
            raise InvalidStockQuantity(
                "Este producto no tiene presentación: cargá la cantidad en la unidad del producto"
            )
        if presentation_quantity is None:
            raise InvalidStockQuantity(
                "Falta el largo de la presentación que se ve en pantalla. Volvé a intentar."
            )
        if not value.is_finite() or abs(value) > MAX_STOCK_QUANTITY:
            raise InvalidStockQuantity(too_large_message)
        if value != value.to_integral_value():
            raise InvalidStockQuantity(
                f"Los {product.presentation_plural_name} se cargan en números enteros"
            )
        value = value * product.presentation_quantity
    return validate_quantity_for_unit(value, unit, too_large_message)


def set_minimum_quantity(
    db: Session,
    business_id: int,
    variant_id: int,
    actor_account_id: int,
    minimum_quantity: Decimal | None,
    in_presentations: bool = False,
    presentation_quantity: Decimal | None = None,
) -> Variant:
    variant = get_variant(db, business_id, variant_id)
    if minimum_quantity is not None:
        if minimum_quantity < 0:
            raise InvalidStockQuantity("El stock minimo no puede ser negativo")
        product, unit = _lock_product_and_unit(db, variant)
        try:
            minimum_quantity = _to_product_unit(
                minimum_quantity,
                product,
                unit,
                in_presentations,
                presentation_quantity,
                "El stock minimo es demasiado grande",
            )
        except (InvalidStockQuantity, PresentationChanged):
            db.rollback()
            raise

    variant.minimum_quantity = minimum_quantity
    variant.updated_by_account_id = actor_account_id
    variant.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(variant)
    return variant


def apply_stock_adjustment(
    db: Session,
    business_id: int,
    variant_id: int,
    actor_account_id: int,
    delta: Decimal,
    observation: str | None = None,
    in_presentations: bool = False,
    presentation_quantity: Decimal | None = None,
) -> StockMovement:
    variant = get_variant(db, business_id, variant_id)
    if delta == 0:
        raise InvalidStockQuantity("El ajuste no puede ser cero: no hay ningún cambio")
    product, unit = _lock_product_and_unit(db, variant)
    try:
        delta = _to_product_unit(
            delta,
            product,
            unit,
            in_presentations,
            presentation_quantity,
            "La cantidad es demasiado grande",
        )
    except (InvalidStockQuantity, PresentationChanged):
        db.rollback()
        raise

    variant = get_variant_for_update(db, business_id, variant_id)
    quantity_before = variant.quantity
    quantity_after = quantity_before + delta
    if quantity_after < 0:
        db.rollback()
        raise InvalidStockQuantity(
            "No podés descontar más de lo que hay "
            f"({format_stock_amount(quantity_before, product, unit)})"
        )
    if quantity_after > MAX_STOCK_QUANTITY:
        db.rollback()
        raise InvalidStockQuantity("La cantidad resultante es demasiado grande")

    stripped_observation = observation.strip() if observation else None
    return _record_movement(db, variant, quantity_after, actor_account_id, stripped_observation)


def _record_movement(
    db: Session,
    variant: Variant,
    quantity_after: Decimal,
    actor_account_id: int,
    observation: str | None,
    sale_id: int | None = None,
) -> StockMovement:
    movement = StockMovement(
        variant_id=variant.id,
        quantity_before=variant.quantity,
        quantity_after=quantity_after,
        observation=observation or None,
        created_by_account_id=actor_account_id,
        created_at=datetime.now(UTC),
        sale_id=sale_id,
    )
    quantity_before = variant.quantity
    variant.quantity = quantity_after
    db.add(movement)
    db.flush()
    if quantity_before > 0 and quantity_after == 0:
        open_shortage_if_missing(db, variant.id, actor_account_id)
    elif quantity_before == 0 and quantity_after > 0:
        receive_open_shortages(db, variant.id, actor_account_id)
    return movement


@dataclass(frozen=True)
class LockedVariant:
    variant: Variant
    product: Product
    unit: Unit


def lock_variants_for_stock_change(
    db: Session, business_id: int, variant_ids: list[int]
) -> dict[int, LockedVariant]:
    variants = [get_variant(db, business_id, variant_id) for variant_id in sorted(set(variant_ids))]
    products = {
        product_id: lock_product_against_unit_change(db, product_id)
        for product_id in sorted({variant.product_id for variant in variants})
    }
    units = {
        unit_id: lock_unit_against_changes(db, unit_id)
        for unit_id in sorted({product.unit_id for product in products.values()})
    }
    locked_variants = get_variants_for_update(db, [variant.id for variant in variants])
    return {
        variant.id: LockedVariant(
            variant,
            products[variant.product_id],
            units[products[variant.product_id].unit_id],
        )
        for variant in locked_variants
    }


def take_stock_for_sale(
    db: Session,
    variant: Variant,
    quantity: Decimal,
    actor_account_id: int,
    sale_id: int,
    observation: str,
) -> Decimal:
    taken = min(variant.quantity, quantity)
    if taken > 0:
        _record_movement(
            db, variant, variant.quantity - taken, actor_account_id, observation, sale_id
        )
    return taken


def return_stock_from_sale(
    db: Session,
    variant: Variant,
    quantity: Decimal,
    actor_account_id: int,
    sale_id: int,
    observation: str,
) -> None:
    if quantity == 0:
        return
    quantity_after = variant.quantity + quantity
    if quantity_after > MAX_STOCK_QUANTITY:
        raise InvalidStockQuantity("La cantidad resultante es demasiado grande")
    _record_movement(db, variant, quantity_after, actor_account_id, observation, sale_id)


def list_stock_movements(db: Session, business_id: int, variant_id: int) -> list[StockMovement]:
    get_variant(db, business_id, variant_id)
    return list(
        db.scalars(
            select(StockMovement)
            .where(StockMovement.variant_id == variant_id)
            .order_by(StockMovement.created_at.desc())
        ).all()
    )


def list_stock(
    db: Session,
    business_id: int,
    page: int | None = None,
    page_size: int | None = None,
    category_id: int | None = None,
    search: str | None = None,
    quick_filter: str | None = None,
) -> tuple[list[tuple[Product, Variant]], int]:
    query = (
        select(Product, Variant)
        .join(Variant, Variant.product_id == Product.id)
        .where(
            Product.business_id == business_id,
            Product.status == EntityStatus.ACTIVE.value,
            Variant.status == EntityStatus.ACTIVE.value,
        )
    )
    if category_id is not None:
        query = query.where(Product.category_id == category_id)
    if search:
        query = query.where(Product.name.ilike(f"%{search.strip()}%"))
    if quick_filter == StockStatus.SIN_STOCK.value:
        query = query.where(Variant.quantity == 0)
    elif quick_filter == StockStatus.STOCK_BAJO.value:
        query = query.where(
            Variant.quantity > 0,
            Variant.quantity <= func.coalesce(Variant.minimum_quantity, DEFAULT_MINIMUM_STOCK),
        )
    elif quick_filter == StockStatus.NORMAL.value:
        query = query.where(
            Variant.quantity > func.coalesce(Variant.minimum_quantity, DEFAULT_MINIMUM_STOCK),
        )

    query = query.order_by(Product.name, Variant.id)

    if page_size is None:
        rows = list(db.execute(query).all())
        return rows, len(rows)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page_query = query.offset(((page or 1) - 1) * page_size).limit(page_size)
    rows = list(db.execute(page_query).all())
    return rows, total


def get_last_movements(db: Session, variant_ids: list[int]) -> dict[int, StockMovement]:
    if not variant_ids:
        return {}

    ranked = (
        select(
            StockMovement,
            func.row_number()
            .over(partition_by=StockMovement.variant_id, order_by=StockMovement.created_at.desc())
            .label("rn"),
        )
        .where(StockMovement.variant_id.in_(variant_ids))
        .subquery()
    )
    last_movement = aliased(StockMovement, ranked)
    rows = db.scalars(select(last_movement).where(ranked.c.rn == 1)).all()
    return {movement.variant_id: movement for movement in rows}


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


def stock_counts(db: Session, business_id: int) -> dict[str, int]:
    base = (
        select(Variant)
        .join(Product, Variant.product_id == Product.id)
        .where(
            Product.business_id == business_id,
            Product.status == EntityStatus.ACTIVE.value,
            Variant.status == EntityStatus.ACTIVE.value,
        )
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    sin_stock = (
        db.scalar(select(func.count()).select_from(base.where(Variant.quantity == 0).subquery()))
        or 0
    )
    stock_bajo = (
        db.scalar(
            select(func.count()).select_from(
                base.where(
                    Variant.quantity > 0,
                    Variant.quantity
                    <= func.coalesce(Variant.minimum_quantity, DEFAULT_MINIMUM_STOCK),
                ).subquery()
            )
        )
        or 0
    )
    return {"total": total, "stock_bajo": stock_bajo, "sin_stock": sin_stock}
