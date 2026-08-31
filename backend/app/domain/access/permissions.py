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
    PERMISSION_DENIED_DETAIL,
    SESSION_COOKIE_NAME,
)
from app.constants.estado import EstadoEntidad
from app.db.models import AccesoANegocio, Sesion, Usuario
from app.db.session import get_db
from app.domain.access.active_business import get_active_business
from app.domain.access.sessions import extend_session, get_valid_session


def get_current_session(request: Request, db: Session = Depends(get_db)) -> Sesion:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_SESSION_DETAIL)

    sesion = get_valid_session(db, token)
    if sesion is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_SESSION_DETAIL)

    extend_session(db, sesion)
    return sesion


def get_current_user(
    sesion: Sesion = Depends(get_current_session), db: Session = Depends(get_db)
) -> Usuario:
    usuario = db.get(Usuario, sesion.usuario_id)
    if usuario is None or usuario.estado != EstadoEntidad.ACTIVO.value:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_SESSION_DETAIL)
    return usuario


def require_csrf(request: Request, sesion: Sesion = Depends(get_current_session)) -> None:
    if request.method.upper() in CSRF_SAFE_METHODS:
        return

    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not header_token or not secrets.compare_digest(header_token, sesion.csrf_token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, INVALID_CSRF_DETAIL)


def require_role(*nombres_rol: str) -> Callable[..., Usuario]:
    def dependency(
        usuario: Usuario = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> Usuario:
        negocio = get_active_business(db)
        acceso = db.scalars(
            select(AccesoANegocio).where(
                AccesoANegocio.usuario_id == usuario.id,
                AccesoANegocio.negocio_id == negocio.id,
            )
        ).first()

        if (
            acceso is None
            or acceso.estado != EstadoEntidad.ACTIVO.value
            or acceso.rol.nombre not in nombres_rol
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, PERMISSION_DENIED_DETAIL)

        return usuario

    return dependency
