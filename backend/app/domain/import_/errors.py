from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.domain.import_.planning import ImportPlan


class CatalogImportError(Exception):
    pass


class UnsupportedFileType(CatalogImportError):
    pass


class InvalidFileEncoding(CatalogImportError):
    pass


class EmptyFile(CatalogImportError):
    pass


class MissingColumns(CatalogImportError):
    def __init__(self, missing: list[str]):
        self.missing = missing
        super().__init__(f"Faltan columnas obligatorias: {', '.join(missing)}")


class FileTooLarge(CatalogImportError):
    pass


class TooManyRows(CatalogImportError):
    pass


class ImportPlanHasErrors(CatalogImportError):
    def __init__(self, plan: "ImportPlan"):
        self.plan = plan
        super().__init__("La importacion tiene filas invalidas y no puede confirmarse")
