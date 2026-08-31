import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import command
from app.constants.roles import ADMINISTRADOR, EMPLEADO, GERENTE
from app.core.config import get_settings
from tests.conftest import alembic_config

ESQUEMA_TABLES = {"organizacion", "negocio", "rol", "usuario", "acceso_a_negocio", "sesion"}


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
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO])

            cantidad_organizaciones = connection.execute(
                sa.text("SELECT count(*) FROM organizacion")
            ).scalar_one()
            assert cantidad_organizaciones == 1

            negocio = connection.execute(
                sa.text("SELECT rubro, estado, organizacion_id FROM negocio")
            ).one()
            assert negocio.estado == "activo"
            assert negocio.organizacion_id is not None

            settings = get_settings()
            usuarios = connection.execute(sa.text("SELECT user_name, estado FROM usuario")).all()
            assert len(usuarios) == 1
            assert usuarios[0].user_name == settings.initial_admin_username
            assert usuarios[0].estado == "activo"

            accesos = connection.execute(
                sa.text(
                    "SELECT a.estado, r.nombre AS rol_nombre "
                    "FROM acceso_a_negocio a JOIN rol r ON r.id = a.rol_id"
                )
            ).all()
            assert len(accesos) == 1
            assert accesos[0].estado == "activo"
            assert accesos[0].rol_nombre == ADMINISTRADOR
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert not table_names & ESQUEMA_TABLES
    finally:
        engine.dispose()
