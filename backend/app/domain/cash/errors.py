class CashError(Exception):
    pass


class InvalidCashOperation(CashError):
    pass


class CashRegisterNotFound(CashError):
    pass


class CashRegisterAlreadyClosed(CashError):
    pass


class TransfersAlreadyClosed(CashError):
    pass


class CashRegisterNotClosed(CashError):
    pass
