from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.limits import PASSWORD_MIN_LENGTH, USERNAME_MIN_LENGTH
from app.constants.roles import INITIAL_ROLES
from app.constants.status import EntityStatus
from app.core.security import hash_password
from app.db.models import Account, Business, BusinessAccess, Role
from app.domain.access.errors import (
    AccountNotFound,
    DuplicateUsername,
    InvalidPassword,
    InvalidRole,
    InvalidUsername,
)
from app.domain.access.sessions import delete_sessions_for_account


def _validate_user_name(user_name: str) -> None:
    if len(user_name) < USERNAME_MIN_LENGTH:
        raise InvalidUsername(
            f"El nombre de usuario debe tener al menos {USERNAME_MIN_LENGTH} caracteres"
        )


def _validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise InvalidPassword(f"La contrasena debe tener al menos {PASSWORD_MIN_LENGTH} caracteres")


def _get_role(db: Session, role_name: str) -> Role:
    if role_name not in INITIAL_ROLES:
        raise InvalidRole(f"Rol desconocido: {role_name}")
    role = db.scalars(select(Role).where(Role.name == role_name)).first()
    if role is None:
        raise InvalidRole(f"Rol desconocido: {role_name}")
    return role


def _get_account(db: Session, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise AccountNotFound
    return account


def _get_business_access(db: Session, account_id: int, business_id: int) -> BusinessAccess | None:
    return db.scalars(
        select(BusinessAccess).where(
            BusinessAccess.account_id == account_id,
            BusinessAccess.business_id == business_id,
        )
    ).first()


def create_account(
    db: Session,
    business: Business,
    name: str,
    user_name: str,
    initial_password: str,
    role_name: str,
) -> Account:
    _validate_user_name(user_name)
    _validate_password(initial_password)
    role = _get_role(db, role_name)

    existing_user = db.scalars(select(Account).where(Account.user_name == user_name)).first()
    if existing_user is not None:
        raise DuplicateUsername

    account = Account(
        organization_id=business.organization_id,
        name=name,
        user_name=user_name,
        password_hash=hash_password(initial_password),
        status=EntityStatus.ACTIVE.value,
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
    name: str | None = None,
    user_name: str | None = None,
    role_name: str | None = None,
) -> Account:
    account = _get_account(db, account_id)

    if name is not None:
        account.name = name

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
        access = _get_business_access(db, account.id, business.id)
        if access is None:
            raise AccountNotFound
        access.role_id = role.id

    db.commit()
    db.refresh(account)
    return account


def deactivate_account(db: Session, account_id: int) -> Account:
    account = _get_account(db, account_id)
    account.status = EntityStatus.INACTIVE.value
    delete_sessions_for_account(db, account.id)
    db.commit()
    db.refresh(account)
    return account


def activate_account(db: Session, account_id: int) -> Account:
    account = _get_account(db, account_id)
    account.status = EntityStatus.ACTIVE.value
    db.commit()
    db.refresh(account)
    return account


def reset_password(db: Session, account_id: int, new_password: str) -> Account:
    account = _get_account(db, account_id)
    _validate_password(new_password)
    account.password_hash = hash_password(new_password)
    delete_sessions_for_account(db, account.id)
    db.commit()
    db.refresh(account)
    return account


def list_accounts(db: Session) -> list[Account]:
    return list(db.scalars(select(Account).order_by(Account.id)).all())


def get_account(db: Session, account_id: int) -> Account:
    return _get_account(db, account_id)


def get_role_name(db: Session, account_id: int, business_id: int) -> str | None:
    access = _get_business_access(db, account_id, business_id)
    if access is None:
        return None
    return access.role.name
