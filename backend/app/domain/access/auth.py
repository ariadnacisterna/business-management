import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.estado import EstadoEntidad
from app.core.security import hash_password, verify_password
from app.db.models import Sesion, Usuario
from app.domain.access.errors import InactiveAccount, InvalidCredentials
from app.domain.access.sessions import create_session, delete_session

_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def authenticate(db: Session, user_name: str, password: str) -> Usuario:
    usuario = db.scalars(select(Usuario).where(Usuario.user_name == user_name)).first()
    hash_to_verify = usuario.password_hash if usuario is not None else _DUMMY_PASSWORD_HASH
    password_valid = verify_password(password, hash_to_verify)

    if usuario is None or not password_valid:
        raise InvalidCredentials

    if usuario.estado != EstadoEntidad.ACTIVO.value:
        raise InactiveAccount

    return usuario


def login(db: Session, user_name: str, password: str) -> tuple[Usuario, Sesion]:
    usuario = authenticate(db, user_name, password)
    sesion = create_session(db, usuario.id)
    db.commit()
    db.refresh(sesion)
    return usuario, sesion


def logout(db: Session, sesion: Sesion) -> None:
    delete_session(db, sesion)
    db.commit()
