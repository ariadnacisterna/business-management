from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.constants.limits import (
    PRICE_SCALE,
    SALE_FREE_LINE_DESCRIPTION_MAX_LENGTH,
    SALE_MAX_LINES,
    VOID_REASON_MAX_LENGTH,
)
from app.constants.status import CreditType, EntityStatus, PaymentMethod
from app.db.models import Product, Sale, SaleLine, SalePayment, Variant
from app.domain.cash.registers import ensure_open_register
from app.domain.catalog.credits import add_credit
from app.domain.catalog.customers import get_customer
from app.domain.catalog.errors import InvalidStockQuantity
from app.domain.catalog.quantities import validate_quantity_for_unit
from app.domain.catalog.stock import (
    LockedVariant,
    lock_variants_for_stock_change,
    return_stock_from_sale,
    take_stock_for_sale,
)
from app.domain.pricing.prices import MAX_PRICE, PRICE_STEP, get_current_prices_for_variants
from app.domain.sales.errors import InvalidSale, SaleAlreadyVoided, SaleNotFound

PAYMENT_METHODS = tuple(method.value for method in PaymentMethod)


@dataclass(frozen=True)
class SaleLineInput:
    variant_id: int
    quantity: Decimal


@dataclass(frozen=True)
class FreeLineInput:
    description: str
    amount: Decimal


@dataclass(frozen=True)
class PaymentInput:
    method: str
    amount: Decimal


def variant_description(variant: Variant) -> str:
    if variant.label:
        return variant.label
    return ", ".join(value.value for value in variant.attribute_values)


def format_money(amount: Decimal) -> str:
    whole, cents = f"{amount.quantize(PRICE_STEP):,.2f}".split(".")
    return f"$ {whole.replace(',', '.')},{cents}"


def _subject(variant: Variant) -> str:
    description = variant_description(variant)
    name = variant.product.name
    return f'"{name} ({description})"' if description else f'"{name}"'


def _validate_amount(amount: Decimal, subject: str) -> Decimal:
    if not amount.is_finite() or amount < 0:
        raise InvalidSale(f"{subject} no puede ser negativo")
    if amount >= MAX_PRICE:
        raise InvalidSale(f"{subject} es demasiado grande")
    if amount != amount.quantize(PRICE_STEP):
        raise InvalidSale(f"{subject} admite como máximo {PRICE_SCALE} decimales")
    return amount.quantize(PRICE_STEP)


def _validate_free_line(line: FreeLineInput) -> FreeLineInput:
    description = line.description.strip()
    if not description:
        raise InvalidSale("Escribí el nombre del monto libre")
    if len(description) > SALE_FREE_LINE_DESCRIPTION_MAX_LENGTH:
        raise InvalidSale(
            "El nombre del monto libre puede tener como máximo "
            f"{SALE_FREE_LINE_DESCRIPTION_MAX_LENGTH} caracteres"
        )
    amount = _validate_amount(line.amount, f'El importe de "{description}"')
    if amount == 0:
        raise InvalidSale(f'El importe de "{description}" tiene que ser mayor que cero')
    return FreeLineInput(description, amount)


def _validate_lines(
    lines: list[SaleLineInput | FreeLineInput],
) -> list[SaleLineInput | FreeLineInput]:
    if not lines:
        raise InvalidSale("Agregá al menos un producto a la venta")
    if len(lines) > SALE_MAX_LINES:
        raise InvalidSale(f"Una venta puede tener como máximo {SALE_MAX_LINES} productos")
    variant_ids = [line.variant_id for line in lines if isinstance(line, SaleLineInput)]
    if len(set(variant_ids)) != len(variant_ids):
        raise InvalidSale(
            "Un mismo producto aparece dos veces en la venta: sumá las cantidades en una sola línea"
        )
    validated: list[SaleLineInput | FreeLineInput] = []
    for line in lines:
        if isinstance(line, FreeLineInput):
            validated.append(_validate_free_line(line))
            continue
        if not line.quantity.is_finite() or line.quantity <= 0:
            raise InvalidSale("La cantidad de cada producto tiene que ser mayor que cero")
        validated.append(line)
    return validated


def _validate_payments(payments: list[PaymentInput]) -> list[PaymentInput]:
    if not payments:
        raise InvalidSale("Elegí cómo se paga la venta")
    methods = [payment.method for payment in payments]
    if any(method not in PAYMENT_METHODS for method in methods):
        raise InvalidSale("La forma de pago no es válida")
    if len(set(methods)) != len(methods):
        raise InvalidSale("Cada forma de pago puede aparecer una sola vez en la venta")
    validated = [
        PaymentInput(payment.method, _validate_amount(payment.amount, "El importe a pagar"))
        for payment in payments
    ]
    if len(validated) > 1 and any(payment.amount == 0 for payment in validated):
        raise InvalidSale("Al repartir el pago, cada forma de pago tiene que tener un importe")
    return validated


def _validate_customer(
    db: Session, business_id: int, payments: list[PaymentInput], customer_id: int | None
) -> None:
    if not any(payment.method == PaymentMethod.FIADO.value for payment in payments):
        if customer_id is not None:
            raise InvalidSale("El cliente solo se elige cuando una parte se paga en fiado")
        return
    if customer_id is None:
        raise InvalidSale("Para vender en fiado elegí el cliente")
    if get_customer(db, business_id, customer_id).status != EntityStatus.ACTIVE.value:
        raise InvalidSale("Ese cliente está dado de baja: no se le puede fiar")


def _validate_payments_cover_total(payments: list[PaymentInput], total: Decimal) -> None:
    paid = sum((payment.amount for payment in payments), Decimal(0))
    if paid != total:
        raise InvalidSale(
            f"Las formas de pago suman {format_money(paid)} y el total de la venta es "
            f"{format_money(total)}: tienen que coincidir"
        )
    for payment in payments:
        if payment.method == PaymentMethod.FIADO.value and payment.amount == 0:
            raise InvalidSale("La parte en fiado tiene que tener un importe mayor que cero")


def _sellable_quantity(locked: LockedVariant, quantity: Decimal) -> Decimal:
    if (
        locked.variant.status != EntityStatus.ACTIVE.value
        or locked.product.status != EntityStatus.ACTIVE.value
    ):
        raise InvalidSale(f"{_subject(locked.variant)} está dado de baja y no se puede vender")
    try:
        return validate_quantity_for_unit(quantity, locked.unit, "La cantidad es demasiado grande")
    except InvalidStockQuantity as exc:
        raise InvalidSale(f"{_subject(locked.variant)}: {exc}") from exc


def _fiado_amount(payments: Sequence[SalePayment | PaymentInput]) -> Decimal:
    return sum(
        (payment.amount for payment in payments if payment.method == PaymentMethod.FIADO.value),
        Decimal(0),
    )


def register_sale(
    db: Session,
    business_id: int,
    actor_account_id: int,
    lines: list[SaleLineInput | FreeLineInput],
    payments: list[PaymentInput],
    customer_id: int | None,
    discount: Decimal,
) -> Sale:
    lines = _validate_lines(lines)
    discount = _validate_amount(discount, "El descuento")
    payments = _validate_payments(payments)
    _validate_customer(db, business_id, payments, customer_id)

    product_lines = [line for line in lines if isinstance(line, SaleLineInput)]
    locked = (
        lock_variants_for_stock_change(db, business_id, [line.variant_id for line in product_lines])
        if product_lines
        else {}
    )
    quantities = {
        line.variant_id: _sellable_quantity(locked[line.variant_id], line.quantity)
        for line in product_lines
    }
    prices = (
        get_current_prices_for_variants(db, list(quantities), business_id) if quantities else {}
    )
    for variant_id in quantities:
        if variant_id not in prices:
            raise InvalidSale(
                f"{_subject(locked[variant_id].variant)} no tiene precio cargado, así que no se "
                "puede vender. Pedile a un Gerente que le cargue el precio."
            )

    line_totals = {
        variant_id: (quantity * prices[variant_id].amount).quantize(PRICE_STEP, ROUND_HALF_UP)
        for variant_id, quantity in quantities.items()
    }
    free_total = sum((line.amount for line in lines if isinstance(line, FreeLineInput)), Decimal(0))
    subtotal = sum(line_totals.values(), Decimal(0)) + free_total
    if subtotal >= MAX_PRICE:
        raise InvalidSale("El total de la venta es demasiado grande")
    if discount > subtotal:
        raise InvalidSale("El descuento no puede ser mayor que el total de la venta")
    total = subtotal - discount
    _validate_payments_cover_total(payments, total)

    register = ensure_open_register(db, business_id, actor_account_id)
    sale = Sale(
        business_id=business_id,
        cash_register_id=register.id,
        customer_id=customer_id,
        subtotal=subtotal,
        discount=discount,
        total=total,
        insufficient_stock=False,
        created_by_account_id=actor_account_id,
        created_at=datetime.now(UTC),
    )
    db.add(sale)
    db.flush()

    observation = f"Venta N° {sale.id}"
    for line in lines:
        if isinstance(line, FreeLineInput):
            db.add(
                SaleLine(
                    sale_id=sale.id,
                    variant_id=None,
                    description=line.description,
                    quantity=Decimal(1),
                    unit_price=line.amount,
                    line_total=line.amount,
                    stock_taken=Decimal(0),
                )
            )
            continue
        quantity = quantities[line.variant_id]
        taken = take_stock_for_sale(
            db, locked[line.variant_id].variant, quantity, actor_account_id, sale.id, observation
        )
        if taken < quantity:
            sale.insufficient_stock = True
        db.add(
            SaleLine(
                sale_id=sale.id,
                variant_id=line.variant_id,
                quantity=quantity,
                unit_price=prices[line.variant_id].amount,
                line_total=line_totals[line.variant_id],
                stock_taken=taken,
            )
        )
    for payment in payments:
        db.add(SalePayment(sale_id=sale.id, method=payment.method, amount=payment.amount))

    fiado_amount = _fiado_amount(payments)
    if fiado_amount > 0 and customer_id is not None:
        add_credit(
            db,
            business_id,
            customer_id,
            CreditType.CARGO.value,
            fiado_amount,
            actor_account_id,
            sale_id=sale.id,
        )
    db.flush()
    return get_sale(db, business_id, sale.id)


def void_sale(
    db: Session, business_id: int, sale_id: int, actor_account_id: int, reason: str
) -> Sale:
    reason = reason.strip()
    if not reason:
        raise InvalidSale("Escribí el motivo de la anulación")
    if len(reason) > VOID_REASON_MAX_LENGTH:
        raise InvalidSale(f"El motivo puede tener como máximo {VOID_REASON_MAX_LENGTH} caracteres")

    sale = db.scalars(
        select(Sale)
        .where(Sale.id == sale_id, Sale.business_id == business_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).first()
    if sale is None:
        raise SaleNotFound
    if sale.voided_at is not None:
        raise SaleAlreadyVoided

    stock_returns = {
        line.variant_id: line.stock_taken
        for line in db.scalars(select(SaleLine).where(SaleLine.sale_id == sale.id)).all()
        if line.variant_id is not None
    }
    locked = (
        lock_variants_for_stock_change(db, business_id, list(stock_returns))
        if stock_returns
        else {}
    )
    observation = f"Anulación de la venta N° {sale.id}"
    for variant_id, stock_taken in stock_returns.items():
        return_stock_from_sale(
            db, locked[variant_id].variant, stock_taken, actor_account_id, sale.id, observation
        )

    payments = db.scalars(select(SalePayment).where(SalePayment.sale_id == sale.id)).all()
    fiado_amount = _fiado_amount(payments)
    if fiado_amount > 0 and sale.customer_id is not None:
        add_credit(
            db,
            business_id,
            sale.customer_id,
            CreditType.PAGO.value,
            fiado_amount,
            actor_account_id,
            sale_id=sale.id,
        )

    sale.void_cash_register_id = ensure_open_register(db, business_id, actor_account_id).id
    sale.voided_at = datetime.now(UTC)
    sale.voided_by_account_id = actor_account_id
    sale.void_reason = reason
    db.flush()
    return get_sale(db, business_id, sale.id)


def _with_details(query: Select) -> Select:
    return query.options(
        selectinload(Sale.customer),
        selectinload(Sale.payments),
        selectinload(Sale.lines)
        .selectinload(SaleLine.variant)
        .selectinload(Variant.product)
        .selectinload(Product.unit),
        selectinload(Sale.lines)
        .selectinload(SaleLine.variant)
        .selectinload(Variant.attribute_values),
    )


def get_sale(db: Session, business_id: int, sale_id: int) -> Sale:
    sale = db.scalars(
        _with_details(
            select(Sale).where(Sale.id == sale_id, Sale.business_id == business_id)
        ).execution_options(populate_existing=True)
    ).first()
    if sale is None:
        raise SaleNotFound
    return sale


def list_sales(
    db: Session,
    business_id: int,
    page: int,
    page_size: int,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    payment_method: str | None = None,
) -> tuple[list[Sale], int]:
    query = select(Sale).where(Sale.business_id == business_id)
    if created_from is not None:
        query = query.where(Sale.created_at >= created_from)
    if created_to is not None:
        query = query.where(Sale.created_at < created_to)
    if payment_method is not None:
        query = query.where(Sale.payments.any(SalePayment.method == payment_method))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        _with_details(query)
        .order_by(Sale.created_at.desc(), Sale.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return list(rows), total
