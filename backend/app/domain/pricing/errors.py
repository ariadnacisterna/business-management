from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.models import Price


class PricingError(Exception):
    pass


class InvalidPriceAmount(PricingError):
    pass


class ProductHasNoPriceableVariants(PricingError):
    pass


class MissingExpectedPrice(PricingError):
    pass


class PriceConflict(PricingError):
    def __init__(self, current_price: "Price | None"):
        self.current_price = current_price
        super().__init__("El precio vigente cambio desde que se consulto por ultima vez")


class ProductPriceConflict(PricingError):
    def __init__(self, current_prices: dict[int, "Price | None"]):
        self.current_prices = current_prices
        super().__init__(
            "El precio vigente de una o mas variantes cambio desde que se consulto por ultima vez"
        )
