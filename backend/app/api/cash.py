from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.catalog import ALLOWED_PAGE_SIZES
from app.api.submissions import require_submission_key, respond_once
from app.constants.access import PERMISSION_DENIED_DETAIL
from app.constants.roles import ADMINISTRADOR, EMPLEADO, GERENTE, ROLE_RANK
from app.db.models import Account, Business, CashRegister
from app.db.session import get_db
from app.domain.access import accounts
from app.domain.access.permissions import (
    get_active_business,
    get_current_user,
    require_csrf,
    require_role,
)
from app.domain.cash import registers
from app.domain.cash.errors import (
    CashRegisterAlreadyClosed,
    CashRegisterNotClosed,
    CashRegisterNotFound,
    InvalidCashOperation,
    TransfersAlreadyClosed,
)
from app.domain.pricing.prices import get_account_names

router = APIRouter()

DEFAULT_CASH_PAGE_SIZE = 25


class CashMovementRequest(BaseModel):
    kind: str = Field(description="ingreso o retiro")
    amount: Decimal
    reason: str | None = Field(default=None, description="Motivo opcional")


class CloseCashRegisterRequest(BaseModel):
    counted_cash: Decimal = Field(description="Efectivo contado al cerrar")
    counted_transfer: Decimal | None = Field(
        default=None, description="Transferencias controladas; solo Administrador y Dueño"
    )


class CloseTransfersRequest(BaseModel):
    counted_transfer: Decimal


class CashMovementResponse(BaseModel):
    id: int
    kind: str
    amount: Decimal
    reason: str | None
    created_by_account_id: int
    created_by_account_name: str
    created_at: str


class CashRegisterResponse(BaseModel):
    id: int
    account_id: int
    account_name: str
    opened_at: str
    ends_at: str
    closed_at: str | None
    closed_by_account_id: int | None
    closed_by_account_name: str | None
    status: str
    cash_sales: Decimal
    cash_voided: Decimal
    deposits: Decimal
    withdrawals: Decimal
    expected_cash: Decimal
    counted_cash: Decimal | None
    cash_difference: Decimal | None
    fiado_sales: Decimal
    transfers_visible: bool
    transfer_sales: Decimal | None
    transfer_voided: Decimal | None
    expected_transfer: Decimal | None
    counted_transfer: Decimal | None
    transfer_difference: Decimal | None
    transfers_closed_at: str | None
    movements: list[CashMovementResponse]


class CashRegisterPageResponse(BaseModel):
    items: list[CashRegisterResponse]
    total: int
    page: int
    page_size: int


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def _can_see_transfers(db: Session, actor: Account, business: Business) -> bool:
    role = accounts.get_role_name(db, actor.id, business.id)
    return ROLE_RANK.get(role or EMPLEADO, 0) >= ROLE_RANK[ADMINISTRADOR]


def _account_ids(register_list: list[CashRegister]) -> list[int]:
    ids: list[int] = []
    for register in register_list:
        ids.append(register.account_id)
        if register.closed_by_account_id:
            ids.append(register.closed_by_account_id)
        ids.extend(movement.created_by_account_id for movement in register.movements)
    return ids


def _response(
    register: CashRegister,
    totals: registers.RegisterTotals,
    names: dict[int, str],
    transfers_visible: bool,
) -> CashRegisterResponse:
    closed = register.closed_at is not None
    transfers_closed = register.transfers_closed_at is not None
    return CashRegisterResponse(
        id=register.id,
        account_id=register.account_id,
        account_name=names[register.account_id],
        opened_at=register.opened_at.isoformat(),
        ends_at=register.ends_at.isoformat(),
        closed_at=_iso(register.closed_at),
        closed_by_account_id=register.closed_by_account_id,
        closed_by_account_name=(
            names[register.closed_by_account_id] if register.closed_by_account_id else None
        ),
        status=registers.register_status(register),
        cash_sales=totals.cash_sales,
        cash_voided=totals.cash_voided,
        deposits=totals.deposits,
        withdrawals=totals.withdrawals,
        expected_cash=register.expected_cash if closed else totals.expected_cash,
        counted_cash=register.counted_cash,
        cash_difference=register.cash_difference,
        fiado_sales=totals.fiado_sales - totals.fiado_voided,
        transfers_visible=transfers_visible,
        transfer_sales=totals.transfer_sales if transfers_visible else None,
        transfer_voided=totals.transfer_voided if transfers_visible else None,
        expected_transfer=(
            (register.expected_transfer if transfers_closed else totals.expected_transfer)
            if transfers_visible
            else None
        ),
        counted_transfer=register.counted_transfer if transfers_visible else None,
        transfer_difference=register.transfer_difference if transfers_visible else None,
        transfers_closed_at=_iso(register.transfers_closed_at) if transfers_visible else None,
        movements=[
            CashMovementResponse(
                id=movement.id,
                kind=movement.kind,
                amount=movement.amount,
                reason=movement.reason,
                created_by_account_id=movement.created_by_account_id,
                created_by_account_name=names[movement.created_by_account_id],
                created_at=movement.created_at.isoformat(),
            )
            for movement in register.movements
        ],
    )


def _single_response(
    db: Session, register: CashRegister, actor: Account, business: Business
) -> CashRegisterResponse:
    names = get_account_names(db, _account_ids([register]))
    totals = registers.totals_for_register(db, register.id)
    return _response(register, totals, names, _can_see_transfers(db, actor, business))


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, CashRegisterNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Caja no encontrada")
    if isinstance(exc, CashRegisterAlreadyClosed):
        return HTTPException(status.HTTP_409_CONFLICT, "Esta caja ya estaba cerrada")
    if isinstance(exc, TransfersAlreadyClosed):
        return HTTPException(
            status.HTTP_409_CONFLICT, "Las transferencias de esta caja ya estaban cerradas"
        )
    if isinstance(exc, CashRegisterNotClosed):
        return HTTPException(
            status.HTTP_409_CONFLICT, "Primero hay que cerrar el efectivo de esta caja"
        )
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


HANDLED_ERRORS = (
    CashRegisterNotFound,
    CashRegisterAlreadyClosed,
    TransfersAlreadyClosed,
    CashRegisterNotClosed,
    InvalidCashOperation,
)


@router.get("/cash-registers/current", response_model=CashRegisterResponse)
def get_current_cash_register(
    db: Session = Depends(get_db),
    actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> CashRegisterResponse:
    register = registers.ensure_open_register(db, business.id, actor.id)
    db.commit()
    return _single_response(
        db, registers.get_register(db, business.id, register.id), actor, business
    )


@router.post(
    "/cash-registers/current/movements",
    response_model=CashRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def add_cash_movement(
    payload: CashMovementRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
    submission_key: str = Depends(require_submission_key),
) -> CashRegisterResponse:
    def perform() -> CashRegisterResponse:
        register = registers.add_movement(
            db, business.id, actor.id, payload.kind, payload.amount, payload.reason
        )
        return _single_response(db, register, actor, business)

    try:
        return respond_once(
            db,
            actor.id,
            submission_key,
            request,
            payload.model_dump_json().encode(),
            CashRegisterResponse,
            perform,
        )
    except HANDLED_ERRORS as exc:
        raise _http_error(exc) from exc


@router.get("/cash-registers", response_model=CashRegisterPageResponse)
def list_cash_registers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_CASH_PAGE_SIZE),
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> CashRegisterPageResponse:
    if page_size not in ALLOWED_PAGE_SIZES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "page_size invalido")
    register_list, total = registers.list_registers(db, business.id, page, page_size)
    names = get_account_names(db, _account_ids(register_list))
    totals = registers.totals_for_registers(db, [register.id for register in register_list])
    visible = _can_see_transfers(db, actor, business)
    return CashRegisterPageResponse(
        items=[
            _response(register, totals[register.id], names, visible) for register in register_list
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/cash-registers/{cash_register_id}", response_model=CashRegisterResponse)
def get_cash_register(
    cash_register_id: int,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> CashRegisterResponse:
    try:
        register = registers.get_register(db, business.id, cash_register_id)
    except CashRegisterNotFound as exc:
        raise _http_error(exc) from exc
    return _single_response(db, register, actor, business)


@router.post(
    "/cash-registers/{cash_register_id}/close",
    response_model=CashRegisterResponse,
    dependencies=[Depends(require_csrf)],
)
def close_cash_register(
    cash_register_id: int,
    payload: CloseCashRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
    submission_key: str = Depends(require_submission_key),
) -> CashRegisterResponse:
    if payload.counted_transfer is not None and not _can_see_transfers(db, actor, business):
        raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL)

    def perform() -> CashRegisterResponse:
        register = registers.close_register(
            db,
            business.id,
            cash_register_id,
            actor.id,
            payload.counted_cash,
            payload.counted_transfer,
        )
        return _single_response(db, register, actor, business)

    try:
        return respond_once(
            db,
            actor.id,
            submission_key,
            request,
            payload.model_dump_json().encode(),
            CashRegisterResponse,
            perform,
        )
    except HANDLED_ERRORS as exc:
        raise _http_error(exc) from exc


@router.post(
    "/cash-registers/{cash_register_id}/close-transfers",
    response_model=CashRegisterResponse,
    dependencies=[Depends(require_csrf)],
)
def close_cash_register_transfers(
    cash_register_id: int,
    payload: CloseTransfersRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
    submission_key: str = Depends(require_submission_key),
) -> CashRegisterResponse:
    def perform() -> CashRegisterResponse:
        register = registers.close_transfers(
            db, business.id, cash_register_id, actor.id, payload.counted_transfer
        )
        return _single_response(db, register, actor, business)

    try:
        return respond_once(
            db,
            actor.id,
            submission_key,
            request,
            payload.model_dump_json().encode(),
            CashRegisterResponse,
            perform,
        )
    except HANDLED_ERRORS as exc:
        raise _http_error(exc) from exc
