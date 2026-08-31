from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.access import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME
from app.constants.roles import ADMINISTRADOR
from app.core.config import get_settings
from app.db.models import Sesion, Usuario
from app.db.session import get_db
from app.domain.access import accounts, auth
from app.domain.access.active_business import get_active_business
from app.domain.access.errors import (
    AccountNotFound,
    DuplicateUsername,
    InactiveAccount,
    InvalidCredentials,
    InvalidPassword,
    InvalidRole,
    InvalidUsername,
)
from app.domain.access.permissions import (
    get_current_session,
    get_current_user,
    require_csrf,
    require_role,
)

router = APIRouter()


class LoginRequest(BaseModel):
    user_name: str
    password: str


class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    user_name: str
    estado: str
    rol: str | None


class CreateAccountRequest(BaseModel):
    nombre: str
    user_name: str
    initial_password: str
    rol: str


class UpdateAccountRequest(BaseModel):
    nombre: str | None = None
    user_name: str | None = None
    rol: str | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str


def _usuario_response(db: Session, usuario: Usuario) -> UsuarioResponse:
    negocio = get_active_business(db)
    rol = accounts.get_role_name(db, usuario.id, negocio.id)
    return UsuarioResponse(
        id=usuario.id,
        nombre=usuario.nombre,
        user_name=usuario.user_name,
        estado=usuario.estado,
        rol=rol,
    )


def _set_session_cookies(response: Response, sesion: Sesion) -> None:
    settings = get_settings()
    max_age = settings.session_ttl_minutes * 60
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sesion.id,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=sesion.csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


@router.post("/auth/login", response_model=UsuarioResponse)
def login(
    payload: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> UsuarioResponse:
    try:
        usuario, sesion = auth.login(db, payload.user_name, payload.password)
    except (InvalidCredentials, InactiveAccount) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Usuario o contrasena incorrectos"
        ) from exc

    _set_session_cookies(response, sesion)
    return _usuario_response(db, usuario)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(get_current_session),
    _csrf: None = Depends(require_csrf),
) -> None:
    auth.logout(db, sesion)
    _clear_session_cookies(response)


@router.get("/auth/me", response_model=UsuarioResponse)
def me(
    db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)
) -> UsuarioResponse:
    return _usuario_response(db, usuario)


@router.post(
    "/accounts",
    response_model=UsuarioResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_account(
    payload: CreateAccountRequest,
    db: Session = Depends(get_db),
    _actor: Usuario = Depends(require_role(ADMINISTRADOR)),
) -> UsuarioResponse:
    try:
        usuario = accounts.create_account(
            db, payload.nombre, payload.user_name, payload.initial_password, payload.rol
        )
    except DuplicateUsername as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El nombre de usuario ya esta en uso"
        ) from exc
    except (InvalidRole, InvalidUsername, InvalidPassword) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _usuario_response(db, usuario)


@router.get("/accounts", response_model=list[UsuarioResponse])
def list_accounts(
    db: Session = Depends(get_db), _actor: Usuario = Depends(require_role(ADMINISTRADOR))
) -> list[UsuarioResponse]:
    return [_usuario_response(db, usuario) for usuario in accounts.list_accounts(db)]


@router.get("/accounts/{usuario_id}", response_model=UsuarioResponse)
def get_account(
    usuario_id: int,
    db: Session = Depends(get_db),
    _actor: Usuario = Depends(require_role(ADMINISTRADOR)),
) -> UsuarioResponse:
    try:
        usuario = accounts.get_account(db, usuario_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _usuario_response(db, usuario)


@router.patch(
    "/accounts/{usuario_id}", response_model=UsuarioResponse, dependencies=[Depends(require_csrf)]
)
def update_account(
    usuario_id: int,
    payload: UpdateAccountRequest,
    db: Session = Depends(get_db),
    _actor: Usuario = Depends(require_role(ADMINISTRADOR)),
) -> UsuarioResponse:
    try:
        usuario = accounts.update_account(
            db,
            usuario_id,
            nombre=payload.nombre,
            user_name=payload.user_name,
            nombre_rol=payload.rol,
        )
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except DuplicateUsername as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El nombre de usuario ya esta en uso"
        ) from exc
    except (InvalidRole, InvalidUsername) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _usuario_response(db, usuario)


@router.post(
    "/accounts/{usuario_id}/deactivate",
    response_model=UsuarioResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_account(
    usuario_id: int,
    db: Session = Depends(get_db),
    _actor: Usuario = Depends(require_role(ADMINISTRADOR)),
) -> UsuarioResponse:
    try:
        usuario = accounts.deactivate_account(db, usuario_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _usuario_response(db, usuario)


@router.post(
    "/accounts/{usuario_id}/activate",
    response_model=UsuarioResponse,
    dependencies=[Depends(require_csrf)],
)
def activate_account(
    usuario_id: int,
    db: Session = Depends(get_db),
    _actor: Usuario = Depends(require_role(ADMINISTRADOR)),
) -> UsuarioResponse:
    try:
        usuario = accounts.activate_account(db, usuario_id)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc

    return _usuario_response(db, usuario)


@router.post(
    "/accounts/{usuario_id}/reset-password",
    response_model=UsuarioResponse,
    dependencies=[Depends(require_csrf)],
)
def reset_password(
    usuario_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _actor: Usuario = Depends(require_role(ADMINISTRADOR)),
) -> UsuarioResponse:
    try:
        usuario = accounts.reset_password(db, usuario_id, payload.new_password)
    except AccountNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada") from exc
    except InvalidPassword as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _usuario_response(db, usuario)
