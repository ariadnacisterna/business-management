import secrets
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.access import (
    CSRF_HEADER_NAME,
    CSRF_SAFE_METHODS,
    INVALID_CSRF_DETAIL,
    INVALID_SESSION_DETAIL,
    NO_BUSINESS_ACCESS_DETAIL,
    PERMISSION_DENIED_DETAIL,
    SESSION_COOKIE_NAME,
)
from app.constants.status import EntityStatus
from app.db.models import Account, AccountSession, Business, BusinessAccess
from app.db.session import get_db
from app.domain.access.active_business import resolve_active_business
from app.domain.access.errors import NoBusinessAccess
from app.domain.access.sessions import extend_session, get_valid_session


def get_current_session(request: Request, db: Session = Depends(get_db)) -> AccountSession:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_SESSION_DETAIL)

    session = get_valid_session(db, token)
    if session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_SESSION_DETAIL)

    extend_session(db, session)
    return session


def get_current_user(
    session: AccountSession = Depends(get_current_session), db: Session = Depends(get_db)
) -> Account:
    account = db.get(Account, session.account_id)
    if account is None or account.status != EntityStatus.ACTIVE.value:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_SESSION_DETAIL)
    return account


def require_csrf(request: Request, session: AccountSession = Depends(get_current_session)) -> None:
    if request.method.upper() in CSRF_SAFE_METHODS:
        return

    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not header_token or not secrets.compare_digest(header_token, session.csrf_token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, INVALID_CSRF_DETAIL)


def get_active_business(
    account: Account = Depends(get_current_user),
    session: AccountSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> Business:
    try:
        return resolve_active_business(db, account.id, session.active_business_id)
    except NoBusinessAccess as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, NO_BUSINESS_ACCESS_DETAIL) from exc


def require_role(*role_names: str) -> Callable[..., Account]:
    def dependency(
        account: Account = Depends(get_current_user),
        business: Business = Depends(get_active_business),
        db: Session = Depends(get_db),
    ) -> Account:
        access = db.scalars(
            select(BusinessAccess).where(
                BusinessAccess.account_id == account.id,
                BusinessAccess.business_id == business.id,
            )
        ).first()

        if (
            access is None
            or access.status != EntityStatus.ACTIVE.value
            or access.role.name not in role_names
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL)

        return account

    return dependency
