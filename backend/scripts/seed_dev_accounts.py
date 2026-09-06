from sqlalchemy import select

from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE
from app.constants.status import EntityStatus
from app.core.config import get_settings
from app.db.models import Business, BusinessAccess, Role
from app.db.session import SessionLocal
from app.domain.access import accounts
from app.domain.access.errors import DuplicateUsername

TEST_PASSWORD = "1234"

PER_BUSINESS_ACCOUNTS = (
    ("empd", "Empleada despensa", EMPLEADO, "despensa"),
    ("empm", "Empleada merceria", EMPLEADO, "merceria"),
    ("gerd", "Gerenta despensa", GERENTE, "despensa"),
    ("germ", "Gerenta merceria", GERENTE, "merceria"),
    ("admind", "Administradora despensa", ADMINISTRADOR, "despensa"),
    ("adminm", "Administradora merceria", ADMINISTRADOR, "merceria"),
)


def main() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        businesses = {
            "merceria": db.scalars(
                select(Business).where(Business.name == settings.initial_business_name)
            ).first(),
            "despensa": db.scalars(
                select(Business).where(Business.name == settings.initial_business_2_name)
            ).first(),
        }

        for user_name, name, role_name, business_key in PER_BUSINESS_ACCOUNTS:
            business = businesses.get(business_key)
            if business is None:
                print(f"Saltando {user_name}: no existe el negocio '{business_key}'")
                continue
            try:
                accounts.create_account(db, business, name, user_name, TEST_PASSWORD, role_name)
                print(f"Creada cuenta {user_name} ({role_name}) en {business.name}")
            except DuplicateUsername:
                print(f"Ya existe la cuenta {user_name}, se omite")

        due_business = businesses["merceria"] or businesses["despensa"]
        if due_business is not None:
            try:
                due_account = accounts.create_account(
                    db, due_business, "Duena", "due", TEST_PASSWORD, DUENO
                )
                print(f"Creada cuenta due (Dueño) en {due_business.name}")
            except DuplicateUsername:
                due_account = None
                print("Ya existe la cuenta due, se omite el alta inicial")

            if due_account is not None:
                dueno_role = db.scalars(select(Role).where(Role.name == DUENO)).first()
                for business in businesses.values():
                    if business is None or business.id == due_business.id:
                        continue
                    existing = db.scalars(
                        select(BusinessAccess).where(
                            BusinessAccess.account_id == due_account.id,
                            BusinessAccess.business_id == business.id,
                        )
                    ).first()
                    if existing is None:
                        db.add(
                            BusinessAccess(
                                account_id=due_account.id,
                                business_id=business.id,
                                role_id=dueno_role.id,
                                status=EntityStatus.ACTIVE.value,
                            )
                        )
                        db.commit()
                        print(f"Otorgado acceso de due a {business.name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
