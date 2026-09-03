import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import command
from app.constants.roles import ADMINISTRADOR, EMPLEADO, GERENTE
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


def test_upgrade_from_empty_database_creates_schema_and_seed_data(postgres_empty_schema):
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
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO])

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
            assert accesses[0].role_name == ADMINISTRADOR
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert not table_names & SCHEMA_TABLES
    finally:
        engine.dispose()


def test_upgrade_from_pre_rename_schema_renames_tables_columns_and_data(postgres_empty_schema):
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
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO])

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
            assert accesses[0].role_name == ADMINISTRADOR
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


def test_upgrade_without_second_business_settings_creates_only_one_business(postgres_empty_schema):
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
                assert all(access.role_name == ADMINISTRADOR for access in accesses)
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
