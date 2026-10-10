from getpass import getpass
from itertools import groupby

from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.domain.audit.integrity import IntegrityProblem, find_integrity_problems
from scripts.database_connection import (
    CONNECTION_PROMPT,
    DATABASE_FAILED_MESSAGE,
    connected_engine,
    sqlalchemy_connection_url,
)

NO_PROBLEMS_MESSAGE = "Sin problemas."
GENERAL_SECTION_TITLE = "General:"
PROBLEMS_FOUND_EXIT_CODE = 1


def _business_sort_key(problem: IntegrityProblem) -> tuple[bool, str]:
    return (problem.business_name is None, problem.business_name or "")


def describe_problems(problems: list[IntegrityProblem]) -> list[str]:
    if not problems:
        return [NO_PROBLEMS_MESSAGE]

    count_label = "problema" if len(problems) == 1 else "problemas"
    lines = [f"Se encontraron {len(problems)} {count_label}:"]
    ordered = sorted(problems, key=_business_sort_key)
    for business_name, business_problems in groupby(ordered, key=lambda item: item.business_name):
        lines.append("")
        lines.append(
            f'Negocio "{business_name}":' if business_name is not None else GENERAL_SECTION_TITLE
        )
        lines.extend(f"  - {problem.description}" for problem in business_problems)
    return lines


def main() -> None:
    engine = connected_engine(sqlalchemy_connection_url(getpass(CONNECTION_PROMPT)))
    try:
        with (
            engine.connect().execution_options(
                isolation_level="REPEATABLE READ", postgresql_readonly=True
            ) as connection,
            Session(bind=connection) as db,
        ):
            try:
                problems = find_integrity_problems(db)
            except DBAPIError:
                raise SystemExit(DATABASE_FAILED_MESSAGE) from None
            finally:
                db.rollback()
    finally:
        engine.dispose()

    print()
    for line in describe_problems(problems):
        print(line)
    if problems:
        raise SystemExit(PROBLEMS_FOUND_EXIT_CODE)


if __name__ == "__main__":
    main()
