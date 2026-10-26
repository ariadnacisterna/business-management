from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.submissions import require_submission_key, respond_once
from app.constants.access import (
    BUSINESS_NOT_ACCESSIBLE_DETAIL,
    CSRF_COOKIE_NAME,
    INVALID_CREDENTIALS_DETAIL,
    LOGIN_LOCKED_DETAIL,
    NO_BUSINESS_ACCESS_DETAIL,
    PERMISSION_DENIED_DETAIL,
    SESSION_COOKIE_NAME,
)
from app.constants.roles import ACCOUNT_MANAGER_ROLE, ADMINISTRADOR, DUENO
from app.core.client_ip import get_client_ip
from app.core.config import get_settings
from app.db.models import Account, AccountSession, Business
from app.db.session import get_db
from app.domain.access import accounts, auth
from app.domain.access.active_business import (
    list_accessible_businesses,
    resolve_active_business,
    set_active_business,
)
from app.domain.access.errors import (
    AccountNotFound,
    ActorNotAllowed,
    BusinessNotAccessible,
    DuplicateUsername,
    InactiveAccount,
    InsufficientRoleRank,
    InvalidAccountName,
    InvalidCredentials,
    InvalidFontSize,
    InvalidPassword,
    InvalidRole,
    InvalidTransferAlias,
    InvalidUsername,
    LoginLocked,
    NoBusinessAccess,
    PasswordUnchanged,
    SelfActionForbidden,
    WrongCurrentPassword,
)
from app.domain.access.login_attempts import summarize_recent_blocked_logins
from app.domain.access.permissions import (
    get_active_business,
    get_current_session,
    get_current_user,
    require_csrf,
    require_role,
)
from app.domain.access.sessions import IssuedSession
from app.domain.cash.registers import ensure_open_register

router = APIRouter()


class LoginRequest(BaseModel):
    user_name: str
    password: str


class LoginLockedDetail(BaseModel):
    message: str
    retry_after_seconds: int


class BusinessSummary(BaseModel):
    id: int
    name: str
    industry: str
    transfer_alias: str | None = None


class AccountResponse(BaseModel):
    id: int
    name: str
    user_name: str
    status: str
    font_size: int
    role: str | None
    businesses: list[BusinessSummary]


class SessionInfoResponse(AccountResponse):
    active_business_id: int


class UpdatePreferencesRequest(BaseModel):
    font_size: int


class UpdateTransferAliasRequest(BaseModel):
    transfer_alias: str | None = None


class UpdateOwnNameRequest(BaseModel):
    name: str


class ChangeOwnPasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ChangeActiveBusinessRequest(BaseModel):
    business_id: int


class CreateAccountRequest(BaseModel):
    name: str
    user_name: str
    initial_password: str
    role: str


class UpdateAccountRequest(BaseModel):
    name: str | None = None
    user_name: str | None = None
    role: str | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str


class BlockedLoginAlertResponse(BaseModel):
    account_id: int
    name: str
    user_name: str
    blocked_attempts: int
    last_blocked_at: datetime


def _business_summaries(db: Session, account_id: int) -> list[BusinessSummary]:
    return [
        BusinessSummary(
            id=item.id,
            name=item.name,
            industry=item.industry,
            transfer_alias=item.transfer_alias,
        )
        for item in list_accessible_businesses(db, account_id)
    ]


def _business_summaries_visible_to_actor(
    db: Session, account_id: int, actor_id: int
) -> list[BusinessSummary]:
    visible_business_ids = {item.id for item in list_accessible_businesses(db, actor_id)}
    return [
        summary
        for summary in _business_summaries(db, account_id)
        if summary.id in visible_business_ids
    ]


def _account_response(
    db: Session, account: Account, business: Business, actor: Account
) -> AccountResponse:
    role = accounts.get_primary_role_name(db, account.id, business.id)
    return AccountResponse(
        id=account.id,
        name=account.name,
        user_name=account.user_name,
        status=account.status,
        font_size=account.font_size,
        role=role,
        businesses=_business_summaries_visible_to_actor(db, account.id, actor.id),
    )


def _session_info_response(
    db: Session, account: Account, business: Business
) -> SessionInfoResponse:
    role = accounts.get_role_name(db, account.id, business.id)
    return SessionInfoResponse(
        id=account.id,
        name=account.name,
        user_name=account.user_name,
        status=account.status,
        font_size=account.font_size,
        role=role,
        active_business_id=business.id,
        businesses=_business_summaries(db, account.id),
    )


def _set_session_cookies(response: Response, issued_session: IssuedSession) -> None:
    settings = get_settings()
    max_age = settings.session_ttl_minutes * 60
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=issued_session.session_token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=issued_session.csrf_token,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


def _accounts_visible_to_actor(db: Session, actor: Account, business: Business) -> list[Account]:
    actor_role = accounts.get_role_name(db, actor.id, business.id)
    if actor_role == DUENO:
        business_ids = [item.id for item in list_accessible_businesses(db, actor.id)]
        return accounts.list_accounts_for_businesses(db, business_ids)
    return accounts.list_accounts(db, business.id)


@router.post("/auth/login", response_model=SessionInfoResponse)
def login(
    payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)
) -> SessionInfoResponse:
    try:
        account, issued_session = auth.login(
            db, payload.user_name, payload.password, get_client_ip(request)
        )
    except LoginLocked as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            LoginLockedDetail(
                message=LOGIN_LOCKED_DETAIL, retry_after_seconds=exc.retry_after_seconds
            ).model_dump(),
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    except (InvalidCredentials, InactiveAccount) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_CREDENTIALS_DETAIL) from exc

    try:
        business = resolve_active_business(
            db, account.id, issued_session.session.active_business_id
        )
    except NoBusinessAccess as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, NO_BUSINESS_ACCESS_DETAIL) from exc

    ensure_open_register(db, business.id, account.id)
    db.commit()
    _set_session_cookies(response, issued_session)
    return _session_info_response(db, account, business)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    session: AccountSession = Depends(get_current_session),
    _csrf: None = Depends(require_csrf),
) -> None:
    auth.logout(db, session)
    _clear_session_cookies(response)


@router.get("/auth/me", response_model=SessionInfoResponse)
def me(
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> SessionInfoResponse:
    return _session_info_response(db, account, business)


@router.patch("/auth/me", response_model=SessionInfoResponse, dependencies=[Depends(require_csrf)])
def update_own_name(
    payload: UpdateOwnNameRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> SessionInfoResponse:
    try:
        account = accounts.update_own_name(db, account, payload.name)
    except InvalidAccountName as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    return _session_info_response(db, account, business)


@router.post(
    "/auth/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
def change_own_password(
    payload: ChangeOwnPasswordRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_user),
    session: AccountSession = Depends(get_current_session),
) -> None:
    try:
        accounts.change_own_password(
            db, account, session.id, payload.current_password, payload.new_password
        )
    except WrongCurrentPassword as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except (PasswordUnchanged, InvalidPassword) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.patch(
    "/auth/me/preferences",
    response_model=SessionInfoResponse,
    dependencies=[Depends(require_csrf)],
)
def update_preferences(
    payload: UpdatePreferencesRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> SessionInfoResponse:
    try:
        account = accounts.update_own_font_size(db, account, payload.font_size)
    except InvalidFontSize as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    return _session_info_response(db, account, business)


@router.patch(
    "/auth/business/transfer-alias",
    response_model=SessionInfoResponse,
    dependencies=[Depends(require_csrf)],
)
def update_transfer_alias(
    payload: UpdateTransferAliasRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> SessionInfoResponse:
    try:
        business = accounts.update_transfer_alias(db, business, payload.transfer_alias)
    except InvalidTransferAlias as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    return _session_info_response(db, account, business)


@router.post(
    "/auth/active-business",
    response_model=SessionInfoResponse,
    dependencies=[Depends(require_csrf)],
)
def change_active_business(
    payload: ChangeActiveBusinessRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(require_role(DUENO)),
    session: AccountSession = Depends(get_current_session),
) -> SessionInfoResponse:
    try:
        business = set_active_business(db, account.id, session, payload.business_id)
    except BusinessNotAccessible as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, BUSINESS_NOT_ACCESSIBLE_DETAIL) from exc

    return _session_info_response(db, account, business)


@router.post(
    "/accounts",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_account(
    payload: CreateAccountRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
    submission_key: str = Depends(require_submission_key),
) -> AccountResponse:
    def perform() -> AccountResponse:
        account = accounts.add_account_by_manager(
            db,
            business,
            actor.id,
            payload.name,
            payload.user_name,
            payload.initial_password,
            payload.role,
        )
        return _account_response(db, account, business, actor)

    try:
        return respond_once(
            db,
            actor.id,
            submission_key,
            request,
            payload.model_dump_json().encode(),
            AccountResponse,
            perform,
        )
    except ActorNotAllowed as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL) from exc
    except DuplicateUsername as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El nombre de usuario ya esta en uso"
        ) from exc
    except (InvalidRole, InvalidUsername, InvalidPassword, InvalidAccountName) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except InsufficientRoleRank as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc


@router.get("/accounts", response_model=list[AccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> list[AccountResponse]:
    return [
        _account_response(db, account, business, actor)
        for account in _accounts_visible_to_actor(db, actor, business)
    ]


@router.get("/accounts/login-alerts", response_model=list[BlockedLoginAlertResponse])
def list_login_alerts(
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> list[BlockedLoginAlertResponse]:
    summaries = summarize_recent_blocked_logins(
        db, _accounts_visible_to_actor(db, actor, business), datetime.now(UTC)
    )
    return [
        BlockedLoginAlertResponse(
            account_id=summary.account.id,
            name=summary.account.name,
            user_name=summary.account.user_name,
            blocked_attempts=summary.blocked_attempts,
            last_blocked_at=summary.last_blocked_at,
        )
        for summary in summaries
    ]


@router.get("/accounts/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.get_account(db, business.id, account_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _account_response(db, account, business, actor)


@router.patch(
    "/accounts/{account_id}", response_model=AccountResponse, dependencies=[Depends(require_csrf)]
)
def update_account(
    account_id: int,
    payload: UpdateAccountRequest,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.update_account(
            db,
            business,
            account_id,
            actor.id,
            name=payload.name,
            user_name=payload.user_name,
            role_name=payload.role,
        )
    except ActorNotAllowed as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL) from exc
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except DuplicateUsername as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El nombre de usuario ya esta en uso"
        ) from exc
    except (InvalidRole, InvalidUsername, InvalidAccountName) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except (InsufficientRoleRank, SelfActionForbidden) as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc

    return _account_response(db, account, business, actor)


@router.post(
    "/accounts/{account_id}/deactivate",
    response_model=AccountResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_account(
    account_id: int,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.deactivate_account(db, business.id, account_id, actor.id)
    except ActorNotAllowed as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL) from exc
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except SelfActionForbidden as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc

    return _account_response(db, account, business, actor)


@router.post(
    "/accounts/{account_id}/activate",
    response_model=AccountResponse,
    dependencies=[Depends(require_csrf)],
)
def activate_account(
    account_id: int,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.activate_account(db, business.id, account_id, actor.id)
    except ActorNotAllowed as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL) from exc
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _account_response(db, account, business, actor)


@router.post(
    "/accounts/{account_id}/reset-password",
    response_model=AccountResponse,
    dependencies=[Depends(require_csrf)],
)
def reset_password(
    account_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ACCOUNT_MANAGER_ROLE)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.reset_password(
            db, business.id, account_id, actor.id, payload.new_password
        )
    except ActorNotAllowed as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL) from exc
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except InvalidPassword as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    return _account_response(db, account, business, actor)
