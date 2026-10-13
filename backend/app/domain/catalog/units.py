from datetime import UTC, datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.locks import LockKind, lock_until_commit
from app.db.models import Product, Unit, Variant
from app.domain.catalog.errors import (
    DuplicateUnitName,
    FractionalStockBlocksUnitChange,
    InvalidCatalogInput,
    UnitNotFound,
)


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidCatalogInput("El nombre no puede estar vacio")
    return stripped


def _validate_abbreviation(abbreviation: str) -> str:
    stripped = abbreviation.strip()
    if not stripped:
        raise InvalidCatalogInput("La abreviatura no puede estar vacia")
    return stripped


def _check_duplicate_name(
    db: Session, business_id: int, name: str, exclude_id: int | None = None
) -> None:
    lock_until_commit(db, LockKind.UNIT_NAMES, business_id)
    normalized = normalize_for_comparison(name)
    query = select(Unit).where(Unit.business_id == business_id)
    if exclude_id is not None:
        query = query.where(Unit.id != exclude_id)
    for existing in db.scalars(query):
        if normalize_for_comparison(existing.name) == normalized:
            raise DuplicateUnitName


def add_unit(
    db: Session,
    business_id: int,
    name: str,
    abbreviation: str,
    actor_account_id: int,
    allows_fraction: bool = False,
) -> Unit:
    name = _validate_name(name)
    abbreviation = _validate_abbreviation(abbreviation)
    _check_duplicate_name(db, business_id, name)

    now = datetime.now(UTC)
    unit = Unit(
        business_id=business_id,
        name=name,
        abbreviation=abbreviation,
        allows_fraction=allows_fraction,
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(unit)
    db.flush()
    return unit


def update_unit(
    db: Session,
    business_id: int,
    unit_id: int,
    actor_account_id: int,
    name: str | None = None,
    abbreviation: str | None = None,
    allows_fraction: bool | None = None,
) -> Unit:
    get_unit(db, business_id, unit_id)
    unit = _lock_unit(db, unit_id, shared=False)

    if name is not None:
        name = _validate_name(name)
        _check_duplicate_name(db, business_id, name, exclude_id=unit.id)
        unit.name = name

    if abbreviation is not None:
        unit.abbreviation = _validate_abbreviation(abbreviation)

    if allows_fraction is not None:
        if unit.allows_fraction and not allows_fraction:
            _check_no_fractional_stock(db, unit)
        unit.allows_fraction = allows_fraction

    unit.updated_by_account_id = actor_account_id
    unit.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(unit)
    return unit


def _lock_unit(db: Session, unit_id: int, shared: bool) -> Unit:
    return db.execute(
        select(Unit)
        .where(Unit.id == unit_id)
        .with_for_update(read=shared)
        .execution_options(populate_existing=True)
    ).scalar_one()


def lock_unit_against_changes(db: Session, unit_id: int) -> Unit:
    return _lock_unit(db, unit_id, shared=True)


def products_with_fractional_stock(
    db: Session, product_condition: ColumnElement[bool]
) -> list[str]:
    return list(
        db.scalars(
            select(Product.name)
            .join(Variant, Variant.product_id == Product.id)
            .where(
                product_condition,
                or_(
                    Variant.quantity != func.trunc(Variant.quantity),
                    Variant.minimum_quantity != func.trunc(Variant.minimum_quantity),
                    Product.presentation_quantity != func.trunc(Product.presentation_quantity),
                ),
            )
            .distinct()
            .order_by(Product.name)
        ).all()
    )


def _check_no_fractional_stock(db: Session, unit: Unit) -> None:
    product_names = products_with_fractional_stock(db, Product.unit_id == unit.id)
    if product_names:
        db.rollback()
        raise FractionalStockBlocksUnitChange(
            "La unidad no puede dejar de admitir decimales porque estos productos tienen stock, "
            "stock mínimo o presentación con decimales: "
            + ", ".join(product_names)
            + ". Ajustá esos datos antes de cambiar la unidad."
        )


def list_units(db: Session, business_id: int) -> list[Unit]:
    return list(
        db.scalars(select(Unit).where(Unit.business_id == business_id).order_by(Unit.name)).all()
    )


def get_unit(db: Session, business_id: int, unit_id: int) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None or unit.business_id != business_id:
        raise UnitNotFound
    return unit
