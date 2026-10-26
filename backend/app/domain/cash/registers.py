from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.constants.cash import CASH_SHIFT_DURATION
from app.constants.limits import CASH_MOVEMENT_REASON_MAX_LENGTH
from app.constants.status import CashMovementKind, CashRegisterStatus, PaymentMethod
from app.db.locks import LockKind, lock_until_commit
from app.db.models import CashMovement, CashRegister, Sale, SalePayment
from app.domain.cash.errors import (
    CashRegisterAlreadyClosed,
    CashRegisterNotClosed,
    CashRegisterNotFound,
    InvalidCashOperation,
    TransfersAlreadyClosed,
)
from app.domain.pricing.prices import MAX_PRICE, PRICE_STEP

ZERO = Decimal(0)


@dataclass(frozen=True)
class RegisterTotals:
    cash_sales: Decimal = ZERO
    cash_voided: Decimal = ZERO
    transfer_sales: Decimal = ZERO
    transfer_voided: Decimal = ZERO
    fiado_sales: Decimal = ZERO
    fiado_voided: Decimal = ZERO
    deposits: Decimal = ZERO
    withdrawals: Decimal = ZERO

    @property
    def expected_cash(self) -> Decimal:
        return self.cash_sales - self.cash_voided + self.deposits - self.withdrawals

    @property
    def expected_transfer(self) -> Decimal:
        return self.transfer_sales - self.transfer_voided


def register_status(register: CashRegister, now: datetime | None = None) -> str:
    if register.closed_at is not None:
        return CashRegisterStatus.CERRADA.value
    if register.ends_at <= (now or datetime.now(UTC)):
        return CashRegisterStatus.PENDIENTE.value
    return CashRegisterStatus.ABIERTA.value


def _validate_money(amount: Decimal, subject: str) -> Decimal:
    if not amount.is_finite() or amount < 0:
        raise InvalidCashOperation(f"{subject} no puede ser negativo")
    if amount >= MAX_PRICE:
        raise InvalidCashOperation(f"{subject} es demasiado grande")
    if amount != amount.quantize(PRICE_STEP):
        raise InvalidCashOperation(f"{subject} admite como máximo 2 decimales")
    return amount.quantize(PRICE_STEP)


def ensure_open_register(db: Session, business_id: int, account_id: int) -> CashRegister:
    lock_until_commit(db, LockKind.CASH_REGISTER, account_id)
    now = datetime.now(UTC)
    register = db.scalars(
        select(CashRegister)
        .where(
            CashRegister.business_id == business_id,
            CashRegister.account_id == account_id,
            CashRegister.closed_at.is_(None),
            CashRegister.ends_at > now,
        )
        .order_by(CashRegister.id.desc())
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if register is not None:
        return register
    register = CashRegister(
        business_id=business_id,
        account_id=account_id,
        opened_at=now,
        ends_at=now + CASH_SHIFT_DURATION,
    )
    db.add(register)
    db.flush()
    return register


def totals_for_registers(db: Session, register_ids: list[int]) -> dict[int, RegisterTotals]:
    if not register_ids:
        return {}
    values: dict[int, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for column, prefix in ((Sale.cash_register_id, "sold"), (Sale.void_cash_register_id, "void")):
        rows = db.execute(
            select(column, SalePayment.method, func.sum(SalePayment.amount))
            .join(Sale, Sale.id == SalePayment.sale_id)
            .where(column.in_(register_ids))
            .group_by(column, SalePayment.method)
        ).all()
        for register_id, method, amount in rows:
            values[register_id][f"{prefix}_{method}"] = amount
    movement_rows = db.execute(
        select(CashMovement.cash_register_id, CashMovement.kind, func.sum(CashMovement.amount))
        .where(CashMovement.cash_register_id.in_(register_ids))
        .group_by(CashMovement.cash_register_id, CashMovement.kind)
    ).all()
    for register_id, kind, amount in movement_rows:
        values[register_id][kind] = amount
    cash = PaymentMethod.EFECTIVO.value
    transfer = PaymentMethod.TRANSFERENCIA.value
    fiado = PaymentMethod.FIADO.value
    return {
        register_id: RegisterTotals(
            cash_sales=values[register_id][f"sold_{cash}"],
            cash_voided=values[register_id][f"void_{cash}"],
            transfer_sales=values[register_id][f"sold_{transfer}"],
            transfer_voided=values[register_id][f"void_{transfer}"],
            fiado_sales=values[register_id][f"sold_{fiado}"],
            fiado_voided=values[register_id][f"void_{fiado}"],
            deposits=values[register_id][CashMovementKind.INGRESO.value],
            withdrawals=values[register_id][CashMovementKind.RETIRO.value],
        )
        for register_id in register_ids
    }


def totals_for_register(db: Session, register_id: int) -> RegisterTotals:
    return totals_for_registers(db, [register_id])[register_id]


def _lock_register(db: Session, business_id: int, register_id: int) -> CashRegister:
    register = db.scalars(
        select(CashRegister)
        .where(CashRegister.id == register_id, CashRegister.business_id == business_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if register is None:
        raise CashRegisterNotFound
    return register


def get_register(db: Session, business_id: int, register_id: int) -> CashRegister:
    register = db.scalars(
        select(CashRegister)
        .where(CashRegister.id == register_id, CashRegister.business_id == business_id)
        .options(selectinload(CashRegister.movements))
        .execution_options(populate_existing=True)
    ).first()
    if register is None:
        raise CashRegisterNotFound
    return register


def list_registers(
    db: Session, business_id: int, page: int, page_size: int
) -> tuple[list[CashRegister], int]:
    query = select(CashRegister).where(CashRegister.business_id == business_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.options(selectinload(CashRegister.movements))
        .order_by(CashRegister.opened_at.desc(), CashRegister.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return list(rows), total


def add_movement(
    db: Session,
    business_id: int,
    account_id: int,
    kind: str,
    amount: Decimal,
    reason: str | None,
) -> CashRegister:
    if kind not in (CashMovementKind.INGRESO.value, CashMovementKind.RETIRO.value):
        raise InvalidCashOperation("Elegí si ingresás o retirás efectivo")
    amount = _validate_money(amount, "El importe")
    if amount == 0:
        raise InvalidCashOperation("El importe tiene que ser mayor que cero")
    reason = reason.strip() if reason else None
    if reason and len(reason) > CASH_MOVEMENT_REASON_MAX_LENGTH:
        raise InvalidCashOperation(
            f"El motivo puede tener como máximo {CASH_MOVEMENT_REASON_MAX_LENGTH} caracteres"
        )
    register = ensure_open_register(db, business_id, account_id)
    db.add(
        CashMovement(
            cash_register_id=register.id,
            kind=kind,
            amount=amount,
            reason=reason or None,
            created_by_account_id=account_id,
            created_at=datetime.now(UTC),
        )
    )
    db.flush()
    return get_register(db, business_id, register.id)


def close_register(
    db: Session,
    business_id: int,
    register_id: int,
    actor_account_id: int,
    counted_cash: Decimal,
    counted_transfer: Decimal | None,
) -> CashRegister:
    counted_cash = _validate_money(counted_cash, "El efectivo contado")
    if counted_transfer is not None:
        counted_transfer = _validate_money(counted_transfer, "El importe contado por transferencia")
    register = _lock_register(db, business_id, register_id)
    if register.closed_at is not None:
        raise CashRegisterAlreadyClosed
    totals = totals_for_register(db, register.id)
    now = datetime.now(UTC)
    register.closed_at = now
    register.closed_by_account_id = actor_account_id
    register.expected_cash = totals.expected_cash
    register.counted_cash = counted_cash
    register.cash_difference = counted_cash - totals.expected_cash
    if counted_transfer is not None:
        _store_transfer_close(register, totals, counted_transfer, actor_account_id, now)
    db.flush()
    return get_register(db, business_id, register.id)


def close_transfers(
    db: Session,
    business_id: int,
    register_id: int,
    actor_account_id: int,
    counted_transfer: Decimal,
) -> CashRegister:
    counted_transfer = _validate_money(counted_transfer, "El importe contado por transferencia")
    register = _lock_register(db, business_id, register_id)
    if register.closed_at is None:
        raise CashRegisterNotClosed
    if register.transfers_closed_at is not None:
        raise TransfersAlreadyClosed
    totals = totals_for_register(db, register.id)
    _store_transfer_close(register, totals, counted_transfer, actor_account_id, datetime.now(UTC))
    db.flush()
    return get_register(db, business_id, register.id)


def _store_transfer_close(
    register: CashRegister,
    totals: RegisterTotals,
    counted_transfer: Decimal,
    actor_account_id: int,
    now: datetime,
) -> None:
    register.transfers_closed_at = now
    register.transfers_closed_by_account_id = actor_account_id
    register.expected_transfer = totals.expected_transfer
    register.counted_transfer = counted_transfer
    register.transfer_difference = counted_transfer - totals.expected_transfer
