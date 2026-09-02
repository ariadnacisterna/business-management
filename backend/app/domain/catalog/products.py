from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import AttributeValue, Category, Product, Unit, Variant
from app.domain.catalog.errors import (
    CategoryNotFound,
    ImplicitVariantNeedsLabel,
    InvalidAttributeValue,
    InvalidCatalogInput,
    ProductNotFound,
    UnitNotFound,
    VariantNotFound,
)


@dataclass
class VariantInput:
    label: str | None = None
    attribute_value_ids: list[int] = field(default_factory=list)


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidCatalogInput("El nombre no puede estar vacio")
    return stripped


def _normalize_label(label: str | None) -> str | None:
    if label is None:
        return None
    stripped = label.strip()
    return stripped or None


def _get_category(db: Session, category_id: int, organization_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None or category.organization_id != organization_id:
        raise CategoryNotFound
    return category


def _get_unit(db: Session, unit_id: int, organization_id: int) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None or unit.organization_id != organization_id:
        raise UnitNotFound
    return unit


def _resolve_attribute_values(db: Session, attribute_value_ids: list[int]) -> list[AttributeValue]:
    if not attribute_value_ids:
        return []

    values = []
    seen_attribute_ids: set[int] = set()
    for value_id in attribute_value_ids:
        value = db.get(AttributeValue, value_id)
        if value is None or value.status != EntityStatus.ACTIVE.value:
            raise InvalidAttributeValue(f"Valor de atributo invalido: {value_id}")
        if value.attribute_id in seen_attribute_ids:
            raise InvalidAttributeValue(
                "Una variante no puede tener mas de un valor del mismo atributo"
            )
        seen_attribute_ids.add(value.attribute_id)
        values.append(value)
    return values


def _build_variant(
    db: Session,
    product: Product,
    variant_input: VariantInput,
    is_implicit: bool,
    actor_account_id: int,
) -> Variant:
    label = _normalize_label(variant_input.label)
    attribute_values = _resolve_attribute_values(db, variant_input.attribute_value_ids)

    now = datetime.now(UTC)
    variant = Variant(
        product_id=product.id,
        label=label,
        is_implicit=is_implicit,
        status=EntityStatus.ACTIVE.value,
        attribute_values=attribute_values,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(variant)
    db.flush()
    return variant


def find_possible_duplicates(
    db: Session,
    category_id: int,
    product_name: str,
    label: str | None,
    attribute_value_ids: set[int],
    exclude_variant_id: int | None = None,
) -> list[Variant]:
    normalized_name = normalize_for_comparison(product_name)
    normalized_label = normalize_for_comparison(label) if label else ""

    candidates = db.scalars(
        select(Variant)
        .join(Product, Variant.product_id == Product.id)
        .where(
            Product.category_id == category_id,
            Product.status == EntityStatus.ACTIVE.value,
            Variant.status == EntityStatus.ACTIVE.value,
        )
    ).all()

    duplicates = []
    for candidate in candidates:
        if exclude_variant_id is not None and candidate.id == exclude_variant_id:
            continue
        if normalize_for_comparison(candidate.product.name) != normalized_name:
            continue
        candidate_label = normalize_for_comparison(candidate.label) if candidate.label else ""
        if candidate_label != normalized_label:
            continue
        candidate_attribute_ids = {value.id for value in candidate.attribute_values}
        if candidate_attribute_ids != attribute_value_ids:
            continue
        duplicates.append(candidate)
    return duplicates


def create_product(
    db: Session,
    organization_id: int,
    category_id: int,
    unit_id: int,
    name: str,
    actor_account_id: int,
    variants: list[VariantInput] | None = None,
) -> tuple[Product, list[Variant], list[Variant]]:
    name = _validate_name(name)
    category = _get_category(db, category_id, organization_id)
    unit = _get_unit(db, unit_id, organization_id)

    now = datetime.now(UTC)
    product = Product(
        organization_id=organization_id,
        category_id=category.id,
        unit_id=unit.id,
        name=name,
        status=EntityStatus.ACTIVE.value,
        created_by_account_id=actor_account_id,
        created_at=now,
        updated_by_account_id=actor_account_id,
        updated_at=now,
    )
    db.add(product)
    db.flush()

    is_implicit = not variants
    variant_inputs = variants if variants else [VariantInput()]

    created_variants = [
        _build_variant(db, product, variant_input, is_implicit, actor_account_id)
        for variant_input in variant_inputs
    ]

    possible_duplicates = []
    for variant in created_variants:
        attribute_value_ids = {value.id for value in variant.attribute_values}
        possible_duplicates.extend(
            find_possible_duplicates(
                db,
                category.id,
                product.name,
                variant.label,
                attribute_value_ids,
                exclude_variant_id=variant.id,
            )
        )

    db.commit()
    db.refresh(product)
    return product, created_variants, possible_duplicates


def update_product(
    db: Session,
    product_id: int,
    actor_account_id: int,
    name: str | None = None,
    category_id: int | None = None,
    unit_id: int | None = None,
) -> Product:
    product = get_product(db, product_id)

    if name is not None:
        product.name = _validate_name(name)

    if category_id is not None:
        category = _get_category(db, category_id, product.organization_id)
        product.category_id = category.id

    if unit_id is not None:
        unit = _get_unit(db, unit_id, product.organization_id)
        product.unit_id = unit.id

    product.updated_by_account_id = actor_account_id
    product.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(product)
    return product


def add_variant(
    db: Session,
    product_id: int,
    actor_account_id: int,
    label: str | None = None,
    attribute_value_ids: list[int] | None = None,
) -> tuple[Variant, list[Variant]]:
    product = get_product(db, product_id)

    unlabeled_implicit_variants = [
        variant for variant in product.variants if variant.is_implicit and variant.label is None
    ]
    if unlabeled_implicit_variants:
        raise ImplicitVariantNeedsLabel(
            "El producto tiene una variante implicita sin nombre: asignale un nombre con "
            "update_variant antes de agregar una nueva variante"
        )

    variant_input = VariantInput(label=label, attribute_value_ids=attribute_value_ids or [])
    variant = _build_variant(
        db, product, variant_input, is_implicit=False, actor_account_id=actor_account_id
    )
    db.expire(product, ["variants"])

    attribute_value_ids_set = {value.id for value in variant.attribute_values}
    duplicates = find_possible_duplicates(
        db,
        product.category_id,
        product.name,
        variant.label,
        attribute_value_ids_set,
        exclude_variant_id=variant.id,
    )

    db.commit()
    db.refresh(variant)
    return variant, duplicates


def update_variant(
    db: Session,
    variant_id: int,
    actor_account_id: int,
    label: str | None = None,
    attribute_value_ids: list[int] | None = None,
) -> tuple[Variant, list[Variant]]:
    variant = get_variant(db, variant_id)

    if label is not None:
        variant.label = _normalize_label(label)
        if variant.label is not None:
            variant.is_implicit = False

    if attribute_value_ids is not None:
        variant.attribute_values = _resolve_attribute_values(db, attribute_value_ids)

    variant.updated_by_account_id = actor_account_id
    variant.updated_at = datetime.now(UTC)
    db.flush()

    attribute_value_ids_set = {value.id for value in variant.attribute_values}
    duplicates = find_possible_duplicates(
        db,
        variant.product.category_id,
        variant.product.name,
        variant.label,
        attribute_value_ids_set,
        exclude_variant_id=variant.id,
    )

    db.commit()
    db.refresh(variant)
    return variant, duplicates


def list_products(db: Session, organization_id: int) -> list[Product]:
    return list(
        db.scalars(
            select(Product).where(Product.organization_id == organization_id).order_by(Product.name)
        ).all()
    )


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise ProductNotFound
    return product


def get_variant(db: Session, variant_id: int) -> Variant:
    variant = db.get(Variant, variant_id)
    if variant is None:
        raise VariantNotFound
    return variant
