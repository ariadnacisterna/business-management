import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import command
from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE
from app.core.config import get_settings
from tests.conftest import alembic_config

SCHEMA_TABLES = {
    "organization",
    "business",
    "role",
    "account",
    "business_access",
    "account_session",
}
PRE_RENAME_SCHEMA_TABLES = {
    "organizacion",
    "negocio",
    "rol",
    "usuario",
    "acceso_a_negocio",
    "sesion",
}
PRE_RENAME_REVISION = "a1f3c9d2e8b7"


def _isolate_from_second_business_env(monkeypatch, request):
    monkeypatch.setenv("INITIAL_BUSINESS_2_NAME", "")
    monkeypatch.setenv("INITIAL_BUSINESS_2_INDUSTRY", "")
    get_settings.cache_clear()
    request.addfinalizer(get_settings.cache_clear)


def test_upgrade_from_empty_database_creates_schema_and_seed_data(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= SCHEMA_TABLES

        with engine.connect() as connection:
            roles = (
                connection.execute(sa.text("SELECT name FROM role ORDER BY name")).scalars().all()
            )
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO, DUENO])

            organization_count = connection.execute(
                sa.text("SELECT count(*) FROM organization")
            ).scalar_one()
            assert organization_count == 1

            business = connection.execute(
                sa.text("SELECT industry, status, organization_id FROM business")
            ).one()
            assert business.status == "active"
            assert business.organization_id is not None

            settings = get_settings()
            accounts = connection.execute(sa.text("SELECT user_name, status FROM account")).all()
            assert len(accounts) == 1
            assert accounts[0].user_name == settings.initial_admin_username
            assert accounts[0].status == "active"

            accesses = connection.execute(
                sa.text(
                    "SELECT ba.status, r.name AS role_name "
                    "FROM business_access ba JOIN role r ON r.id = ba.role_id"
                )
            ).all()
            assert len(accesses) == 1
            assert accesses[0].status == "active"
            assert accesses[0].role_name == DUENO
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert not table_names & SCHEMA_TABLES
    finally:
        engine.dispose()


def test_upgrade_from_pre_rename_schema_renames_tables_columns_and_data(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, PRE_RENAME_REVISION)

    engine = sa.create_engine(postgres_empty_schema)
    try:
        pre_rename_tables = set(inspect(engine).get_table_names())
        assert pre_rename_tables >= PRE_RENAME_SCHEMA_TABLES
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= SCHEMA_TABLES
        assert not table_names & PRE_RENAME_SCHEMA_TABLES

        with engine.connect() as connection:
            settings = get_settings()

            roles = (
                connection.execute(sa.text("SELECT name FROM role ORDER BY name")).scalars().all()
            )
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO, DUENO])

            business = connection.execute(
                sa.text("SELECT industry, status, organization_id FROM business")
            ).one()
            assert business.status == "active"
            assert business.organization_id is not None

            accounts = connection.execute(sa.text("SELECT user_name, status FROM account")).all()
            assert len(accounts) == 1
            assert accounts[0].user_name == settings.initial_admin_username
            assert accounts[0].status == "active"

            accesses = connection.execute(
                sa.text(
                    "SELECT ba.status, r.name AS role_name "
                    "FROM business_access ba JOIN role r ON r.id = ba.role_id"
                )
            ).all()
            assert len(accesses) == 1
            assert accesses[0].status == "active"
            assert accesses[0].role_name == DUENO
    finally:
        engine.dispose()

    command.downgrade(config, PRE_RENAME_REVISION)

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= PRE_RENAME_SCHEMA_TABLES
        assert not table_names & SCHEMA_TABLES

        with engine.connect() as connection:
            negocio = connection.execute(sa.text("SELECT estado FROM negocio")).one()
            assert negocio.estado == "activo"

            usuarios = connection.execute(sa.text("SELECT estado FROM usuario")).all()
            assert len(usuarios) == 1
            assert usuarios[0].estado == "activo"
    finally:
        engine.dispose()

    command.downgrade(config, "base")


def test_upgrade_without_second_business_settings_creates_only_one_business(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            business_count = connection.execute(
                sa.text("SELECT count(*) FROM business")
            ).scalar_one()
            assert business_count == 1

            columns = {column["name"] for column in inspect(engine).get_columns("account_session")}
            assert "active_business_id" in columns
    finally:
        engine.dispose()


def test_upgrade_with_second_business_settings_creates_it_and_grants_admin_access(
    postgres_empty_schema, monkeypatch
):
    monkeypatch.setenv("INITIAL_BUSINESS_2_NAME", "Despensa")
    monkeypatch.setenv("INITIAL_BUSINESS_2_INDUSTRY", "Despensa")
    get_settings.cache_clear()

    try:
        config = alembic_config()
        command.upgrade(config, "head")

        engine = sa.create_engine(postgres_empty_schema)
        try:
            with engine.connect() as connection:
                businesses = connection.execute(
                    sa.text("SELECT name, industry, status FROM business ORDER BY id")
                ).all()
                assert len(businesses) == 2
                assert businesses[1].name == "Despensa"
                assert businesses[1].industry == "Despensa"
                assert businesses[1].status == "active"

                accesses = connection.execute(
                    sa.text(
                        "SELECT ba.business_id, ba.status, r.name AS role_name "
                        "FROM business_access ba JOIN role r ON r.id = ba.role_id "
                        "ORDER BY ba.business_id"
                    )
                ).all()
                assert len(accesses) == 2
                assert all(access.status == "active" for access in accesses)
                assert all(access.role_name == DUENO for access in accesses)
        finally:
            engine.dispose()

        command.downgrade(config, "base")

        engine = sa.create_engine(postgres_empty_schema)
        try:
            with engine.connect() as connection:
                table_names = set(inspect(engine).get_table_names())
                assert not table_names & SCHEMA_TABLES
        finally:
            engine.dispose()
    finally:
        get_settings.cache_clear()


def test_font_size_migration_backfills_existing_accounts_and_enforces_the_range(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "c2e6a8f0d4b1")
    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            font_sizes = (
                connection.execute(sa.text("SELECT font_size FROM account")).scalars().all()
            )
            assert font_sizes == [3]

            default = connection.execute(
                sa.text(
                    "SELECT column_default FROM information_schema.columns "
                    "WHERE table_name = 'account' AND column_name = 'font_size'"
                )
            ).scalar_one()
            assert default is None

        with engine.begin() as connection:
            try:
                connection.execute(sa.text("UPDATE account SET font_size = 6"))
            except sa.exc.IntegrityError:
                pass
            else:
                raise AssertionError("font_size fuera de rango fue aceptado")
    finally:
        engine.dispose()

    command.downgrade(config, "c2e6a8f0d4b1")
    command.downgrade(config, "base")


def test_decimal_stock_migration_preserves_existing_integer_values(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "d3f7a1b5c9e2")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.begin() as connection:
            business_id = connection.execute(
                sa.text("SELECT id FROM business LIMIT 1")
            ).scalar_one()
            account_id = connection.execute(sa.text("SELECT id FROM account LIMIT 1")).scalar_one()
            category_id = connection.execute(
                sa.text(
                    "INSERT INTO category "
                    "(business_id, name, status, created_by_account_id, created_at, "
                    "updated_by_account_id, updated_at) "
                    "VALUES (:business_id, 'Categoria migracion', 'active', :account_id, now(), "
                    ":account_id, now()) RETURNING id"
                ),
                {"business_id": business_id, "account_id": account_id},
            ).scalar_one()
            unit_id = connection.execute(
                sa.text(
                    "INSERT INTO unit "
                    "(business_id, name, abbreviation, allows_fraction, status, "
                    "created_by_account_id, created_at, updated_by_account_id, updated_at) "
                    "VALUES (:business_id, 'Unidad migracion', 'um', false, 'active', "
                    ":account_id, now(), :account_id, now()) RETURNING id"
                ),
                {"business_id": business_id, "account_id": account_id},
            ).scalar_one()
            product_id = connection.execute(
                sa.text(
                    "INSERT INTO product "
                    "(business_id, category_id, unit_id, name, status, "
                    "created_by_account_id, created_at, updated_by_account_id, updated_at) "
                    "VALUES (:business_id, :category_id, :unit_id, 'Producto migracion', 'active', "
                    ":account_id, now(), :account_id, now()) RETURNING id"
                ),
                {
                    "business_id": business_id,
                    "category_id": category_id,
                    "unit_id": unit_id,
                    "account_id": account_id,
                },
            ).scalar_one()
            variant_id = connection.execute(
                sa.text(
                    "INSERT INTO variant "
                    "(product_id, is_implicit, quantity, minimum_quantity, status, "
                    "created_by_account_id, created_at, updated_by_account_id, updated_at) "
                    "VALUES (:product_id, true, 42, 7, 'active', :account_id, now(), "
                    ":account_id, now()) RETURNING id"
                ),
                {"product_id": product_id, "account_id": account_id},
            ).scalar_one()
            connection.execute(
                sa.text(
                    "INSERT INTO stock_movement "
                    "(variant_id, quantity_before, quantity_after, created_by_account_id, "
                    "created_at) "
                    "VALUES (:variant_id, 10, 42, :account_id, now())"
                ),
                {"variant_id": variant_id, "account_id": account_id},
            )
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            variant = connection.execute(
                sa.text("SELECT quantity, minimum_quantity FROM variant WHERE id = :id"),
                {"id": variant_id},
            ).one()
            assert variant.quantity == 42
            assert variant.minimum_quantity == 7

            movement = connection.execute(
                sa.text(
                    "SELECT quantity_before, quantity_after FROM stock_movement "
                    "WHERE variant_id = :id"
                ),
                {"id": variant_id},
            ).one()
            assert movement.quantity_before == 10
            assert movement.quantity_after == 42

            variant_columns = {
                column["name"]: column["type"] for column in inspect(engine).get_columns("variant")
            }
            assert variant_columns["quantity"].precision == 13
            assert variant_columns["quantity"].scale == 3
            assert variant_columns["minimum_quantity"].precision == 13
            assert variant_columns["minimum_quantity"].scale == 3
    finally:
        engine.dispose()

    command.downgrade(config, "d3f7a1b5c9e2")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            variant = connection.execute(
                sa.text("SELECT quantity, minimum_quantity FROM variant WHERE id = :id"),
                {"id": variant_id},
            ).one()
            assert variant.quantity == 42
            assert variant.minimum_quantity == 7
    finally:
        engine.dispose()

    command.downgrade(config, "base")
