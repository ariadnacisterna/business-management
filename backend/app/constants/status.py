import enum


class EntityStatus(enum.StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ShortageStatus(enum.StrEnum):
    FALTANTE = "faltante"
    PEDIDO = "pedido"
    RECIBIDO = "recibido"


SHORTAGE_OPEN_STATUSES = (ShortageStatus.FALTANTE.value, ShortageStatus.PEDIDO.value)
