import threading
from decimal import Decimal

import pytest
import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.constants.roles import ADMINISTRADOR, DUENO
from app.constants.status import CreditType, EntityStatus, PaymentMethod, ShortageStatus
from app.db.models import (
    Account,
    Business,
    Credit,
    Price,
    Product,
    Sale,
    Shortage,
    StockMovement,
    Unit,
    Variant,
)
from app.domain import submissions
from app.domain.access import accounts
from app.domain.access.errors import ActorNotAllowed
from app.domain.audit.integrity import find_integrity_problems
from app.domain.catalog.categories import add_category
from app.domain.catalog.credits import add_credit
from app.domain.catalog.customers import add_customer
from app.domain.catalog.errors import (
    DuplicateCategoryName,
    DuplicateOpenShortage,
    DuplicateProductName,
    FractionalStockBlocksUnitChange,
    InvalidShortageTransition,
    InvalidStockQuantity,
)
from app.domain.catalog.products import add_product, update_product
from app.domain.catalog.shortages import add_shortage, change_shortage_status
from app.domain.catalog.stock import apply_stock_adjustment
from app.domain.catalog.units import add_unit, update_unit
from app.domain.import_.applying import add_import
from app.domain.pricing.prices import apply_variant_price_change
from app.domain.sales.errors import SaleAlreadyVoided
from app.domain.sales.sales import (
    FreeLineInput,
    PaymentInput,
    SaleLineInput,
    register_sale,
    void_sale,
)

WAITING_SECONDS = 0.5
FINISH_SECONDS = 15
LOCK_TIMEOUT = "10s"
PASSWORD = "Clave-segura-1"


@pytest.fixture
def open_session(db_session, postgres_empty_schema):
    engine = sa.create_engine(postgres_empty_schema)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    opened = []

    def _open():
        session = factory()
        session.execute(sa.text(f"SET lock_timeout = '{LOCK_TIMEOUT}'"))
        session.commit()
        opened.append(session)
        return session

    try:
        yield _open
    finally:
        for session in opened:
            session.rollback()
            session.close()
        engine.dispose()


def _business_and_owner(db):
    business = db.scalars(select(Business).order_by(Business.id)).first()
    owner = db.scalars(select(Account).order_by(Account.id)).first()
    return business, owner.id


def _new_variant(db, business_id, account_id, name, allows_fraction=False):
    category = add_category(db, business_id, f"Categoria {name}", account_id)
    unit = add_unit(
        db, business_id, f"Unidad {name}", "u", account_id, allows_fraction=allows_fraction
    )
    _product, variants, _duplicates = add_product(
        db, business_id, category.id, unit.id, name, account_id
    )
    db.commit()
    return variants[0].id


def _start(target):
    outcome = {}

    def run():
        try:
            outcome["result"] = target()
        except Exception as error:
            outcome["error"] = error

    thread = threading.Thread(target=run)
    thread.start()
    return thread, outcome


def _assert_waiting(thread):
    thread.join(WAITING_SECONDS)
    assert thread.is_alive(), "el segundo pedido no esperó al primero"


def _finish(thread):
    thread.join(FINISH_SECONDS)
    assert not thread.is_alive()


def test_two_simultaneous_stock_adjustments_compose_and_keep_the_chain(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Stock simultaneo")
    first, second = open_session(), open_session()

    apply_stock_adjustment(first, business.id, variant_id, account_id, Decimal("5"))

    def adjust_from_second():
        apply_stock_adjustment(second, business.id, variant_id, account_id, Decimal("3"))
        second.commit()

    thread, outcome = _start(adjust_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert "error" not in outcome
    check = open_session()
    assert check.get(Variant, variant_id).quantity == Decimal("8")
    movements = check.scalars(
        select(StockMovement)
        .where(StockMovement.variant_id == variant_id)
        .order_by(StockMovement.id)
    ).all()
    assert [(item.quantity_before, item.quantity_after) for item in movements] == [
        (Decimal("0"), Decimal("5")),
        (Decimal("5"), Decimal("8")),
    ]
    assert find_integrity_problems(check) == []


def test_simultaneous_subtraction_cannot_leave_stock_below_zero(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Stock piso")
    apply_stock_adjustment(setup, business.id, variant_id, account_id, Decimal("10"))
    setup.commit()
    first, second = open_session(), open_session()

    apply_stock_adjustment(first, business.id, variant_id, account_id, Decimal("-8"))

    def subtract_from_second():
        apply_stock_adjustment(second, business.id, variant_id, account_id, Decimal("-8"))
        second.commit()

    thread, outcome = _start(subtract_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert "No podés descontar más de lo que hay (2)" in str(outcome["error"])
    check = open_session()
    assert check.get(Variant, variant_id).quantity == Decimal("2")


def test_two_simultaneous_price_changes_compose(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Precio simultaneo")
    apply_variant_price_change(setup, variant_id, business.id, account_id, amount=Decimal("100"))
    setup.commit()
    first, second = open_session(), open_session()

    apply_variant_price_change(first, variant_id, business.id, account_id, delta=Decimal("10"))

    def change_from_second():
        apply_variant_price_change(second, variant_id, business.id, account_id, delta=Decimal("5"))
        second.commit()

    thread, outcome = _start(change_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert "error" not in outcome
    check = open_session()
    current = check.scalars(
        select(Price).where(Price.variant_id == variant_id, Price.effective_to.is_(None))
    ).all()
    assert [price.amount for price in current] == [Decimal("115.00")]
    assert find_integrity_problems(check) == []


def test_simultaneous_shortage_marks_open_only_one(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Faltante simultaneo")
    first, second = open_session(), open_session()

    add_shortage(first, business.id, variant_id, account_id)

    def mark_from_second():
        add_shortage(second, business.id, variant_id, account_id)
        second.commit()

    thread, outcome = _start(mark_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], DuplicateOpenShortage)
    check = open_session()
    assert (
        check.scalar(
            select(func.count()).select_from(Shortage).where(Shortage.variant_id == variant_id)
        )
        == 1
    )


def test_shortage_cannot_go_back_after_a_simultaneous_reception(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Faltante recibido")
    shortage = add_shortage(setup, business.id, variant_id, account_id)
    shortage.status = ShortageStatus.PEDIDO.value
    setup.commit()
    first, second = open_session(), open_session()

    locked = first.execute(
        select(Shortage).where(Shortage.id == shortage.id).with_for_update()
    ).scalar_one()
    locked.status = ShortageStatus.RECIBIDO.value
    first.flush()

    thread, outcome = _start(
        lambda: change_shortage_status(
            second, business.id, shortage.id, account_id, ShortageStatus.FALTANTE.value
        )
    )
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], InvalidShortageTransition)
    check = open_session()
    assert check.get(Shortage, shortage.id).status == ShortageStatus.RECIBIDO.value


def test_simultaneous_categories_that_differ_only_by_accents_are_not_both_created(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    first, second = open_session(), open_session()

    add_category(first, business.id, "Lápices", account_id)

    def create_from_second():
        add_category(second, business.id, "Lapices", account_id)
        second.commit()

    thread, outcome = _start(create_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], DuplicateCategoryName)


def test_simultaneous_products_with_the_same_name_are_not_both_created(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    category = add_category(setup, business.id, "Cuadernos", account_id)
    unit = add_unit(setup, business.id, "Unidad cuaderno", "u", account_id)
    setup.commit()
    first, second = open_session(), open_session()

    add_product(first, business.id, category.id, unit.id, "Cuaderno Rayado", account_id)

    def create_from_second():
        add_product(second, business.id, category.id, unit.id, "cuaderno rayado", account_id)
        second.commit()

    thread, outcome = _start(create_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], DuplicateProductName)
    check = open_session()
    assert (
        check.scalar(
            select(func.count()).select_from(Product).where(Product.business_id == business.id)
        )
        == 1
    )


def test_two_simultaneous_imports_of_the_same_file_create_each_product_once(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    content = (
        b"category,product_name,unit,variant_label,attributes,price\n"
        b"Libreria,Goma de borrar,Unidad,,,150\n"
    )
    first, second = open_session(), open_session()

    add_import(first, business.id, "catalogo.csv", content, account_id)

    def import_from_second():
        result = add_import(second, business.id, "catalogo.csv", content, account_id)
        second.commit()
        return result.import_run.created_products_count

    thread, outcome = _start(import_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert outcome["result"] == 0
    check = open_session()
    assert (
        check.scalar(
            select(func.count()).select_from(Product).where(Product.name == "Goma de borrar")
        )
        == 1
    )


def test_same_submission_sent_twice_at_once_registers_the_credit_once(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    customer = add_customer(setup, business.id, "Cliente simultaneo", account_id)
    setup.commit()
    first, second = open_session(), open_session()
    first_inside = threading.Event()
    release_first = threading.Event()
    fingerprint = submissions.request_fingerprint(b"cargo 100")

    def send(db, wait_inside):
        def perform():
            credit = add_credit(
                db, business.id, customer.id, CreditType.CARGO.value, Decimal("100"), account_id
            )
            if wait_inside:
                first_inside.set()
                release_first.wait(FINISH_SECONDS)
            return {"credit_id": credit.id}

        return submissions.run_once(
            db, account_id, "clave-de-envio-repetida", "POST /credits", fingerprint, perform
        )

    first_thread, first_outcome = _start(lambda: send(first, True))
    assert first_inside.wait(FINISH_SECONDS)
    second_thread, second_outcome = _start(lambda: send(second, False))
    _finish(second_thread)
    release_first.set()
    _finish(first_thread)

    assert first_outcome["result"] == second_outcome["result"]
    check = open_session()
    assert (
        check.scalar(
            select(func.count()).select_from(Credit).where(Credit.customer_id == customer.id)
        )
        == 1
    )


def test_two_administrators_cannot_deactivate_each_other_at_the_same_time(open_session):
    setup = open_session()
    business, _owner_id = _business_and_owner(setup)
    first_admin = accounts.create_account(
        setup, business, "Primera", "admin-uno", PASSWORD, ADMINISTRADOR, DUENO
    )
    second_admin = accounts.create_account(
        setup, business, "Segunda", "admin-dos", PASSWORD, ADMINISTRADOR, DUENO
    )
    first, second = open_session(), open_session()

    locked = (
        first.execute(
            select(Account)
            .where(Account.id.in_([first_admin.id, second_admin.id]))
            .order_by(Account.id)
            .with_for_update()
        )
        .scalars()
        .all()
    )
    next(item for item in locked if item.id == second_admin.id).status = EntityStatus.INACTIVE.value
    first.flush()

    thread, outcome = _start(
        lambda: accounts.deactivate_account(second, business.id, first_admin.id, second_admin.id)
    )
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], ActorNotAllowed)
    check = open_session()
    assert check.get(Account, first_admin.id).status == EntityStatus.ACTIVE.value


def test_unit_change_waits_for_a_decimal_adjustment_and_then_is_rejected(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Cinta metro", allows_fraction=True)
    unit_id = setup.get(Variant, variant_id).product.unit_id
    first, second = open_session(), open_session()

    apply_stock_adjustment(first, business.id, variant_id, account_id, Decimal("2.5"))

    thread, outcome = _start(
        lambda: update_unit(second, business.id, unit_id, account_id, allows_fraction=False)
    )
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], FractionalStockBlocksUnitChange)
    assert "Cinta metro" in str(outcome["error"])
    check = open_session()
    assert check.get(Unit, unit_id).allows_fraction is True


def test_decimal_adjustment_waits_for_a_unit_change_and_then_is_rejected(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Vellon kilo", allows_fraction=True)
    unit_id = setup.get(Variant, variant_id).product.unit_id
    first, second = open_session(), open_session()

    locked_unit = first.execute(
        select(Unit).where(Unit.id == unit_id).with_for_update()
    ).scalar_one()
    locked_unit.allows_fraction = False
    first.flush()

    def adjust_from_second():
        apply_stock_adjustment(second, business.id, variant_id, account_id, Decimal("0.5"))
        second.commit()

    thread, outcome = _start(adjust_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], InvalidStockQuantity)
    assert "Esta unidad no admite decimales" in str(outcome["error"])
    check = open_session()
    assert check.get(Variant, variant_id).quantity == Decimal("0")


def test_product_unit_change_waits_for_a_decimal_adjustment_and_then_is_rejected(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _new_variant(setup, business.id, account_id, "Cinta rollo", allows_fraction=True)
    product_id = setup.get(Variant, variant_id).product_id
    whole_unit = add_unit(setup, business.id, "Rollo", "r", account_id)
    setup.commit()
    first, second = open_session(), open_session()

    apply_stock_adjustment(first, business.id, variant_id, account_id, Decimal("2.5"))

    thread, outcome = _start(
        lambda: update_product(second, business.id, product_id, account_id, unit_id=whole_unit.id)
    )
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome["error"], FractionalStockBlocksUnitChange)
    check = open_session()
    assert check.get(Product, product_id).unit_id != whole_unit.id


def _variant_for_sale(db, business_id, account_id, name, stock):
    variant_id = _new_variant(db, business_id, account_id, name)
    apply_variant_price_change(db, variant_id, business_id, account_id, amount=Decimal("100"))
    apply_stock_adjustment(db, business_id, variant_id, account_id, Decimal(stock))
    db.commit()
    return variant_id


def _sell(db, business_id, account_id, variant_id, quantity):
    return register_sale(
        db,
        business_id,
        account_id,
        [SaleLineInput(variant_id, Decimal(quantity))],
        [PaymentInput(PaymentMethod.EFECTIVO.value, Decimal(quantity) * 100)],
        None,
        Decimal(0),
    )


def test_two_simultaneous_sales_of_the_last_units_never_leave_stock_negative(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _variant_for_sale(setup, business.id, account_id, "Venta simultanea", "5")
    first, second = open_session(), open_session()

    first_sale = _sell(first, business.id, account_id, variant_id, "4")

    def sell_from_second():
        sale = _sell(second, business.id, account_id, variant_id, "3")
        second.commit()
        return sale.id

    thread, outcome = _start(sell_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert "error" not in outcome
    check = open_session()
    assert check.get(Variant, variant_id).quantity == Decimal("0")
    assert check.get(Sale, first_sale.id).insufficient_stock is False
    second_sale = check.get(Sale, outcome["result"])
    assert second_sale.insufficient_stock is True
    assert second_sale.lines[0].stock_taken == Decimal("1")
    assert find_integrity_problems(check) == []


def test_same_sale_submission_sent_twice_at_once_registers_one_sale(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _variant_for_sale(setup, business.id, account_id, "Venta repetida", "10")
    first, second = open_session(), open_session()
    first_inside = threading.Event()
    release_first = threading.Event()
    fingerprint = submissions.request_fingerprint(b"venta 2")

    def send(db, wait_inside):
        def perform():
            sale = _sell(db, business.id, account_id, variant_id, "2")
            if wait_inside:
                first_inside.set()
                release_first.wait(FINISH_SECONDS)
            return {"sale_id": sale.id}

        return submissions.run_once(
            db, account_id, "clave-de-venta-repetida", "POST /sales", fingerprint, perform
        )

    first_thread, first_outcome = _start(lambda: send(first, True))
    assert first_inside.wait(FINISH_SECONDS)
    second_thread, second_outcome = _start(lambda: send(second, False))
    _assert_waiting(second_thread)
    release_first.set()
    _finish(first_thread)
    _finish(second_thread)

    assert first_outcome["result"] == second_outcome["result"]
    check = open_session()
    assert check.scalar(select(func.count()).select_from(Sale)) == 1
    assert check.get(Variant, variant_id).quantity == Decimal("8")


def test_two_simultaneous_voids_of_the_same_sale_return_the_stock_once(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _variant_for_sale(setup, business.id, account_id, "Venta anulada", "10")
    sale_id = _sell(setup, business.id, account_id, variant_id, "4").id
    setup.commit()
    first, second = open_session(), open_session()

    void_sale(first, business.id, sale_id, account_id, "Primera")

    def void_from_second():
        void_sale(second, business.id, sale_id, account_id, "Segunda")
        second.commit()

    thread, outcome = _start(void_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome.get("error"), SaleAlreadyVoided)
    check = open_session()
    assert check.get(Variant, variant_id).quantity == Decimal("10")
    assert check.get(Sale, sale_id).void_reason == "Primera"


def test_two_simultaneous_sales_that_empty_the_stock_open_one_shortage(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _variant_for_sale(setup, business.id, account_id, "Faltante doble venta", "1")
    first, second = open_session(), open_session()

    _sell(first, business.id, account_id, variant_id, "1")

    def sell_from_second():
        _sell(second, business.id, account_id, variant_id, "1")
        second.commit()

    thread, outcome = _start(sell_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert "error" not in outcome
    check = open_session()
    count = select(func.count()).select_from(Shortage).where(Shortage.variant_id == variant_id)
    assert check.scalar(count) == 1


def test_two_simultaneous_voids_of_a_split_sale_return_the_fiado_part_once(open_session):
    setup = open_session()
    business, account_id = _business_and_owner(setup)
    variant_id = _variant_for_sale(setup, business.id, account_id, "Reparto anulado", "10")
    customer = add_customer(setup, business.id, "Cliente reparto simultaneo", account_id)
    sale_id = register_sale(
        setup,
        business.id,
        account_id,
        [SaleLineInput(variant_id, Decimal("3")), FreeLineInput("Varios", Decimal("50"))],
        [
            PaymentInput(PaymentMethod.EFECTIVO.value, Decimal("150")),
            PaymentInput(PaymentMethod.FIADO.value, Decimal("200")),
        ],
        customer.id,
        Decimal(0),
    ).id
    setup.commit()
    first, second = open_session(), open_session()

    void_sale(first, business.id, sale_id, account_id, "Primera")

    def void_from_second():
        void_sale(second, business.id, sale_id, account_id, "Segunda")
        second.commit()

    thread, outcome = _start(void_from_second)
    _assert_waiting(thread)
    first.commit()
    _finish(thread)

    assert isinstance(outcome.get("error"), SaleAlreadyVoided)
    check = open_session()
    assert check.get(Variant, variant_id).quantity == Decimal("10")
    credits = check.scalars(select(Credit).where(Credit.sale_id == sale_id)).all()
    assert sorted((credit.type, credit.amount) for credit in credits) == [
        (CreditType.CARGO.value, Decimal("200")),
        (CreditType.PAGO.value, Decimal("200")),
    ]
    assert find_integrity_problems(check) == []
