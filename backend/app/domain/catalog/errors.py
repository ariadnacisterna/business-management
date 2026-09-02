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


class VariantNotFound(CatalogError):
    pass
