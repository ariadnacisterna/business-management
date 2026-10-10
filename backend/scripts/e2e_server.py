import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.engine import make_url

E2E_DATABASE_SUFFIX = "_e2e"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_STATIC_DIR = BACKEND_DIR.parent / "frontend" / "dist"
DEFAULT_PORT = 8010

E2E_PASSWORD = "Prueba123"
FIRST_BUSINESS_NAME = "Libreria Ejemplo"
SECOND_BUSINESS_NAME = "Almacen Ejemplo"

E2E_ENVIRONMENT = {
    "INITIAL_ORGANIZATION_NAME": "Organizacion Ejemplo",
    "INITIAL_BUSINESS_NAME": FIRST_BUSINESS_NAME,
    "INITIAL_BUSINESS_INDUSTRY": "Libreria",
    "INITIAL_BUSINESS_2_NAME": SECOND_BUSINESS_NAME,
    "INITIAL_BUSINESS_2_INDUSTRY": "Almacen",
    "INITIAL_ADMIN_NAME": "Dora Duena",
    "INITIAL_ADMIN_USERNAME": "duena",
    "INITIAL_ADMIN_PASSWORD": E2E_PASSWORD,
    "COOKIE_SECURE": "false",
    "RENDER": "false",
    "ENABLE_API_DOCS": "false",
    "SUPABASE_URL": "",
    "SUPABASE_SERVICE_ROLE_KEY": "",
    "SUPABASE_STORAGE_BUCKET": "",
}

ACCOUNTS = (
    ("Elsa Empleada", "empleada", "Empleado", None),
    ("Gabriela Gerenta", "gerenta", "Gerente", None),
    ("Ana Administradora", "administradora", "Administrador", None),
    ("Luisa Lectora", "lectora", "Empleado", 5),
)

ACCOUNTS_IN_BOTH_BUSINESSES = ("administradora",)

PRODUCTS = (
    ("Cuaderno rayado", "unit", Decimal("1000"), Decimal("10")),
    ("Cinta de raso", "meter", Decimal("300"), Decimal("10")),
    ("Lapiz negro", "unit", Decimal("500"), Decimal("20")),
    ("Goma de borrar", "unit", Decimal("200"), Decimal("3")),
    ("Regla de 30 cm", "unit", Decimal("800"), Decimal("4")),
    ("Carpeta escolar", "unit", Decimal("2500"), Decimal("12")),
    ("Boligrafo azul", "unit", Decimal("450"), Decimal("30")),
    ("Tijera escolar", "unit", Decimal("1500"), Decimal("6")),
    ("Compas metalico", "unit", Decimal("2200"), Decimal("2")),
)

PRODUCTS_WITH_SHORTAGE = ("Compas metalico",)

CUSTOMERS = ("Marta Fiado", "Pedro Doble")


class UnsafeDatabaseError(RuntimeError):
    pass


def e2e_database_url(base_url: str) -> str:
    url = make_url(base_url)
    database = url.database or ""
    if not database.endswith(E2E_DATABASE_SUFFIX):
        database = f"{database}{E2E_DATABASE_SUFFIX}"
    return check_e2e_database_url(url.set(database=database).render_as_string(hide_password=False))


def check_e2e_database_url(candidate: str) -> str:
    url = make_url(candidate)
    if url.host not in LOCAL_HOSTS:
        raise UnsafeDatabaseError(
            f"Me niego a usar la base en {url.host!r}: las pruebas de punta a punta "
            "solo corren contra una base local."
        )
    if not url.database or not url.database.endswith(E2E_DATABASE_SUFFIX):
        raise UnsafeDatabaseError(
            f"Me niego a usar la base {url.database!r}: el nombre tiene que terminar "
            f"en '{E2E_DATABASE_SUFFIX}'."
        )
    return candidate


def recreate_database(database_url: str) -> None:
    url = make_url(check_e2e_database_url(database_url))
    maintenance = sa.create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with maintenance.connect() as connection:
            connection.execute(sa.text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
            connection.execute(sa.text(f'CREATE DATABASE "{url.database}"'))
    finally:
        maintenance.dispose()


def migrate() -> None:
    from alembic.config import Config

    from alembic import command

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")


def seed() -> None:
    from sqlalchemy import select

    from app.constants.roles import DUENO
    from app.constants.status import EntityStatus
    from app.db.models import Account, Business, BusinessAccess, Role
    from app.db.session import SessionLocal
    from app.domain.access import accounts
    from app.domain.catalog import categories, customers, products, shortages, stock, units
    from app.domain.pricing import prices

    db = SessionLocal()
    try:
        business = db.scalars(select(Business).where(Business.name == FIRST_BUSINESS_NAME)).one()
        second_business = db.scalars(
            select(Business).where(Business.name == SECOND_BUSINESS_NAME)
        ).one()
        owner = db.scalars(select(Account).where(Account.user_name == "duena")).one()

        for name, user_name, role_name, font_size in ACCOUNTS:
            account = accounts.create_account(
                db, business, name, user_name, E2E_PASSWORD, role_name, DUENO
            )
            if font_size is not None:
                account.font_size = font_size
                db.commit()
            if user_name in ACCOUNTS_IN_BOTH_BUSINESSES:
                role = db.scalars(select(Role).where(Role.name == role_name)).one()
                db.add(
                    BusinessAccess(
                        account_id=account.id,
                        business_id=second_business.id,
                        role_id=role.id,
                        status=EntityStatus.ACTIVE.value,
                    )
                )
                db.commit()

        category = categories.add_category(db, business.id, "Escolares", owner.id)
        unit_by_key = {
            "unit": units.add_unit(db, business.id, "Unidad", "u", owner.id),
            "meter": units.add_unit(db, business.id, "Metro", "m", owner.id, allows_fraction=True),
        }
        db.commit()

        for name, unit_key, amount, quantity in PRODUCTS:
            _product, variants, _duplicates = products.add_product(
                db, business.id, category.id, unit_by_key[unit_key].id, name, owner.id
            )
            db.commit()
            variant_id = variants[0].id
            prices.apply_variant_price_change(db, variant_id, business.id, owner.id, amount=amount)
            db.commit()
            stock.apply_stock_adjustment(db, business.id, variant_id, owner.id, quantity)
            db.commit()
            if name in PRODUCTS_WITH_SHORTAGE:
                shortages.add_shortage(db, business.id, variant_id, owner.id)
                db.commit()

        for name in CUSTOMERS:
            customers.create_customer(db, business.id, name, owner.id)
    finally:
        db.close()


def serve(static_dir: Path, port: int) -> None:
    import uvicorn

    from app.main import create_app

    uvicorn.run(create_app(static_dir=static_dir), host="127.0.0.1", port=port)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--static-dir", type=Path, default=DEFAULT_STATIC_DIR)
    arguments = parser.parse_args()

    from app.core.config import get_settings

    try:
        database_url = e2e_database_url(get_settings().database_url)
    except UnsafeDatabaseError as exc:
        sys.exit(str(exc))

    if not (arguments.static_dir / "index.html").is_file():
        sys.exit(f"No encuentro la aplicacion construida en {arguments.static_dir}")

    os.environ.update(E2E_ENVIRONMENT)
    os.environ["DATABASE_URL"] = database_url
    get_settings.cache_clear()

    recreate_database(database_url)
    migrate()
    seed()
    serve(arguments.static_dir, arguments.port)


if __name__ == "__main__":
    main()
