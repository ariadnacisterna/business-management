from sqlalchemy import CheckConstraint

from app.constants.estado import EstadoEntidad

ESTADO_CHECK_CONSTRAINT_NAME = "estado_valido"


def estado_check_constraint(name: str = ESTADO_CHECK_CONSTRAINT_NAME) -> CheckConstraint:
    valores_permitidos = ", ".join(f"'{estado.value}'" for estado in EstadoEntidad)
    return CheckConstraint(f"estado IN ({valores_permitidos})", name=name)
