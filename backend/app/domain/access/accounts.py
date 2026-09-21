import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.limits import (
    FONT_SIZE_DEFAULT,
    FONT_SIZE_MAX,
    FONT_SIZE_MIN,
    PASSWORD_MIN_LENGTH,
    USERNAME_MIN_LENGTH,
)
from app.constants.roles import INITIAL_ROLES, ROLE_RANK
from app.constants.status import EntityStatus
from app.core.security import hash_password, verify_password
from app.db.models import Account, Business, BusinessAccess, Role
from app.domain.access.errors import (
    AccountNotFound,
    DuplicateUsername,
    InsufficientRoleRank,
    InvalidAccountName,
    InvalidFontSize,
    InvalidPassword,
    InvalidRole,
    InvalidUsername,
    PasswordUnchanged,
    SelfActionForbidden,
    WrongCurrentPassword,
)
from app.domain.access.sessions import (
    delete_other_sessions_for_account,
    delete_sessions_for_account,
)

_PASSWORD_COMPLEXITY_PATTERN = re.compile(r"(?=.*[a-z])(?=.*[A-Z])(?=.*\d)")


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped:
        raise InvalidAccountName("El nombre no puede estar vacio")
    return stripped


def _validate_user_name(user_name: str) -> None:
    if len(user_name) < USERNAME_MIN_LENGTH:
        raise InvalidUsername(
            f"El nombre de usuario debe tener al menos {USERNAME_MIN_LENGTH} caracteres"
        )


def _validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise InvalidPassword(f"La contrasena debe tener al menos {PASSWORD_MIN_LENGTH} caracteres")
    if not _PASSWORD_COMPLEXITY_PATTERN.search(password):
        raise InvalidPassword(
            "La contrasena debe incluir al menos una mayuscula, una minuscula y un numero"
        )


def _get_role(db: Session, role_name: str) -> Role:
    if role_name not in INITIAL_ROLES:
        raise InvalidRole(f"Rol desconocido: {role_name}")
    role = db.scalars(select(Role).where(Role.name == role_name)).first()
    if role is None:
        raise InvalidRole(f"Rol desconocido: {role_name}")
    return role


def _get_account(db: Session, business_id: int, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise AccountNotFound
    if _get_business_access(db, account_id, business_id) is None:
        raise AccountNotFound
    return account


def _get_business_access(db: Session, account_id: int, business_id: int) -> BusinessAccess | None:
    return db.scalars(
        select(BusinessAccess).where(
            BusinessAccess.account_id == account_id,
            BusinessAccess.business_id == business_id,
        )
    ).first()


def _check_role_rank(role_name: str, actor_role_name: str) -> None:
    if ROLE_RANK[role_name] > ROLE_RANK[actor_role_name]:
        raise InsufficientRoleRank(
            f"No se puede asignar el rol {role_name}: supera el rango del actor"
        )


def create_account(
    db: Session,
    business: Business,
    name: str,
    user_name: str,
    initial_password: str,
    role_name: str,
    actor_role_name: str,
) -> Account:
    name = _validate_name(name)
    _validate_user_name(user_name)
    _validate_password(initial_password)
    role = _get_role(db, role_name)
    _check_role_rank(role_name, actor_role_name)

    existing_user = db.scalars(select(Account).where(Account.user_name == user_name)).first()
    if existing_user is not None:
        raise DuplicateUsername

    account = Account(
        organization_id=business.organization_id,
        name=name,
        user_name=user_name,
        password_hash=hash_password(initial_password),
        status=EntityStatus.ACTIVE.value,
        font_size=FONT_SIZE_DEFAULT,
    )
    db.add(account)
    db.flush()

    access = BusinessAccess(
        account_id=account.id,
        business_id=business.id,
        role_id=role.id,
        status=EntityStatus.ACTIVE.value,
    )
    db.add(access)
    db.commit()
    db.refresh(account)
    return account


def update_account(
    db: Session,
    business: Business,
    account_id: int,
    actor_id: int,
    actor_role_name: str,
    name: str | None = None,
    user_name: str | None = None,
    role_name: str | None = None,
) -> Account:
    account = _get_account(db, business.id, account_id)

    if role_name is not None and account_id == actor_id:
        raise SelfActionForbidden("No se puede cambiar el propio rol")

    if name is not None:
        account.name = _validate_name(name)

    if user_name is not None and user_name != account.user_name:
        _validate_user_name(user_name)
        existing_username = db.scalars(
            select(Account).where(Account.user_name == user_name, Account.id != account.id)
        ).first()
        if existing_username is not None:
            raise DuplicateUsername
        account.user_name = user_name

    if role_name is not None:
        role = _get_role(db, role_name)
        _check_role_rank(role_name, actor_role_name)
        access = _get_business_access(db, account.id, business.id)
        access.role_id = role.id

    db.commit()
    db.refresh(account)
    return account


def update_own_font_size(db: Session, account: Account, font_size: int) -> Account:
    if not FONT_SIZE_MIN <= font_size <= FONT_SIZE_MAX:
        raise InvalidFontSize(
            f"El tamano de letra debe estar entre {FONT_SIZE_MIN} y {FONT_SIZE_MAX}"
        )
    account.font_size = font_size
    db.commit()
    db.refresh(account)
    return account


def update_own_name(db: Session, account: Account, name: str) -> Account:
    account.name = _validate_name(name)
    db.commit()
    db.refresh(account)
    return account


def change_own_password(
    db: Session,
    account: Account,
    current_session_id: str,
    current_password: str,
    new_password: str,
) -> None:
    if not verify_password(current_password, account.password_hash):
        raise WrongCurrentPassword("La contraseña actual no es correcta")
    if new_password == current_password:
        raise PasswordUnchanged("La contraseña nueva debe ser distinta de la actual")
    _validate_password(new_password)
    account.password_hash = hash_password(new_password)
    delete_other_sessions_for_account(db, account.id, current_session_id)
    db.commit()


def deactivate_account(db: Session, business_id: int, account_id: int, actor_id: int) -> Account:
    if account_id == actor_id:
        raise SelfActionForbidden("No se puede desactivar la propia cuenta")
    account = _get_account(db, business_id, account_id)
    account.status = EntityStatus.INACTIVE.value
    delete_sessions_for_account(db, account.id)
    db.commit()
    db.refresh(account)
    return account


def activate_account(db: Session, business_id: int, account_id: int) -> Account:
    account = _get_account(db, business_id, account_id)
    account.status = EntityStatus.ACTIVE.value
    db.commit()
    db.refresh(account)
    return account


def reset_password(db: Session, business_id: int, account_id: int, new_password: str) -> Account:
    account = _get_account(db, business_id, account_id)
    _validate_password(new_password)
    account.password_hash = hash_password(new_password)
    delete_sessions_for_account(db, account.id)
    db.commit()
    db.refresh(account)
    return account


def list_accounts(db: Session, business_id: int) -> list[Account]:
    return list(
        db.scalars(
            select(Account)
            .join(BusinessAccess, BusinessAccess.account_id == Account.id)
            .where(
                BusinessAccess.business_id == business_id,
                BusinessAccess.status == EntityStatus.ACTIVE.value,
            )
            .order_by(Account.id)
        ).all()
    )


def list_accounts_for_businesses(db: Session, business_ids: list[int]) -> list[Account]:
    return list(
        db.scalars(
            select(Account)
            .join(BusinessAccess, BusinessAccess.account_id == Account.id)
            .where(
                BusinessAccess.business_id.in_(business_ids),
                BusinessAccess.status == EntityStatus.ACTIVE.value,
            )
            .distinct()
            .order_by(Account.id)
        ).all()
    )


def get_account(db: Session, business_id: int, account_id: int) -> Account:
    return _get_account(db, business_id, account_id)


def get_role_name(db: Session, account_id: int, business_id: int) -> str | None:
    access = _get_business_access(db, account_id, business_id)
    if access is None:
        return None
    return access.role.name


def get_primary_role_name(db: Session, account_id: int, preferred_business_id: int) -> str | None:
    access = _get_business_access(db, account_id, preferred_business_id)
    if access is None:
        access = db.scalars(
            select(BusinessAccess)
            .where(
                BusinessAccess.account_id == account_id,
                BusinessAccess.status == EntityStatus.ACTIVE.value,
            )
            .order_by(BusinessAccess.business_id)
        ).first()
    return access.role.name if access is not None else None
