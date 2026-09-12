import enum


class EntityStatus(enum.StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ShortageStatus(enum.StrEnum):
    FALTANTE = "faltante"
    PEDIDO = "pedido"
    RECIBIDO = "recibido"


SHORTAGE_OPEN_STATUSES = (ShortageStatus.FALTANTE.value, ShortageStatus.PEDIDO.value)


class CreditType(enum.StrEnum):
    CARGO = "cargo"
    PAGO = "pago"


class StockStatus(enum.StrEnum):
    SIN_STOCK = "sin_stock"
    STOCK_BAJO = "stock_bajo"
    NORMAL = "normal"
