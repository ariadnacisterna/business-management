import enum

from sqlalchemy import Integer, cast, func, literal, select
from sqlalchemy.orm import Session

GLOBAL_LOCK_SCOPE = 0


class LockKind(enum.IntEnum):
    PRODUCT_NAMES = 1
    CATEGORY_NAMES = 2
    UNIT_NAMES = 3
    ATTRIBUTE_NAMES = 4
    ATTRIBUTE_VALUES = 5
    CUSTOMER_NAMES = 6
    PROVIDER_NAMES = 7
    ACCOUNT_USER_NAMES = 8
    PRODUCT_VARIANTS = 9
    IMPORT = 10


def lock_until_commit(db: Session, kind: LockKind, scope_id: int) -> None:
    db.execute(
        select(
            func.pg_advisory_xact_lock(
                cast(literal(int(kind)), Integer), cast(literal(scope_id), Integer)
            )
        )
    )
