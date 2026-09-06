import contextlib
import os
from collections.abc import Generator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

TEST_DATABASE_SUFFIX = "_test"


def alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def _test_database_url() -> str:
    url = make_url(get_settings().database_url)
    db_name = url.database or "abuela"
    if not db_name.endswith(TEST_DATABASE_SUFFIX):
        db_name = f"{db_name}{TEST_DATABASE_SUFFIX}"
    return url.set(database=db_name).render_as_string(hide_password=False)


def _ensure_database_exists(url: str) -> None:
    target = make_url(url)
    maintenance_engine = sa.create_engine(
        target.set(database="postgres"), isolation_level="AUTOCOMMIT"
    )
    try:
        with maintenance_engine.connect() as connection, contextlib.suppress(ProgrammingError):
            connection.execute(sa.text(f'CREATE DATABASE "{target.database}"'))
    finally:
        maintenance_engine.dispose()


@pytest.fixture(scope="session")
def _postgres_unavailable_reason() -> str | None:
    test_url = _test_database_url()
    try:
        _ensure_database_exists(test_url)
        engine = sa.create_engine(test_url, connect_args={"connect_timeout": 3})
        try:
            with engine.connect():
                return None
        finally:
            engine.dispose()
    except OperationalError as exc:
        return str(exc)


@pytest.fixture
def postgres_empty_schema(
    _postgres_unavailable_reason: str | None,
) -> Generator[str, None, None]:
    if _postgres_unavailable_reason is not None:
        pytest.skip(
            f"PostgreSQL no disponible para pruebas de integracion: {_postgres_unavailable_reason}"
        )

    test_url = _test_database_url()
    engine = sa.create_engine(test_url)
    db_name = engine.url.database
    if not db_name or not db_name.endswith(TEST_DATABASE_SUFFIX):
        raise RuntimeError(
            f"Me niego a resetear la base {db_name!r}: el nombre debe terminar en "
            f"'{TEST_DATABASE_SUFFIX}' para evitar borrar una base real."
        )

    with engine.connect() as connection:
        connection.execute(sa.text("DROP SCHEMA public CASCADE"))
        connection.execute(sa.text("CREATE SCHEMA public"))
        connection.commit()

    os.environ["ALEMBIC_TEST_DATABASE_URL"] = test_url
    try:
        yield test_url
    finally:
        os.environ.pop("ALEMBIC_TEST_DATABASE_URL", None)
        engine.dispose()


@pytest.fixture
def db_session(postgres_empty_schema: str) -> Generator[Session, None, None]:
    command.upgrade(alembic_config(), "head")

    engine = sa.create_engine(postgres_empty_schema)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = session_factory()

    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def _get_db_override() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
