from decimal import Decimal

from app.constants.limits import MAX_STOCK_QUANTITY, STOCK_QUANTITY_SCALE
from app.db.models import Product, Unit
from app.domain.catalog.errors import InvalidStockQuantity

STOCK_STEP = Decimal(1).scaleb(-STOCK_QUANTITY_SCALE)


def format_quantity(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def validate_quantity_for_unit(value: Decimal, unit: Unit, too_large_message: str) -> Decimal:
    if not value.is_finite() or abs(value) > MAX_STOCK_QUANTITY:
        raise InvalidStockQuantity(too_large_message)
    if unit.allows_fraction:
        if value != value.quantize(STOCK_STEP):
            raise InvalidStockQuantity(f"Usá como máximo {STOCK_QUANTITY_SCALE} decimales")
        return value.quantize(STOCK_STEP)
    if value != value.to_integral_value():
        raise InvalidStockQuantity("Esta unidad no admite decimales")
    return value.quantize(STOCK_STEP)


def format_stock_amount(quantity: Decimal, product: Product, unit: Unit) -> str:
    presentation_quantity = product.presentation_quantity
    if presentation_quantity is None:
        return format_quantity(quantity)
    whole = int(quantity // presentation_quantity)
    loose = quantity - whole * presentation_quantity
    parts = []
    if whole > 0:
        name = product.presentation_name if whole == 1 else product.presentation_plural_name
        parts.append(f"{whole} {name}")
    if loose > 0:
        parts.append(f"{format_quantity(loose)} {unit.abbreviation}")
    if not parts:
        return f"0 {product.presentation_plural_name}"
    return " y ".join(parts)
