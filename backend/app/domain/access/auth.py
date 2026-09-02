import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.core.security import hash_password, verify_password
from app.db.models import Account, AccountSession
from app.domain.access.errors import InactiveAccount, InvalidCredentials
from app.domain.access.sessions import create_session, delete_session

_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def authenticate(db: Session, user_name: str, password: str) -> Account:
    account = db.scalars(select(Account).where(Account.user_name == user_name)).first()
    hash_to_verify = account.password_hash if account is not None else _DUMMY_PASSWORD_HASH
    password_valid = verify_password(password, hash_to_verify)

    if account is None or not password_valid:
        raise InvalidCredentials

    if account.status != EntityStatus.ACTIVE.value:
        raise InactiveAccount

    return account


def login(db: Session, user_name: str, password: str) -> tuple[Account, AccountSession]:
    account = authenticate(db, user_name, password)
    session = create_session(db, account.id)
    db.commit()
    db.refresh(session)
    return account, session


def logout(db: Session, session: AccountSession) -> None:
    delete_session(db, session)
    db.commit()
