from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.catalog import ALLOWED_PAGE_SIZES
from app.api.submissions import require_submission_key, respond_once
from app.constants.roles import GERENTE
from app.db.models import Account, Business, Sale, SaleLine
from app.db.session import get_db
from app.domain.access.permissions import (
    get_active_business,
    get_current_user,
    require_csrf,
    require_role,
)
from app.domain.catalog.errors import CustomerNotFound, InvalidStockQuantity, VariantNotFound
from app.domain.pricing.prices import get_account_names
from app.domain.sales import sales
from app.domain.sales.errors import InvalidSale, SaleAlreadyVoided, SaleNotFound

router = APIRouter()

DEFAULT_SALES_PAGE_SIZE = 25


class SaleLineRequest(BaseModel):
    variant_id: int | None = Field(default=None, description="Producto vendido")
    quantity: Decimal | None = Field(
        default=None, description="Cantidad en la unidad de venta del producto"
    )
    description: str | None = Field(default=None, description="Nombre de un monto libre")
    amount: Decimal | None = Field(default=None, description="Importe de un monto libre")


class SalePaymentRequest(BaseModel):
    method: str = Field(description="efectivo, transferencia o fiado")
    amount: Decimal = Field(description="Parte del total que se paga de esta forma")


class CreateSaleRequest(BaseModel):
    lines: list[SaleLineRequest]
    payments: list[SalePaymentRequest]
    customer_id: int | None = Field(
        default=None, description="Obligatorio si una parte se paga en fiado"
    )
    discount: Decimal = Field(default=Decimal(0), description="Descuento sobre el total")


class VoidSaleRequest(BaseModel):
    reason: str


class SaleLineResponse(BaseModel):
    id: int
    variant_id: int | None
    product_id: int | None
    product_name: str | None
    variant_description: str
    description: str | None
    unit_abbreviation: str | None
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    stock_taken: Decimal
    insufficient_stock: bool


class SalePaymentResponse(BaseModel):
    method: str
    amount: Decimal


class SaleSummaryResponse(BaseModel):
    id: int
    created_at: str
    created_by_account_id: int
    created_by_account_name: str
    payments: list[SalePaymentResponse]
    customer_id: int | None
    customer_name: str | None
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    insufficient_stock: bool
    line_count: int
    voided_at: str | None
    voided_by_account_id: int | None
    voided_by_account_name: str | None
    void_reason: str | None


class SaleResponse(SaleSummaryResponse):
    lines: list[SaleLineResponse]


class SalePageResponse(BaseModel):
    items: list[SaleSummaryResponse]
    total: int
    page: int
    page_size: int


def _account_ids(sale_list: list[Sale]) -> list[int]:
    ids = [sale.created_by_account_id for sale in sale_list]
    ids.extend(sale.voided_by_account_id for sale in sale_list if sale.voided_by_account_id)
    return ids


def _summary_fields(sale: Sale, account_names: dict[int, str]) -> dict:
    return {
        "id": sale.id,
        "created_at": sale.created_at.isoformat(),
        "created_by_account_id": sale.created_by_account_id,
        "created_by_account_name": account_names[sale.created_by_account_id],
        "payments": [
            SalePaymentResponse(method=payment.method, amount=payment.amount)
            for payment in sale.payments
        ],
        "customer_id": sale.customer_id,
        "customer_name": sale.customer.name if sale.customer else None,
        "subtotal": sale.subtotal,
        "discount": sale.discount,
        "total": sale.total,
        "insufficient_stock": sale.insufficient_stock,
        "line_count": len(sale.lines),
        "voided_at": sale.voided_at.isoformat() if sale.voided_at else None,
        "voided_by_account_id": sale.voided_by_account_id,
        "voided_by_account_name": (
            account_names[sale.voided_by_account_id] if sale.voided_by_account_id else None
        ),
        "void_reason": sale.void_reason,
    }


def _sale_response(db: Session, sale: Sale) -> SaleResponse:
    account_names = get_account_names(db, _account_ids([sale]))
    return SaleResponse(
        **_summary_fields(sale, account_names),
        lines=[_line_response(line) for line in sale.lines],
    )


def _line_response(line: SaleLine) -> SaleLineResponse:
    variant = line.variant
    return SaleLineResponse(
        id=line.id,
        variant_id=line.variant_id,
        product_id=variant.product_id if variant else None,
        product_name=variant.product.name if variant else None,
        variant_description=sales.variant_description(variant) if variant else "",
        description=line.description,
        unit_abbreviation=variant.product.unit.abbreviation if variant else None,
        quantity=line.quantity,
        unit_price=line.unit_price,
        line_total=line.line_total,
        stock_taken=line.stock_taken,
        insufficient_stock=variant is not None and line.stock_taken < line.quantity,
    )


def _line_input(line: SaleLineRequest) -> sales.SaleLineInput | sales.FreeLineInput:
    has_free_fields = line.description is not None or line.amount is not None
    has_product_fields = line.variant_id is not None or line.quantity is not None
    if line.variant_id is not None and line.quantity is not None and not has_free_fields:
        return sales.SaleLineInput(line.variant_id, line.quantity)
    if line.description is not None and line.amount is not None and not has_product_fields:
        return sales.FreeLineInput(line.description, line.amount)
    raise InvalidSale(
        "Cada línea tiene que ser un producto con su cantidad o un monto libre con nombre e importe"
    )


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, VariantNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    if isinstance(exc, CustomerNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Cliente no encontrado")
    if isinstance(exc, SaleNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Venta no encontrada")
    if isinstance(exc, SaleAlreadyVoided):
        return HTTPException(status.HTTP_409_CONFLICT, "Esta venta ya estaba anulada")
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


HANDLED_ERRORS = (
    VariantNotFound,
    CustomerNotFound,
    SaleNotFound,
    SaleAlreadyVoided,
    InvalidSale,
    InvalidStockQuantity,
)


@router.post(
    "/sales",
    response_model=SaleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_sale(
    payload: CreateSaleRequest,
    request: Request,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
    submission_key: str = Depends(require_submission_key),
) -> SaleResponse:
    def perform() -> SaleResponse:
        sale = sales.register_sale(
            db,
            business.id,
            _actor.id,
            [_line_input(line) for line in payload.lines],
            [sales.PaymentInput(payment.method, payment.amount) for payment in payload.payments],
            payload.customer_id,
            payload.discount,
        )
        return _sale_response(db, sale)

    try:
        return respond_once(
            db,
            _actor.id,
            submission_key,
            request,
            payload.model_dump_json().encode(),
            SaleResponse,
            perform,
        )
    except HANDLED_ERRORS as exc:
        raise _http_error(exc) from exc


@router.get("/sales", response_model=SalePageResponse)
def list_sales(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_SALES_PAGE_SIZE),
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    payment_method: str | None = None,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> SalePageResponse:
    if page_size not in ALLOWED_PAGE_SIZES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "page_size invalido")
    if payment_method is not None and payment_method not in sales.PAYMENT_METHODS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "payment_method invalido")
    sale_list, total = sales.list_sales(
        db, business.id, page, page_size, created_from, created_to, payment_method
    )
    account_names = get_account_names(db, _account_ids(sale_list))
    return SalePageResponse(
        items=[SaleSummaryResponse(**_summary_fields(sale, account_names)) for sale in sale_list],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/sales/{sale_id}", response_model=SaleResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> SaleResponse:
    try:
        return _sale_response(db, sales.get_sale(db, business.id, sale_id))
    except SaleNotFound as exc:
        raise _http_error(exc) from exc


@router.post(
    "/sales/{sale_id}/void",
    response_model=SaleResponse,
    dependencies=[Depends(require_csrf)],
)
def void_sale(
    sale_id: int,
    payload: VoidSaleRequest,
    request: Request,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
    submission_key: str = Depends(require_submission_key),
) -> SaleResponse:
    def perform() -> SaleResponse:
        sale = sales.void_sale(db, business.id, sale_id, _actor.id, payload.reason)
        return _sale_response(db, sale)

    try:
        return respond_once(
            db,
            _actor.id,
            submission_key,
            request,
            payload.model_dump_json().encode(),
            SaleResponse,
            perform,
        )
    except HANDLED_ERRORS as exc:
        raise _http_error(exc) from exc
