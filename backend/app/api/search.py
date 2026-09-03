from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.models import Account, Variant
from app.db.session import get_db
from app.domain.access.active_business import get_active_business
from app.domain.access.permissions import get_current_user
from app.domain.catalog.errors import CategoryNotFound
from app.domain.catalog.search import search_variants

router = APIRouter()


class AttributeValueSummary(BaseModel):
    attribute_id: int
    attribute_name: str
    value: str


class SearchResultItem(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    category_id: int
    category_name: str
    label: str | None
    attribute_values: list[AttributeValueSummary]
    price_amount: Decimal


class SearchResponse(BaseModel):
    results: list[SearchResultItem]


def _search_result_item(variant: Variant, price_amount: Decimal) -> SearchResultItem:
    return SearchResultItem(
        variant_id=variant.id,
        product_id=variant.product.id,
        product_name=variant.product.name,
        category_id=variant.product.category.id,
        category_name=variant.product.category.name,
        label=variant.label,
        attribute_values=[
            AttributeValueSummary(
                attribute_id=value.attribute_id,
                attribute_name=value.attribute.name,
                value=value.value,
            )
            for value in variant.attribute_values
        ],
        price_amount=price_amount,
    )


@router.get("/search", response_model=SearchResponse)
def search(
    q: str | None = None,
    category_id: int | None = None,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
) -> SearchResponse:
    business = get_active_business(db)
    try:
        results = search_variants(
            db, business.organization_id, business.id, query=q, category_id=category_id
        )
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria no encontrada") from exc

    return SearchResponse(
        results=[_search_result_item(result.variant, result.price.amount) for result in results]
    )
