from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.constants.status import CreditType
from app.db.models import Credit, Customer
from app.domain.catalog.customers import get_customer
from app.domain.catalog.errors import InvalidCreditAmount, InvalidCreditType


def _balance_expression():
    return func.coalesce(
        func.sum(
            case(
                (Credit.type == CreditType.CARGO.value, Credit.amount),
                else_=-Credit.amount,
            )
        ),
        0,
    )


def create_credit(
    db: Session,
    business_id: int,
    customer_id: int,
    credit_type: str,
    amount: Decimal,
    actor_account_id: int,
) -> Credit:
    customer = get_customer(db, business_id, customer_id)

    if credit_type not in (CreditType.CARGO.value, CreditType.PAGO.value):
        raise InvalidCreditType

    if amount <= 0:
        raise InvalidCreditAmount

    credit = Credit(
        customer_id=customer.id,
        type=credit_type,
        amount=amount,
        created_by_account_id=actor_account_id,
        created_at=datetime.now(UTC),
    )
    db.add(credit)
    db.commit()
    db.refresh(credit)
    return credit


def list_credits(db: Session, business_id: int, customer_id: int) -> list[Credit]:
    get_customer(db, business_id, customer_id)
    return list(
        db.scalars(
            select(Credit)
            .where(Credit.customer_id == customer_id)
            .order_by(Credit.created_at)
        ).all()
    )


def get_customer_balance(db: Session, business_id: int, customer_id: int) -> Decimal:
    get_customer(db, business_id, customer_id)
    balance = db.scalar(
        select(_balance_expression()).where(Credit.customer_id == customer_id)
    )
    return Decimal(balance)


def list_customers_with_pending_balance(
    db: Session, business_id: int
) -> list[tuple[Customer, Decimal]]:
    balance_column = _balance_expression()
    rows = db.execute(
        select(Customer, balance_column)
        .join(Credit, Credit.customer_id == Customer.id)
        .where(Customer.business_id == business_id)
        .group_by(Customer.id)
        .having(balance_column > 0)
        .order_by(Customer.name)
    ).all()
    return [(customer, Decimal(balance)) for customer, balance in rows]
