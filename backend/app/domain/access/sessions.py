from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import generate_csrf_token, generate_session_token, hash_token
from app.db.models import AccountSession


class IssuedSession(NamedTuple):
    session: AccountSession
    session_token: str
    csrf_token: str


def create_session(db: Session, account_id: int) -> IssuedSession:
    settings = get_settings()
    now = datetime.now(UTC)
    session_token = generate_session_token()
    csrf_token = generate_csrf_token()
    session = AccountSession(
        id=hash_token(session_token),
        account_id=account_id,
        csrf_token_hash=hash_token(csrf_token),
        created_at=now,
        expires_at=now + timedelta(minutes=settings.session_ttl_minutes),
    )
    db.add(session)
    return IssuedSession(session, session_token, csrf_token)


def get_valid_session(db: Session, token: str) -> AccountSession | None:
    session = db.get(AccountSession, hash_token(token))
    if session is None:
        return None
    if session.expires_at <= datetime.now(UTC):
        db.delete(session)
        db.commit()
        return None
    return session


def extend_session(db: Session, session: AccountSession) -> None:
    settings = get_settings()
    session.expires_at = datetime.now(UTC) + timedelta(minutes=settings.session_ttl_minutes)
    db.commit()


def delete_session(db: Session, session: AccountSession) -> None:
    db.delete(session)


def delete_sessions_for_account(db: Session, account_id: int) -> None:
    db.execute(delete(AccountSession).where(AccountSession.account_id == account_id))
