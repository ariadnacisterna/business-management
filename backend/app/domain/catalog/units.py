from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import Unit
from app.domain.catalog.errors import DuplicateUnitName, InvalidCatalogInput, UnitNotFound


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
    db: Session, organization_id: int, name: str, exclude_id: int | None = None
) -> None:
    normalized = normalize_for_comparison(name)
    query = select(Unit).where(Unit.organization_id == organization_id)
    if exclude_id is not None:
        query = query.where(Unit.id != exclude_id)
    for existing in db.scalars(query):
        if normalize_for_comparison(existing.name) == normalized:
            raise DuplicateUnitName


def create_unit(
    db: Session, organization_id: int, name: str, abbreviation: str, allows_fraction: bool = False
) -> Unit:
    name = _validate_name(name)
    abbreviation = _validate_abbreviation(abbreviation)
    _check_duplicate_name(db, organization_id, name)

    unit = Unit(
        organization_id=organization_id,
        name=name,
        abbreviation=abbreviation,
        allows_fraction=allows_fraction,
        status=EntityStatus.ACTIVE.value,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


def update_unit(
    db: Session,
    unit_id: int,
    name: str | None = None,
    abbreviation: str | None = None,
    allows_fraction: bool | None = None,
) -> Unit:
    unit = get_unit(db, unit_id)

    if name is not None:
        name = _validate_name(name)
        _check_duplicate_name(db, unit.organization_id, name, exclude_id=unit.id)
        unit.name = name

    if abbreviation is not None:
        unit.abbreviation = _validate_abbreviation(abbreviation)

    if allows_fraction is not None:
        unit.allows_fraction = allows_fraction

    db.commit()
    db.refresh(unit)
    return unit


def list_units(db: Session, organization_id: int) -> list[Unit]:
    return list(
        db.scalars(
            select(Unit).where(Unit.organization_id == organization_id).order_by(Unit.name)
        ).all()
    )


def get_unit(db: Session, unit_id: int) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise UnitNotFound
    return unit
