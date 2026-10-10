from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants.roles import DUENO
from app.constants.status import EntityStatus
from app.db.models import Account, AccountSession, Business, BusinessAccess, Role
from app.domain.access.accounts import add_account, apply_password_reset
from app.domain.access.errors import AccessError


class EmergencyOwnerError(AccessError):
    pass


@dataclass(frozen=True)
class BusinessAccessChange:
    business_name: str
    current_role_name: str | None
    current_status: str | None

    @property
    def is_new(self) -> bool:
        return self.current_role_name is None

    @property
    def changes_role(self) -> bool:
        return self.current_role_name not in (None, DUENO)

    @property
    def reactivates(self) -> bool:
        return self.current_status not in (None, EntityStatus.ACTIVE.value)


@dataclass(frozen=True)
class EmergencyOwnerPlan:
    user_name: str
    account_name: str | None
    account_status: str | None
    business_changes: tuple[BusinessAccessChange, ...]
    open_session_count: int

    @property
    def creates_account(self) -> bool:
        return self.account_status is None

    @property
    def reactivates_account(self) -> bool:
        return self.account_status not in (None, EntityStatus.ACTIVE.value)


def _installation_businesses(db: Session) -> list[Business]:
    businesses = list(db.scalars(select(Business).order_by(Business.id)).all())
    if not businesses:
        raise EmergencyOwnerError("La base no tiene ningún negocio cargado.")
    if len({business.organization_id for business in businesses}) > 1:
        raise EmergencyOwnerError(
            "La base tiene negocios de más de una organización; el script no puede decidir solo."
        )
    return businesses


def _find_account(db: Session, user_name: str) -> Account | None:
    return db.scalars(select(Account).where(Account.user_name == user_name)).first()


def _accesses_by_business(db: Session, account_id: int) -> dict[int, BusinessAccess]:
    accesses = db.scalars(select(BusinessAccess).where(BusinessAccess.account_id == account_id))
    return {access.business_id: access for access in accesses}


def _owner_role(db: Session) -> Role:
    role = db.scalars(select(Role).where(Role.name == DUENO)).first()
    if role is None:
        raise EmergencyOwnerError(f"No existe el rol {DUENO} en la base.")
    return role


def plan_emergency_owner(db: Session, user_name: str) -> EmergencyOwnerPlan:
    businesses = _installation_businesses(db)
    account = _find_account(db, user_name)
    if account is None:
        return EmergencyOwnerPlan(
            user_name=user_name,
            account_name=None,
            account_status=None,
            business_changes=tuple(
                BusinessAccessChange(business.name, None, None) for business in businesses
            ),
            open_session_count=0,
        )

    accesses = _accesses_by_business(db, account.id)
    business_changes = []
    for business in businesses:
        access = accesses.get(business.id)
        business_changes.append(
            BusinessAccessChange(
                business.name,
                access.role.name if access is not None else None,
                access.status if access is not None else None,
            )
        )
    open_session_count = db.scalar(
        select(func.count())
        .select_from(AccountSession)
        .where(AccountSession.account_id == account.id)
    )
    return EmergencyOwnerPlan(
        user_name=user_name,
        account_name=account.name,
        account_status=account.status,
        business_changes=tuple(business_changes),
        open_session_count=open_session_count,
    )


def apply_emergency_owner(
    db: Session, user_name: str, new_password: str, new_account_name: str | None = None
) -> Account:
    businesses = _installation_businesses(db)
    owner_role = _owner_role(db)
    account = _find_account(db, user_name)
    if account is None:
        if new_account_name is None:
            raise EmergencyOwnerError("Falta el nombre para la cuenta nueva.")
        account = add_account(
            db, businesses[0], new_account_name, user_name, new_password, DUENO, DUENO
        )
    else:
        account.status = EntityStatus.ACTIVE.value
        apply_password_reset(db, account, new_password)

    accesses = _accesses_by_business(db, account.id)
    for business in businesses:
        access = accesses.get(business.id)
        if access is None:
            db.add(
                BusinessAccess(
                    account_id=account.id,
                    business_id=business.id,
                    role_id=owner_role.id,
                    status=EntityStatus.ACTIVE.value,
                )
            )
        else:
            access.role_id = owner_role.id
            access.status = EntityStatus.ACTIVE.value
    db.flush()
    return account
