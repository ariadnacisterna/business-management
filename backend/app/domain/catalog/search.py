from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import AttributeValue, Price, Product, Variant
from app.domain.catalog.categories import get_category
from app.domain.pricing.prices import get_current_prices_for_variants


@dataclass
class VariantSearchResult:
    variant: Variant
    price: Price


def _normalized_terms(query: str | None) -> list[str]:
    if not query:
        return []
    return [term for term in normalize_for_comparison(query).split() if term]


def _variant_search_text(variant: Variant) -> str:
    parts = [variant.product.name, variant.product.category.name]
    if variant.label:
        parts.append(variant.label)
    parts.extend(value.value for value in variant.attribute_values)
    return normalize_for_comparison(" ".join(parts))


def _matches_terms(variant: Variant, terms: list[str]) -> bool:
    if not terms:
        return True
    search_text = _variant_search_text(variant)
    return all(term in search_text for term in terms)


def search_variants(
    db: Session,
    organization_id: int,
    business_id: int,
    query: str | None = None,
    category_id: int | None = None,
) -> list[VariantSearchResult]:
    if category_id is not None:
        get_category(db, category_id)

    stmt = (
        select(Variant)
        .join(Product, Variant.product_id == Product.id)
        .where(
            Product.organization_id == organization_id,
            Product.status == EntityStatus.ACTIVE.value,
            Variant.status == EntityStatus.ACTIVE.value,
        )
        .options(
            selectinload(Variant.product).selectinload(Product.category),
            selectinload(Variant.attribute_values).selectinload(AttributeValue.attribute),
        )
    )
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)

    candidates = list(db.scalars(stmt).all())
    terms = _normalized_terms(query)
    matching = [variant for variant in candidates if _matches_terms(variant, terms)]

    prices = get_current_prices_for_variants(db, [variant.id for variant in matching], business_id)

    results = [
        VariantSearchResult(variant=variant, price=prices[variant.id])
        for variant in matching
        if variant.id in prices
    ]
    results.sort(
        key=lambda result: (
            normalize_for_comparison(result.variant.product.name),
            normalize_for_comparison(result.variant.label or ""),
            result.variant.id,
        )
    )
    return results
