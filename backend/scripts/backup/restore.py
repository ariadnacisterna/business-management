import shutil
import subprocess
import sys
import tempfile
from getpass import getpass
from pathlib import Path

import psycopg
from psycopg import sql

DRIVER_SCHEME_PREFIX = "postgresql+"
LIBPQ_SCHEME = "postgresql"
APPLICATION_SCHEMA = "public"
DECRYPTED_FILE_NAME = "copia.dump"
REQUIRED_PROGRAMS = ("gpg", "pg_restore")


def libpq_connection_url(url: str) -> str:
    if url.startswith(DRIVER_SCHEME_PREFIX):
        _, _, rest = url.partition("://")
        return f"{LIBPQ_SCHEME}://{rest}"
    return url


def program_path(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise SystemExit(f"No se encontró el programa {name}. Revisá docs/14 para instalarlo.")
    return path


def application_tables(connection: psycopg.Connection) -> list[str]:
    rows = connection.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY table_name",
        (APPLICATION_SCHEMA,),
    ).fetchall()
    return [row[0] for row in rows]


def table_row_count(connection: psycopg.Connection, table: str) -> int:
    query = sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(APPLICATION_SCHEMA, table))
    return connection.execute(query).fetchone()[0]


def decrypt(gpg: str, encrypted_path: Path, decrypted_path: Path, key: str) -> None:
    result = subprocess.run(
        [
            gpg,
            "--batch",
            "--yes",
            "--pinentry-mode",
            "loopback",
            "--passphrase-fd",
            "0",
            "--output",
            str(decrypted_path),
            "--decrypt",
            str(encrypted_path),
        ],
        input=key.encode("utf-8"),
        capture_output=True,
    )
    if result.returncode != 0:
        raise SystemExit("No se pudo descifrar la copia. Revisá la clave y el archivo.")


def restore(pg_restore: str, dump_path: Path, connection_url: str) -> None:
    result = subprocess.run(
        [
            pg_restore,
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            "--single-transaction",
            "--schema",
            APPLICATION_SCHEMA,
            "--dbname",
            connection_url,
            str(dump_path),
        ],
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr.replace(connection_url, "<conexión oculta>"), file=sys.stderr)
        raise SystemExit("La restauración falló y no se aplicó ningún cambio.")


def main(arguments: list[str]) -> None:
    if len(arguments) != 1:
        raise SystemExit("Uso: python -m scripts.backup.restore <archivo .dump.gpg>")
    encrypted_path = Path(arguments[0])
    if not encrypted_path.is_file():
        raise SystemExit(f"No se encontró el archivo {encrypted_path}.")
    gpg, pg_restore = (program_path(name) for name in REQUIRED_PROGRAMS)
    key = getpass("Clave de cifrado de las copias (no se ve al escribirla): ")
    connection_url = libpq_connection_url(
        getpass("Conexión a la base VACÍA donde restaurar (no se ve al escribirla): ").strip()
    )
    with psycopg.connect(connection_url) as connection:
        if application_tables(connection):
            raise SystemExit("La base de destino no está vacía. No se restauró nada.")
    with tempfile.TemporaryDirectory() as work_directory:
        dump_path = Path(work_directory) / DECRYPTED_FILE_NAME
        decrypt(gpg, encrypted_path, dump_path, key)
        restore(pg_restore, dump_path, connection_url)
    with psycopg.connect(connection_url) as connection:
        tables = application_tables(connection)
        print(f"Restauración terminada: {len(tables)} tablas.")
        for table in tables:
            print(f"  {table}: {table_row_count(connection, table)} filas")


if __name__ == "__main__":
    main(sys.argv[1:])
