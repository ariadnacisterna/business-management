from sqlalchemy import URL, Engine, create_engine, make_url
from sqlalchemy.exc import ArgumentError, DBAPIError

ACCEPTED_SCHEMES = ("postgresql", "postgres")
SQLALCHEMY_DRIVER = "postgresql+psycopg"
CONNECT_TIMEOUT_SECONDS = 15
CONNECTION_PROMPT = "Conexión a la base, Session pooler de Supabase (no se ve al escribirla): "
NOTHING_CHANGED = "No se cambió nada."
INVALID_CONNECTION_MESSAGE = (
    "La conexión no tiene el formato esperado (tiene que empezar con postgresql://). "
    + NOTHING_CHANGED
)
CONNECTION_FAILED_MESSAGE = (
    "No se pudo conectar a la base. Revisá que la conexión sea la del Session pooler, "
    "con la contraseña correcta, y que el proyecto de Supabase no esté pausado. " + NOTHING_CHANGED
)
DATABASE_FAILED_MESSAGE = "La base devolvió un error durante la operación. " + NOTHING_CHANGED


def sqlalchemy_connection_url(raw_url: str) -> URL:
    try:
        url = make_url(raw_url.strip())
    except (ArgumentError, ValueError):
        raise SystemExit(INVALID_CONNECTION_MESSAGE) from None
    if url.drivername.partition("+")[0] not in ACCEPTED_SCHEMES or not url.host:
        raise SystemExit(INVALID_CONNECTION_MESSAGE)
    return url.set(drivername=SQLALCHEMY_DRIVER)


def connected_engine(connection_url: URL) -> Engine:
    engine = create_engine(
        connection_url, connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS}
    )
    try:
        engine.connect().close()
    except DBAPIError:
        engine.dispose()
        raise SystemExit(CONNECTION_FAILED_MESSAGE) from None
    return engine
