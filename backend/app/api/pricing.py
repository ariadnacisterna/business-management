from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.roles import GERENTE
from app.db.models import Account, Business, Price
from app.db.session import get_db
from app.domain.access.permissions import (
    get_active_business,
    get_current_user,
    require_csrf,
    require_role,
)
from app.domain.catalog.errors import ProductNotFound, VariantNotFound
from app.domain.pricing import prices
from app.domain.pricing.errors import InvalidPriceAmount, ProductHasNoPriceableVariants

router = APIRouter()


class PriceResponse(BaseModel):
    id: int
    variant_id: int
    business_id: int
    amount: Decimal
    effective_from: datetime
    effective_to: datetime | None
    created_by_account_id: int
    created_by_account_name: str
    created_at: datetime


class CurrentPriceResponse(BaseModel):
    variant_id: int
    price: PriceResponse | None


class ChangeVariantPriceRequest(BaseModel):
    delta: Decimal | None = None
    amount: Decimal | None = None


class ChangeProductPriceRequest(BaseModel):
    delta: Decimal


class ProductPriceChangeResponse(BaseModel):
    prices: list[PriceResponse]
    skipped_variant_ids: list[int]


def _price_response(price: Price, account_names: dict[int, str]) -> PriceResponse:
    return PriceResponse(
        id=price.id,
        variant_id=price.variant_id,
        business_id=price.business_id,
        amount=price.amount,
        effective_from=price.effective_from,
        effective_to=price.effective_to,
        created_by_account_id=price.created_by_account_id,
        created_by_account_name=account_names[price.created_by_account_id],
        created_at=price.created_at,
    )


def _optional_price_response(
    price: Price | None, account_names: dict[int, str]
) -> PriceResponse | None:
    return _price_response(price, account_names) if price is not None else None


@router.get("/variants/{variant_id}/price", response_model=CurrentPriceResponse)
def get_variant_current_price(
    variant_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> CurrentPriceResponse:
    try:
        price = prices.get_current_price_for_variant(db, variant_id, business.id)
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc

    account_ids = [price.created_by_account_id] if price is not None else []
    account_names = prices.get_account_names(db, account_ids)
    return CurrentPriceResponse(
        variant_id=variant_id, price=_optional_price_response(price, account_names)
    )


@router.get("/variants/{variant_id}/prices", response_model=list[PriceResponse])
def get_variant_price_history(
    variant_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[PriceResponse]:
    try:
        history = prices.list_price_history(db, variant_id, business.id)
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc

    account_names = prices.get_account_names(db, [price.created_by_account_id for price in history])
    return [_price_response(price, account_names) for price in history]


@router.put(
    "/variants/{variant_id}/price",
    response_model=PriceResponse,
    dependencies=[Depends(require_csrf)],
)
def change_variant_price(
    variant_id: int,
    payload: ChangeVariantPriceRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> PriceResponse:
    try:
        price = prices.change_variant_price(
            db,
            variant_id,
            business.id,
            _actor.id,
            delta=payload.delta,
            amount=payload.amount,
        )
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc
    except InvalidPriceAmount as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    account_names = prices.get_account_names(db, [price.created_by_account_id])
    return _price_response(price, account_names)


@router.put(
    "/products/{product_id}/price",
    response_model=ProductPriceChangeResponse,
    dependencies=[Depends(require_csrf)],
)
def change_product_price(
    product_id: int,
    payload: ChangeProductPriceRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductPriceChangeResponse:
    try:
        changed, skipped_variant_ids = prices.change_product_price(
            db, product_id, business.id, payload.delta, _actor.id
        )
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except InvalidPriceAmount as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ProductHasNoPriceableVariants as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "El producto no tiene variantes activas"
        ) from exc

    account_names = prices.get_account_names(db, [price.created_by_account_id for price in changed])
    return ProductPriceChangeResponse(
        prices=[_price_response(price, account_names) for price in changed],
        skipped_variant_ids=skipped_variant_ids,
    )
