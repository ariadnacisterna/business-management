import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus, LoginOutcome
from app.core.security import hash_password, verify_password
from app.db.models import Account, AccountSession
from app.domain.access.errors import InactiveAccount, InvalidCredentials, LoginLocked
from app.domain.access.login_attempts import (
    delete_old_login_attempts,
    ensure_login_allowed,
    normalize_attempted_user_name,
    record_login_attempt,
)
from app.domain.access.sessions import IssuedSession, create_session, delete_session

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


def login(
    db: Session, user_name: str, password: str, ip_address: str
) -> tuple[Account, IssuedSession]:
    now = datetime.now(UTC)
    attempted_user_name = normalize_attempted_user_name(user_name)
    delete_old_login_attempts(db, now)

    try:
        ensure_login_allowed(db, attempted_user_name, ip_address, now)
    except LoginLocked:
        record_login_attempt(db, attempted_user_name, ip_address, LoginOutcome.BLOCKED, now)
        db.commit()
        raise

    try:
        account = authenticate(db, user_name, password)
    except (InvalidCredentials, InactiveAccount):
        record_login_attempt(db, attempted_user_name, ip_address, LoginOutcome.FAILED, now)
        db.commit()
        raise

    record_login_attempt(db, attempted_user_name, ip_address, LoginOutcome.SUCCEEDED, now)
    issued_session = create_session(db, account.id)
    db.commit()
    db.refresh(issued_session.session)
    return account, issued_session


def logout(db: Session, session: AccountSession) -> None:
    delete_session(db, session)
    db.commit()
