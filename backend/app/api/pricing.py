from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.roles import ADMINISTRADOR, GERENTE
from app.db.models import Account, Price
from app.db.session import get_db
from app.domain.access.active_business import get_active_business
from app.domain.access.permissions import get_current_user, require_csrf, require_role
from app.domain.catalog.errors import ProductNotFound, VariantNotFound
from app.domain.pricing import prices
from app.domain.pricing.errors import (
    InvalidPriceAmount,
    MissingExpectedPrice,
    PriceConflict,
    ProductHasNoPriceableVariants,
    ProductPriceConflict,
)

router = APIRouter()


class PriceResponse(BaseModel):
    id: int
    variant_id: int
    business_id: int
    amount: Decimal
    effective_from: datetime
    effective_to: datetime | None
    created_by_account_id: int
    created_at: datetime


class CurrentPriceResponse(BaseModel):
    variant_id: int
    price: PriceResponse | None


class ChangeVariantPriceRequest(BaseModel):
    amount: Decimal
    expected_current_price_id: int | None = None


class ChangeProductPriceRequest(BaseModel):
    amount: Decimal
    expected_current_price_ids: dict[int, int | None]


class ProductPriceChangeResponse(BaseModel):
    prices: list[PriceResponse]


def _price_response(price: Price) -> PriceResponse:
    return PriceResponse(
        id=price.id,
        variant_id=price.variant_id,
        business_id=price.business_id,
        amount=price.amount,
        effective_from=price.effective_from,
        effective_to=price.effective_to,
        created_by_account_id=price.created_by_account_id,
        created_at=price.created_at,
    )


def _optional_price_response(price: Price | None) -> PriceResponse | None:
    return _price_response(price) if price is not None else None


def _business_id(db: Session) -> int:
    return get_active_business(db).id


@router.get("/variants/{variant_id}/price", response_model=CurrentPriceResponse)
def get_variant_current_price(
    variant_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> CurrentPriceResponse:
    try:
        price = prices.get_current_price_for_variant(db, variant_id, _business_id(db))
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc

    return CurrentPriceResponse(variant_id=variant_id, price=_optional_price_response(price))


@router.get("/variants/{variant_id}/prices", response_model=list[PriceResponse])
def get_variant_price_history(
    variant_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> list[PriceResponse]:
    try:
        history = prices.list_price_history(db, variant_id, _business_id(db))
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc

    return [_price_response(price) for price in history]


@router.put(
    "/variants/{variant_id}/price",
    response_model=PriceResponse,
    dependencies=[Depends(require_csrf)],
)
def change_variant_price(
    variant_id: int,
    payload: ChangeVariantPriceRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> PriceResponse:
    try:
        price = prices.change_variant_price(
            db,
            variant_id,
            _business_id(db),
            payload.amount,
            _actor.id,
            payload.expected_current_price_id,
        )
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc
    except InvalidPriceAmount as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except PriceConflict as exc:
        current = _optional_price_response(exc.current_price)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": str(exc),
                "current_price": current.model_dump(mode="json") if current else None,
            },
        ) from exc

    return _price_response(price)


@router.put(
    "/products/{product_id}/price",
    response_model=ProductPriceChangeResponse,
    dependencies=[Depends(require_csrf)],
)
def change_product_price(
    product_id: int,
    payload: ChangeProductPriceRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> ProductPriceChangeResponse:
    try:
        changed = prices.change_product_price(
            db,
            product_id,
            _business_id(db),
            payload.amount,
            _actor.id,
            payload.expected_current_price_ids,
        )
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except InvalidPriceAmount as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ProductHasNoPriceableVariants as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "El producto no tiene variantes activas"
        ) from exc
    except MissingExpectedPrice as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ProductPriceConflict as exc:
        current_prices = {
            str(variant_id): _optional_price_response(price)
            for variant_id, price in exc.current_prices.items()
        }
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": str(exc),
                "current_prices": {
                    variant_id: response.model_dump(mode="json") if response else None
                    for variant_id, response in current_prices.items()
                },
            },
        ) from exc

    return ProductPriceChangeResponse(prices=[_price_response(price) for price in changed])
