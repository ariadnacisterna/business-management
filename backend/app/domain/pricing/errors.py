class PricingError(Exception):
    pass


class InvalidPriceAmount(PricingError):
    pass


class ProductHasNoPriceableVariants(PricingError):
    pass
