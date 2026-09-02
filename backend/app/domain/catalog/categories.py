from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import Category
from app.domain.catalog.errors import CategoryNotFound, DuplicateCategoryName, InvalidCatalogInput


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidCatalogInput("El nombre no puede estar vacio")
    return stripped


def _check_duplicate_name(
    db: Session, organization_id: int, name: str, exclude_id: int | None = None
) -> None:
    normalized = normalize_for_comparison(name)
    query = select(Category).where(Category.organization_id == organization_id)
    if exclude_id is not None:
        query = query.where(Category.id != exclude_id)
    for existing in db.scalars(query):
        if normalize_for_comparison(existing.name) == normalized:
            raise DuplicateCategoryName


def create_category(db: Session, organization_id: int, name: str) -> Category:
    name = _validate_name(name)
    _check_duplicate_name(db, organization_id, name)

    category = Category(
        organization_id=organization_id, name=name, status=EntityStatus.ACTIVE.value
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: Session, category_id: int, name: str | None = None) -> Category:
    category = get_category(db, category_id)

    if name is not None:
        name = _validate_name(name)
        _check_duplicate_name(db, category.organization_id, name, exclude_id=category.id)
        category.name = name

    db.commit()
    db.refresh(category)
    return category


def list_categories(db: Session, organization_id: int) -> list[Category]:
    return list(
        db.scalars(
            select(Category)
            .where(Category.organization_id == organization_id)
            .order_by(Category.name)
        ).all()
    )


def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise CategoryNotFound
    return category
