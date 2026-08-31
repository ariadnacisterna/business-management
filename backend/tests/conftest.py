from collections.abc import Generator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


@pytest.fixture(scope="session")
def _postgres_unavailable_reason() -> str | None:
    settings = get_settings()
    engine = sa.create_engine(settings.database_url, connect_args={"connect_timeout": 3})
    try:
        with engine.connect():
            return None
    except OperationalError as exc:
        return str(exc)
    finally:
        engine.dispose()


@pytest.fixture
def postgres_empty_schema(
    _postgres_unavailable_reason: str | None,
) -> Generator[str, None, None]:
    if _postgres_unavailable_reason is not None:
        pytest.skip(
            f"PostgreSQL no disponible para pruebas de integracion: {_postgres_unavailable_reason}"
        )

    settings = get_settings()
    engine = sa.create_engine(settings.database_url)
    with engine.connect() as connection:
        connection.execute(sa.text("DROP SCHEMA public CASCADE"))
        connection.execute(sa.text("CREATE SCHEMA public"))
        connection.commit()

    yield settings.database_url

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
