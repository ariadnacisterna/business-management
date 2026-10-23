class SalesError(Exception):
    pass


class InvalidSale(SalesError):
    pass


class SaleNotFound(SalesError):
    pass


class SaleAlreadyVoided(SalesError):
    pass
