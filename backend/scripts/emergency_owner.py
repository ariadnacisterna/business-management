from getpass import getpass

from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.constants.roles import DUENO
from app.domain.access.emergency_owner import (
    BusinessAccessChange,
    EmergencyOwnerPlan,
    apply_emergency_owner,
    plan_emergency_owner,
)
from app.domain.access.errors import AccessError
from scripts.database_connection import (
    CONNECTION_PROMPT,
    DATABASE_FAILED_MESSAGE,
    NOTHING_CHANGED,
    connected_engine,
    sqlalchemy_connection_url,
)

CONFIRMATION_WORD = "si"
ACCEPTED_CONFIRMATIONS = (CONFIRMATION_WORD, "sí")


def ask_user_name() -> str:
    user_name = input("Nombre de usuario de la cuenta Dueño: ").strip()
    if not user_name:
        raise SystemExit("Falta el nombre de usuario. " + NOTHING_CHANGED)
    return user_name


def ask_new_account_name() -> str:
    return input("No existe esa cuenta. Nombre de la persona para la cuenta nueva: ").strip()


def ask_new_password() -> str:
    password = getpass("Contraseña nueva (no se ve al escribirla): ")
    repeated = getpass("Repetí la contraseña nueva: ")
    if password != repeated:
        raise SystemExit("Las contraseñas no coinciden. " + NOTHING_CHANGED)
    return password


def describe_business_change(change: BusinessAccessChange) -> str:
    if change.is_new:
        return f"Negocio {change.business_name}: se le da acceso con rol {DUENO}."
    updates = []
    if change.changes_role:
        updates.append(f"el rol pasa de {change.current_role_name} a {DUENO}")
    if change.reactivates:
        updates.append("el acceso estaba inactivo y se reactiva")
    if not updates:
        return f"Negocio {change.business_name}: ya tiene rol {DUENO}, no cambia."
    return f"Negocio {change.business_name}: " + " y ".join(updates) + "."


def describe_plan(plan: EmergencyOwnerPlan, new_account_name: str | None) -> list[str]:
    if plan.creates_account:
        lines = [
            f'Se va a CREAR la cuenta "{plan.user_name}" a nombre de "{new_account_name}", '
            f"activa y con rol {DUENO}.",
        ]
    else:
        lines = [f'Se va a usar la cuenta existente "{plan.user_name}" ({plan.account_name}).']
        if plan.reactivates_account:
            lines.append("La cuenta está inactiva: se REACTIVA.")
        else:
            lines.append("La cuenta ya está activa.")
    lines.extend(describe_business_change(change) for change in plan.business_changes)
    lines.append("La contraseña pasa a ser la que acabás de escribir.")
    if not plan.creates_account:
        lines.append(
            f"Se cierran todas sus sesiones abiertas ({plan.open_session_count} en este momento)."
        )
    return lines


def confirmed() -> bool:
    answer = input(f'Escribí "{CONFIRMATION_WORD}" para aplicar, o Enter para cancelar: ')
    return answer.strip().lower() in ACCEPTED_CONFIRMATIONS


def recover_owner_access(db: Session) -> None:
    user_name = ask_user_name()
    plan = plan_emergency_owner(db, user_name)
    new_account_name = ask_new_account_name() if plan.creates_account else None
    new_password = ask_new_password()
    apply_emergency_owner(db, user_name, new_password, new_account_name)

    print()
    print("Resumen:")
    for line in describe_plan(plan, new_account_name):
        print(f"  - {line}")
    print()
    if not confirmed():
        db.rollback()
        print("Cancelado. " + NOTHING_CHANGED)
        return
    db.commit()
    print(f'Listo. Ya podés iniciar sesión con la cuenta "{user_name}".')


def main() -> None:
    engine = connected_engine(sqlalchemy_connection_url(getpass(CONNECTION_PROMPT)))
    try:
        with Session(engine) as db:
            try:
                recover_owner_access(db)
            except AccessError as error:
                raise SystemExit(f"{error} {NOTHING_CHANGED}") from None
            except DBAPIError:
                raise SystemExit(DATABASE_FAILED_MESSAGE) from None
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
