from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.roles import ADMINISTRADOR, GERENTE
from app.db.models import Account, AttributeValue, Product, Variant
from app.db.session import get_db
from app.domain.access.permissions import get_current_user, require_csrf, require_role
from app.domain.catalog import attribute_values, attributes, categories, products, units
from app.domain.catalog.errors import (
    AttributeNotFound,
    AttributeValueNotFound,
    CategoryNotFound,
    DuplicateAttributeName,
    DuplicateAttributeValue,
    DuplicateCategoryName,
    DuplicateUnitName,
    ImplicitVariantNeedsLabel,
    InvalidAttributeValue,
    InvalidCatalogInput,
    ProductNotFound,
    UnitNotFound,
    VariantNotFound,
)
from app.domain.catalog.products import VariantInput

router = APIRouter()


class CategoryResponse(BaseModel):
    id: int
    name: str
    status: str


class CreateCategoryRequest(BaseModel):
    name: str


class UpdateCategoryRequest(BaseModel):
    name: str | None = None


class UnitResponse(BaseModel):
    id: int
    name: str
    abbreviation: str
    allows_fraction: bool
    status: str


class CreateUnitRequest(BaseModel):
    name: str
    abbreviation: str
    allows_fraction: bool = False


class UpdateUnitRequest(BaseModel):
    name: str | None = None
    abbreviation: str | None = None
    allows_fraction: bool | None = None


class AttributeResponse(BaseModel):
    id: int
    name: str
    status: str


class CreateAttributeRequest(BaseModel):
    name: str


class AttributeValueResponse(BaseModel):
    id: int
    attribute_id: int
    value: str
    status: str


class CreateAttributeValueRequest(BaseModel):
    value: str


class UpdateAttributeValueRequest(BaseModel):
    value: str


class VariantResponse(BaseModel):
    id: int
    product_id: int
    label: str | None
    is_implicit: bool
    status: str
    attribute_value_ids: list[int]


class VariantInputSchema(BaseModel):
    label: str | None = None
    attribute_value_ids: list[int] = []


class ProductResponse(BaseModel):
    id: int
    name: str
    category_id: int
    unit_id: int
    status: str
    variants: list[VariantResponse]


class CreateProductRequest(BaseModel):
    name: str
    category_id: int
    unit_id: int
    variants: list[VariantInputSchema] | None = None


class UpdateProductRequest(BaseModel):
    name: str | None = None
    category_id: int | None = None
    unit_id: int | None = None


class AddVariantRequest(BaseModel):
    label: str | None = None
    attribute_value_ids: list[int] = []


class UpdateVariantRequest(BaseModel):
    label: str | None = None
    attribute_value_ids: list[int] | None = None


class ProductCreationResponse(BaseModel):
    product: ProductResponse
    possible_duplicates: list[VariantResponse]


class VariantCreationResponse(BaseModel):
    variant: VariantResponse
    possible_duplicates: list[VariantResponse]


def _category_response(category) -> CategoryResponse:
    return CategoryResponse(id=category.id, name=category.name, status=category.status)


def _unit_response(unit) -> UnitResponse:
    return UnitResponse(
        id=unit.id,
        name=unit.name,
        abbreviation=unit.abbreviation,
        allows_fraction=unit.allows_fraction,
        status=unit.status,
    )


def _attribute_response(attribute) -> AttributeResponse:
    return AttributeResponse(id=attribute.id, name=attribute.name, status=attribute.status)


def _attribute_value_response(attribute_value: AttributeValue) -> AttributeValueResponse:
    return AttributeValueResponse(
        id=attribute_value.id,
        attribute_id=attribute_value.attribute_id,
        value=attribute_value.value,
        status=attribute_value.status,
    )


def _variant_response(variant: Variant) -> VariantResponse:
    return VariantResponse(
        id=variant.id,
        product_id=variant.product_id,
        label=variant.label,
        is_implicit=variant.is_implicit,
        status=variant.status,
        attribute_value_ids=[value.id for value in variant.attribute_values],
    )


def _product_response(product: Product) -> ProductResponse:
    return ProductResponse(
        id=product.id,
        name=product.name,
        category_id=product.category_id,
        unit_id=product.unit_id,
        status=product.status,
        variants=[_variant_response(variant) for variant in product.variants],
    )


def _organization_id(account: Account) -> int:
    return account.organization_id


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_category(
    payload: CreateCategoryRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> CategoryResponse:
    try:
        category = categories.create_category(db, _organization_id(_actor), payload.name, _actor.id)
    except DuplicateCategoryName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "La categoria ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _category_response(category)


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(
    db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> list[CategoryResponse]:
    return [
        _category_response(category)
        for category in categories.list_categories(db, _organization_id(_actor))
    ]


@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> CategoryResponse:
    try:
        category = categories.get_category(db, category_id)
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria no encontrada") from exc

    return _category_response(category)


@router.patch(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    dependencies=[Depends(require_csrf)],
)
def update_category(
    category_id: int,
    payload: UpdateCategoryRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> CategoryResponse:
    try:
        category = categories.update_category(db, category_id, _actor.id, name=payload.name)
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoria no encontrada") from exc
    except DuplicateCategoryName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "La categoria ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _category_response(category)


@router.post(
    "/units",
    response_model=UnitResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_unit(
    payload: CreateUnitRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> UnitResponse:
    try:
        unit = units.create_unit(
            db,
            _organization_id(_actor),
            payload.name,
            payload.abbreviation,
            _actor.id,
            allows_fraction=payload.allows_fraction,
        )
    except DuplicateUnitName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "La unidad ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _unit_response(unit)


@router.get("/units", response_model=list[UnitResponse])
def list_units(
    db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> list[UnitResponse]:
    return [_unit_response(unit) for unit in units.list_units(db, _organization_id(_actor))]


@router.get("/units/{unit_id}", response_model=UnitResponse)
def get_unit(
    unit_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> UnitResponse:
    try:
        unit = units.get_unit(db, unit_id)
    except UnitNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unidad no encontrada") from exc

    return _unit_response(unit)


@router.patch("/units/{unit_id}", response_model=UnitResponse, dependencies=[Depends(require_csrf)])
def update_unit(
    unit_id: int,
    payload: UpdateUnitRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> UnitResponse:
    try:
        unit = units.update_unit(
            db,
            unit_id,
            _actor.id,
            name=payload.name,
            abbreviation=payload.abbreviation,
            allows_fraction=payload.allows_fraction,
        )
    except UnitNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unidad no encontrada") from exc
    except DuplicateUnitName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "La unidad ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _unit_response(unit)


@router.post(
    "/attributes",
    response_model=AttributeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_attribute(
    payload: CreateAttributeRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> AttributeResponse:
    try:
        attribute = attributes.create_attribute(
            db, _organization_id(_actor), payload.name, _actor.id
        )
    except DuplicateAttributeName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "El atributo ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _attribute_response(attribute)


@router.get("/attributes", response_model=list[AttributeResponse])
def list_attributes(
    db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> list[AttributeResponse]:
    return [
        _attribute_response(attribute)
        for attribute in attributes.list_attributes(db, _organization_id(_actor))
    ]


@router.get("/attributes/{attribute_id}", response_model=AttributeResponse)
def get_attribute(
    attribute_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> AttributeResponse:
    try:
        attribute = attributes.get_attribute(db, attribute_id)
    except AttributeNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Atributo no encontrado") from exc

    return _attribute_response(attribute)


@router.post(
    "/attributes/{attribute_id}/values",
    response_model=AttributeValueResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_attribute_value(
    attribute_id: int,
    payload: CreateAttributeValueRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> AttributeValueResponse:
    try:
        attribute_value = attribute_values.create_attribute_value(
            db, attribute_id, payload.value, _actor.id
        )
    except AttributeNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Atributo no encontrado") from exc
    except DuplicateAttributeValue as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El valor ya existe para este atributo"
        ) from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _attribute_value_response(attribute_value)


@router.get("/attributes/{attribute_id}/values", response_model=list[AttributeValueResponse])
def list_attribute_values(
    attribute_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> list[AttributeValueResponse]:
    return [
        _attribute_value_response(value)
        for value in attribute_values.list_attribute_values(db, attribute_id)
    ]


@router.patch(
    "/attribute-values/{attribute_value_id}",
    response_model=AttributeValueResponse,
    dependencies=[Depends(require_csrf)],
)
def update_attribute_value(
    attribute_value_id: int,
    payload: UpdateAttributeValueRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> AttributeValueResponse:
    try:
        attribute_value = attribute_values.update_attribute_value(
            db, attribute_value_id, payload.value, _actor.id
        )
    except AttributeValueNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Valor de atributo no encontrado") from exc
    except DuplicateAttributeValue as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "El valor ya existe para este atributo"
        ) from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _attribute_value_response(attribute_value)


def _to_variant_inputs(payload: list[VariantInputSchema] | None) -> list[VariantInput] | None:
    if payload is None:
        return None
    return [
        VariantInput(label=item.label, attribute_value_ids=item.attribute_value_ids)
        for item in payload
    ]


@router.post(
    "/products",
    response_model=ProductCreationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_product(
    payload: CreateProductRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> ProductCreationResponse:
    try:
        product, _created_variants, duplicates = products.create_product(
            db,
            _organization_id(_actor),
            payload.category_id,
            payload.unit_id,
            payload.name,
            _actor.id,
            variants=_to_variant_inputs(payload.variants),
        )
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Categoria invalida") from exc
    except UnitNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unidad invalida") from exc
    except InvalidAttributeValue as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return ProductCreationResponse(
        product=_product_response(product),
        possible_duplicates=[_variant_response(variant) for variant in duplicates],
    )


@router.get("/products", response_model=list[ProductResponse])
def list_products(
    db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> list[ProductResponse]:
    organization_id = _organization_id(_actor)
    return [_product_response(product) for product in products.list_products(db, organization_id)]


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int, db: Session = Depends(get_db), _actor: Account = Depends(get_current_user)
) -> ProductResponse:
    try:
        product = products.get_product(db, product_id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc

    return _product_response(product)


@router.patch(
    "/products/{product_id}", response_model=ProductResponse, dependencies=[Depends(require_csrf)]
)
def update_product(
    product_id: int,
    payload: UpdateProductRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> ProductResponse:
    try:
        product = products.update_product(
            db,
            product_id,
            _actor.id,
            name=payload.name,
            category_id=payload.category_id,
            unit_id=payload.unit_id,
        )
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Categoria invalida") from exc
    except UnitNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unidad invalida") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _product_response(product)


@router.post(
    "/products/{product_id}/deactivate",
    response_model=ProductResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> ProductResponse:
    try:
        product = products.deactivate_product(db, product_id, _actor.id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc

    return _product_response(product)


@router.post(
    "/products/{product_id}/reactivate",
    response_model=ProductResponse,
    dependencies=[Depends(require_csrf)],
)
def reactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> ProductResponse:
    try:
        product = products.reactivate_product(db, product_id, _actor.id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc

    return _product_response(product)


@router.post(
    "/products/{product_id}/variants",
    response_model=VariantCreationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def add_variant(
    product_id: int,
    payload: AddVariantRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> VariantCreationResponse:
    try:
        variant, duplicates = products.add_variant(
            db,
            product_id,
            _actor.id,
            label=payload.label,
            attribute_value_ids=payload.attribute_value_ids,
        )
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except ImplicitVariantNeedsLabel as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except InvalidAttributeValue as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return VariantCreationResponse(
        variant=_variant_response(variant),
        possible_duplicates=[_variant_response(candidate) for candidate in duplicates],
    )


@router.post(
    "/variants/{variant_id}/deactivate",
    response_model=VariantResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_variant(
    variant_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> VariantResponse:
    try:
        variant = products.deactivate_variant(db, variant_id, _actor.id)
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc

    return _variant_response(variant)


@router.post(
    "/variants/{variant_id}/reactivate",
    response_model=VariantResponse,
    dependencies=[Depends(require_csrf)],
)
def reactivate_variant(
    variant_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> VariantResponse:
    try:
        variant = products.reactivate_variant(db, variant_id, _actor.id)
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc

    return _variant_response(variant)


@router.patch(
    "/variants/{variant_id}",
    response_model=VariantCreationResponse,
    dependencies=[Depends(require_csrf)],
)
def update_variant(
    variant_id: int,
    payload: UpdateVariantRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR, GERENTE)),
) -> VariantCreationResponse:
    try:
        variant, duplicates = products.update_variant(
            db,
            variant_id,
            _actor.id,
            label=payload.label,
            attribute_value_ids=payload.attribute_value_ids,
        )
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc
    except InvalidAttributeValue as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return VariantCreationResponse(
        variant=_variant_response(variant),
        possible_duplicates=[_variant_response(candidate) for candidate in duplicates],
    )
