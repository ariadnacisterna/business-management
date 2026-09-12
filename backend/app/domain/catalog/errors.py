class CatalogError(Exception):
    pass


class InvalidCatalogInput(CatalogError):
    pass


class CategoryNotFound(CatalogError):
    pass


class DuplicateCategoryName(CatalogError):
    pass


class UnitNotFound(CatalogError):
    pass


class DuplicateUnitName(CatalogError):
    pass


class AttributeNotFound(CatalogError):
    pass


class DuplicateAttributeName(CatalogError):
    pass


class AttributeValueNotFound(CatalogError):
    pass


class DuplicateAttributeValue(CatalogError):
    pass


class InvalidAttributeValue(CatalogError):
    pass


class ProductNotFound(CatalogError):
    pass


class DuplicateProductName(CatalogError):
    pass


class VariantNotFound(CatalogError):
    pass


class ImplicitVariantNeedsLabel(CatalogError):
    pass


class VariantLabelRequired(CatalogError):
    pass


class DuplicateVariantInProduct(CatalogError):
    pass


class InvalidImageType(CatalogError):
    pass


class ImageTooLarge(CatalogError):
    pass


class ProviderNotFound(CatalogError):
    pass


class DuplicateProviderName(CatalogError):
    pass


class ShortageNotFound(CatalogError):
    pass


class DuplicateOpenShortage(CatalogError):
    pass


class InvalidShortageTransition(CatalogError):
    pass


class CustomerNotFound(CatalogError):
    pass


class DuplicateCustomerName(CatalogError):
    pass


class InvalidCreditType(CatalogError):
    pass


class InvalidCreditAmount(CatalogError):
    pass


class MovementReasonNotFound(CatalogError):
    pass


class DuplicateMovementReasonName(CatalogError):
    pass


class InactiveMovementReason(CatalogError):
    pass


class InvalidStockQuantity(CatalogError):
    pass
