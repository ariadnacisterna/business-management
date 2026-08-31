from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.estado import EstadoEntidad
from app.constants.limits import PASSWORD_MIN_LENGTH, USERNAME_MIN_LENGTH
from app.constants.roles import ROLES_INICIALES
from app.core.security import hash_password
from app.db.models import AccesoANegocio, Rol, Usuario
from app.domain.access.active_business import get_active_business
from app.domain.access.errors import (
    AccountNotFound,
    DuplicateUsername,
    InvalidPassword,
    InvalidRole,
    InvalidUsername,
)
from app.domain.access.sessions import delete_sessions_for_user


def _validate_user_name(user_name: str) -> None:
    if len(user_name) < USERNAME_MIN_LENGTH:
        raise InvalidUsername(
            f"El nombre de usuario debe tener al menos {USERNAME_MIN_LENGTH} caracteres"
        )


def _validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise InvalidPassword(f"La contrasena debe tener al menos {PASSWORD_MIN_LENGTH} caracteres")


def _get_rol(db: Session, nombre_rol: str) -> Rol:
    if nombre_rol not in ROLES_INICIALES:
        raise InvalidRole(f"Rol desconocido: {nombre_rol}")
    rol = db.scalars(select(Rol).where(Rol.nombre == nombre_rol)).first()
    if rol is None:
        raise InvalidRole(f"Rol desconocido: {nombre_rol}")
    return rol


def _get_usuario(db: Session, usuario_id: int) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise AccountNotFound
    return usuario


def _get_acceso(db: Session, usuario_id: int, negocio_id: int) -> AccesoANegocio | None:
    return db.scalars(
        select(AccesoANegocio).where(
            AccesoANegocio.usuario_id == usuario_id,
            AccesoANegocio.negocio_id == negocio_id,
        )
    ).first()


def create_account(
    db: Session, nombre: str, user_name: str, initial_password: str, nombre_rol: str
) -> Usuario:
    _validate_user_name(user_name)
    _validate_password(initial_password)
    rol = _get_rol(db, nombre_rol)
    negocio = get_active_business(db)

    existing_user = db.scalars(select(Usuario).where(Usuario.user_name == user_name)).first()
    if existing_user is not None:
        raise DuplicateUsername

    usuario = Usuario(
        organizacion_id=negocio.organizacion_id,
        nombre=nombre,
        user_name=user_name,
        password_hash=hash_password(initial_password),
        estado=EstadoEntidad.ACTIVO.value,
    )
    db.add(usuario)
    db.flush()

    acceso = AccesoANegocio(
        usuario_id=usuario.id,
        negocio_id=negocio.id,
        rol_id=rol.id,
        estado=EstadoEntidad.ACTIVO.value,
    )
    db.add(acceso)
    db.commit()
    db.refresh(usuario)
    return usuario


def update_account(
    db: Session,
    usuario_id: int,
    nombre: str | None = None,
    user_name: str | None = None,
    nombre_rol: str | None = None,
) -> Usuario:
    usuario = _get_usuario(db, usuario_id)

    if nombre is not None:
        usuario.nombre = nombre

    if user_name is not None and user_name != usuario.user_name:
        _validate_user_name(user_name)
        en_uso = db.scalars(
            select(Usuario).where(Usuario.user_name == user_name, Usuario.id != usuario.id)
        ).first()
        if en_uso is not None:
            raise DuplicateUsername
        usuario.user_name = user_name

    if nombre_rol is not None:
        rol = _get_rol(db, nombre_rol)
        negocio = get_active_business(db)
        acceso = _get_acceso(db, usuario.id, negocio.id)
        if acceso is None:
            raise AccountNotFound
        acceso.rol_id = rol.id

    db.commit()
    db.refresh(usuario)
    return usuario


def deactivate_account(db: Session, usuario_id: int) -> Usuario:
    usuario = _get_usuario(db, usuario_id)
    usuario.estado = EstadoEntidad.INACTIVO.value
    delete_sessions_for_user(db, usuario.id)
    db.commit()
    db.refresh(usuario)
    return usuario


def activate_account(db: Session, usuario_id: int) -> Usuario:
    usuario = _get_usuario(db, usuario_id)
    usuario.estado = EstadoEntidad.ACTIVO.value
    db.commit()
    db.refresh(usuario)
    return usuario


def reset_password(db: Session, usuario_id: int, new_password: str) -> Usuario:
    usuario = _get_usuario(db, usuario_id)
    _validate_password(new_password)
    usuario.password_hash = hash_password(new_password)
    delete_sessions_for_user(db, usuario.id)
    db.commit()
    db.refresh(usuario)
    return usuario


def list_accounts(db: Session) -> list[Usuario]:
    return list(db.scalars(select(Usuario).order_by(Usuario.id)).all())


def get_account(db: Session, usuario_id: int) -> Usuario:
    return _get_usuario(db, usuario_id)


def get_role_name(db: Session, usuario_id: int, negocio_id: int) -> str | None:
    acceso = _get_acceso(db, usuario_id, negocio_id)
    if acceso is None:
        return None
    return acceso.rol.nombre
