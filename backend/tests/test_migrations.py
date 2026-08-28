from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError

from alembic import command
from app.constants.roles import ADMINISTRADORA, EMPLEADA
from app.core.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
ESQUEMA_TABLES = {"organizacion", "negocio", "rol", "usuario"}


def alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


@pytest.fixture
def postgres_empty_schema():
    settings = get_settings()
    engine = sa.create_engine(settings.database_url)
    try:
        with engine.connect() as connection:
            connection.execute(sa.text("DROP SCHEMA public CASCADE"))
            connection.execute(sa.text("CREATE SCHEMA public"))
            connection.commit()
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL no disponible para pruebas de migracion: {exc}")

    yield settings.database_url

    engine.dispose()


def test_upgrade_from_empty_database_creates_schema_and_seed_data(postgres_empty_schema):
    config = alembic_config()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= ESQUEMA_TABLES

        with engine.connect() as connection:
            roles = (
                connection.execute(sa.text("SELECT nombre FROM rol ORDER BY nombre"))
                .scalars()
                .all()
            )
            assert roles == sorted([ADMINISTRADORA, EMPLEADA])

            cantidad_organizaciones = connection.execute(
                sa.text("SELECT count(*) FROM organizacion")
            ).scalar_one()
            assert cantidad_organizaciones == 1

            negocio = connection.execute(
                sa.text("SELECT rubro, estado, organizacion_id FROM negocio")
            ).one()
            assert negocio.estado == "activo"
            assert negocio.organizacion_id is not None

            cantidad_usuarios = connection.execute(
                sa.text("SELECT count(*) FROM usuario")
            ).scalar_one()
            assert cantidad_usuarios == 0
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert not table_names & ESQUEMA_TABLES
    finally:
        engine.dispose()
