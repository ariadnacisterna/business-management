from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.access import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.constants.roles import ADMINISTRADOR
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
    BusinessNotAccessible,
    DuplicateUsername,
    InactiveAccount,
    InvalidCredentials,
    InvalidPassword,
    InvalidRole,
    InvalidUsername,
    NoBusinessAccess,
)
from app.domain.access.permissions import (
    get_active_business,
    get_current_session,
    get_current_user,
    require_csrf,
    require_role,
)

router = APIRouter()


class LoginRequest(BaseModel):
    user_name: str
    password: str


class AccountResponse(BaseModel):
    id: int
    name: str
    user_name: str
    status: str
    role: str | None


class BusinessSummary(BaseModel):
    id: int
    name: str
    industry: str


class SessionInfoResponse(AccountResponse):
    active_business_id: int
    businesses: list[BusinessSummary]


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


def _account_response(db: Session, account: Account, business: Business) -> AccountResponse:
    role = accounts.get_role_name(db, account.id, business.id)
    return AccountResponse(
        id=account.id,
        name=account.name,
        user_name=account.user_name,
        status=account.status,
        role=role,
    )


def _session_info_response(
    db: Session, account: Account, business: Business
) -> SessionInfoResponse:
    role = accounts.get_role_name(db, account.id, business.id)
    accessible = list_accessible_businesses(db, account.id)
    return SessionInfoResponse(
        id=account.id,
        name=account.name,
        user_name=account.user_name,
        status=account.status,
        role=role,
        active_business_id=business.id,
        businesses=[
            BusinessSummary(id=item.id, name=item.name, industry=item.industry)
            for item in accessible
        ],
    )


def _set_session_cookies(response: Response, session: AccountSession) -> None:
    settings = get_settings()
    max_age = settings.session_ttl_minutes * 60
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session.id,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=session.csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


@router.post("/auth/login", response_model=SessionInfoResponse)
def login(
    payload: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> SessionInfoResponse:
    try:
        account, session = auth.login(db, payload.user_name, payload.password)
    except (InvalidCredentials, InactiveAccount) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Usuario o contrasena incorrectos"
        ) from exc

    try:
        business = resolve_active_business(db, account.id, session.active_business_id)
    except NoBusinessAccess as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "La cuenta no tiene acceso a ningun negocio"
        ) from exc

    _set_session_cookies(response, session)
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


@router.post(
    "/auth/active-business",
    response_model=SessionInfoResponse,
    dependencies=[Depends(require_csrf)],
)
def change_active_business(
    payload: ChangeActiveBusinessRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_user),
    session: AccountSession = Depends(get_current_session),
) -> SessionInfoResponse:
    try:
        business = set_active_business(db, account.id, session, payload.business_id)
    except BusinessNotAccessible as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "La cuenta no tiene acceso a ese negocio"
        ) from exc

    return _session_info_response(db, account, business)


@router.post(
    "/accounts",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_account(
    payload: CreateAccountRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.create_account(
            db, business, payload.name, payload.user_name, payload.initial_password, payload.role
        )
    except DuplicateUsername as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El nombre de usuario ya esta en uso"
        ) from exc
    except (InvalidRole, InvalidUsername, InvalidPassword) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _account_response(db, account, business)


@router.get("/accounts", response_model=list[AccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> list[AccountResponse]:
    return [_account_response(db, account, business) for account in accounts.list_accounts(db)]


@router.get("/accounts/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.get_account(db, account_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _account_response(db, account, business)


@router.patch(
    "/accounts/{account_id}", response_model=AccountResponse, dependencies=[Depends(require_csrf)]
)
def update_account(
    account_id: int,
    payload: UpdateAccountRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.update_account(
            db,
            business,
            account_id,
            name=payload.name,
            user_name=payload.user_name,
            role_name=payload.role,
        )
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except DuplicateUsername as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El nombre de usuario ya esta en uso"
        ) from exc
    except (InvalidRole, InvalidUsername) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _account_response(db, account, business)


@router.post(
    "/accounts/{account_id}/deactivate",
    response_model=AccountResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_account(
    account_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.deactivate_account(db, account_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _account_response(db, account, business)


@router.post(
    "/accounts/{account_id}/activate",
    response_model=AccountResponse,
    dependencies=[Depends(require_csrf)],
)
def activate_account(
    account_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.activate_account(db, account_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _account_response(db, account, business)


@router.post(
    "/accounts/{account_id}/reset-password",
    response_model=AccountResponse,
    dependencies=[Depends(require_csrf)],
)
def reset_password(
    account_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
    business: Business = Depends(get_active_business),
) -> AccountResponse:
    try:
        account = accounts.reset_password(db, account_id, payload.new_password)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except InvalidPassword as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _account_response(db, account, business)
