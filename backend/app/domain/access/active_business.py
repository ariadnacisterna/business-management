from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants.status import EntityStatus
from app.db.models import AccountSession, Business, BusinessAccess
from app.domain.access.errors import BusinessNotAccessible, NoBusinessAccess


def list_accessible_businesses(db: Session, account_id: int) -> list[Business]:
    return list(
        db.scalars(
            select(Business)
            .join(BusinessAccess, BusinessAccess.business_id == Business.id)
            .where(
                BusinessAccess.account_id == account_id,
                BusinessAccess.status == EntityStatus.ACTIVE.value,
                Business.status == EntityStatus.ACTIVE.value,
            )
            .order_by(Business.id)
        ).all()
    )


def resolve_active_business(
    db: Session, account_id: int, active_business_id: int | None
) -> Business:
    accessible = list_accessible_businesses(db, account_id)
    if not accessible:
        raise NoBusinessAccess

    if active_business_id is not None:
        for business in accessible:
            if business.id == active_business_id:
                return business

    return accessible[0]


def set_active_business(
    db: Session, account_id: int, session: AccountSession, business_id: int
) -> Business:
    accessible = list_accessible_businesses(db, account_id)
    business = next((candidate for candidate in accessible if candidate.id == business_id), None)
    if business is None:
        raise BusinessNotAccessible

    session.active_business_id = business.id
    db.commit()
    return business
