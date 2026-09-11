from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.roles import GERENTE
from app.constants.status import EntityStatus, ShortageStatus
from app.core.storage import StorageNotConfigured, StorageRequestFailed
from app.db.models import (
    Account,
    AttributeValue,
    Business,
    Price,
    Product,
    Provider,
    Shortage,
    Variant,
)
from app.db.session import get_db
from app.domain.access.permissions import (
    get_active_business,
    get_current_user,
    require_csrf,
    require_role,
)
from app.domain.catalog import (
    attribute_values,
    attributes,
    categories,
    products,
    providers,
    shortages,
    units,
)
from app.domain.catalog.errors import (
    AttributeNotFound,
    AttributeValueNotFound,
    CategoryNotFound,
    DuplicateAttributeName,
    DuplicateAttributeValue,
    DuplicateCategoryName,
    DuplicateOpenShortage,
    DuplicateProductName,
    DuplicateProviderName,
    DuplicateUnitName,
    DuplicateVariantInProduct,
    ImageTooLarge,
    ImplicitVariantNeedsLabel,
    InvalidAttributeValue,
    InvalidCatalogInput,
    InvalidImageType,
    InvalidShortageTransition,
    ProductNotFound,
    ProviderNotFound,
    ShortageNotFound,
    UnitNotFound,
    VariantLabelRequired,
    VariantNotFound,
)
from app.domain.catalog.product_images import remove_product_image, set_product_image
from app.domain.catalog.products import VariantInput
from app.domain.pricing.prices import get_current_prices_for_variants

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
    price_amount: Decimal | None = None


class VariantInputSchema(BaseModel):
    label: str | None = None
    attribute_value_ids: list[int] = []


class ProductResponse(BaseModel):
    id: int
    name: str
    category_id: int
    unit_id: int
    provider_id: int | None
    status: str
    image_url: str | None
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


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int
    page_size: int


class ProductCreationResponse(BaseModel):
    product: ProductResponse
    possible_duplicates: list[VariantResponse]


class VariantCreationResponse(BaseModel):
    variant: VariantResponse
    possible_duplicates: list[VariantResponse]


class ProviderResponse(BaseModel):
    id: int
    name: str
    contact_name: str | None
    email: str | None
    phone: str | None
    last_purchase_at: date | None
    status: str
    category_ids: list[int]


class CreateProviderRequest(BaseModel):
    name: str
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    category_ids: list[int] = []


class UpdateProviderRequest(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    last_purchase_at: date | None = None


class SetProviderCategoriesRequest(BaseModel):
    category_ids: list[int]


class SetProductProviderRequest(BaseModel):
    provider_id: int | None


class ShortageResponse(BaseModel):
    id: int
    variant_id: int
    product_id: int
    product_name: str
    category_id: int
    provider_id: int | None
    status: str
    created_at: str
    created_by_account_id: int


class CreateShortageRequest(BaseModel):
    variant_id: int


class ChangeShortageStatusRequest(BaseModel):
    status: str


class ShortageCountResponse(BaseModel):
    count: int


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


def _variant_response(
    variant: Variant, current_prices: dict[int, Price] | None = None
) -> VariantResponse:
    current_price = (current_prices or {}).get(variant.id)
    return VariantResponse(
        id=variant.id,
        product_id=variant.product_id,
        label=variant.label,
        is_implicit=variant.is_implicit,
        status=variant.status,
        attribute_value_ids=[value.id for value in variant.attribute_values],
        price_amount=current_price.amount if current_price is not None else None,
    )


def _product_response(
    product: Product, current_prices: dict[int, Price] | None = None
) -> ProductResponse:
    return ProductResponse(
        id=product.id,
        name=product.name,
        category_id=product.category_id,
        unit_id=product.unit_id,
        provider_id=product.provider_id,
        status=product.status,
        image_url=product.image_url,
        variants=[_variant_response(variant, current_prices) for variant in product.variants],
    )


def _provider_response(provider: Provider) -> ProviderResponse:
    return ProviderResponse(
        id=provider.id,
        name=provider.name,
        contact_name=provider.contact_name,
        email=provider.email,
        phone=provider.phone,
        last_purchase_at=provider.last_purchase_at,
        status=provider.status,
        category_ids=[category.id for category in provider.categories],
    )


def _shortage_response(shortage: Shortage) -> ShortageResponse:
    product = shortage.variant.product
    return ShortageResponse(
        id=shortage.id,
        variant_id=shortage.variant_id,
        product_id=product.id,
        product_name=product.name,
        category_id=product.category_id,
        provider_id=product.provider_id,
        status=shortage.status,
        created_at=shortage.created_at.isoformat(),
        created_by_account_id=shortage.created_by_account_id,
    )


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_category(
    payload: CreateCategoryRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> CategoryResponse:
    try:
        category = categories.create_category(db, business.id, payload.name, _actor.id)
    except DuplicateCategoryName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "La categoria ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _category_response(category)


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[CategoryResponse]:
    return [
        _category_response(category) for category in categories.list_categories(db, business.id)
    ]


@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> CategoryResponse:
    try:
        category = categories.get_category(db, business.id, category_id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> CategoryResponse:
    try:
        category = categories.update_category(
            db, business.id, category_id, _actor.id, name=payload.name
        )
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> UnitResponse:
    try:
        unit = units.create_unit(
            db,
            business.id,
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
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[UnitResponse]:
    return [_unit_response(unit) for unit in units.list_units(db, business.id)]


@router.get("/units/{unit_id}", response_model=UnitResponse)
def get_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> UnitResponse:
    try:
        unit = units.get_unit(db, business.id, unit_id)
    except UnitNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unidad no encontrada") from exc

    return _unit_response(unit)


@router.patch("/units/{unit_id}", response_model=UnitResponse, dependencies=[Depends(require_csrf)])
def update_unit(
    unit_id: int,
    payload: UpdateUnitRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> UnitResponse:
    try:
        unit = units.update_unit(
            db,
            business.id,
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> AttributeResponse:
    try:
        attribute = attributes.create_attribute(db, business.id, payload.name, _actor.id)
    except DuplicateAttributeName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "El atributo ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _attribute_response(attribute)


@router.get("/attributes", response_model=list[AttributeResponse])
def list_attributes(
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[AttributeResponse]:
    return [
        _attribute_response(attribute) for attribute in attributes.list_attributes(db, business.id)
    ]


@router.get("/attributes/{attribute_id}", response_model=AttributeResponse)
def get_attribute(
    attribute_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> AttributeResponse:
    try:
        attribute = attributes.get_attribute(db, business.id, attribute_id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> AttributeValueResponse:
    try:
        attribute_value = attribute_values.create_attribute_value(
            db, business.id, attribute_id, payload.value, _actor.id
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
    attribute_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[AttributeValueResponse]:
    try:
        values = attribute_values.list_attribute_values(db, business.id, attribute_id)
    except AttributeNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Atributo no encontrado") from exc

    return [_attribute_value_response(value) for value in values]


@router.patch(
    "/attribute-values/{attribute_value_id}",
    response_model=AttributeValueResponse,
    dependencies=[Depends(require_csrf)],
)
def update_attribute_value(
    attribute_value_id: int,
    payload: UpdateAttributeValueRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> AttributeValueResponse:
    try:
        attribute_value = attribute_values.update_attribute_value(
            db, business.id, attribute_value_id, payload.value, _actor.id
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


@router.post(
    "/attribute-values/{attribute_value_id}/deactivate",
    response_model=AttributeValueResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_attribute_value(
    attribute_value_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> AttributeValueResponse:
    try:
        attribute_value = attribute_values.deactivate_attribute_value(
            db, business.id, attribute_value_id, _actor.id
        )
    except AttributeValueNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Valor de atributo no encontrado") from exc

    return _attribute_value_response(attribute_value)


@router.post(
    "/attribute-values/{attribute_value_id}/reactivate",
    response_model=AttributeValueResponse,
    dependencies=[Depends(require_csrf)],
)
def reactivate_attribute_value(
    attribute_value_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> AttributeValueResponse:
    try:
        attribute_value = attribute_values.reactivate_attribute_value(
            db, business.id, attribute_value_id, _actor.id
        )
    except AttributeValueNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Valor de atributo no encontrado") from exc

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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductCreationResponse:
    try:
        product, _created_variants, duplicates = products.create_product(
            db,
            business.id,
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
    except (InvalidCatalogInput, VariantLabelRequired) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except DuplicateProductName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un producto con ese nombre.") from exc
    except DuplicateVariantInProduct as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    return ProductCreationResponse(
        product=_product_response(product),
        possible_duplicates=[_variant_response(variant) for variant in duplicates],
    )


ALLOWED_PAGE_SIZES = (10, 25, 50)


@router.get("/products", response_model=ProductListResponse)
def list_products(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None),
    category_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> ProductListResponse:
    paginate = page is not None or page_size is not None
    if paginate:
        page = page or 1
        page_size = page_size or 25
        if page_size not in ALLOWED_PAGE_SIZES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "page_size invalido")
    if status_filter is not None and status_filter not in (
        EntityStatus.ACTIVE.value,
        EntityStatus.INACTIVE.value,
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status invalido")

    product_list, total = products.list_products(
        db,
        business.id,
        page,
        page_size,
        category_id=category_id,
        status=status_filter,
        search=search,
    )
    variant_ids = [variant.id for product in product_list for variant in product.variants]
    current_prices = get_current_prices_for_variants(db, variant_ids, business.id)
    return ProductListResponse(
        items=[_product_response(product, current_prices) for product in product_list],
        total=total,
        page=page or 1,
        page_size=page_size or total,
    )


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    try:
        product = products.get_product(db, business.id, product_id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    try:
        product = products.update_product(
            db,
            business.id,
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
    except DuplicateProductName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un producto con ese nombre.") from exc

    return _product_response(product)


@router.post(
    "/products/{product_id}/deactivate",
    response_model=ProductResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    try:
        product = products.deactivate_product(db, business.id, product_id, _actor.id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    try:
        product = products.reactivate_product(db, business.id, product_id, _actor.id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> VariantCreationResponse:
    try:
        variant, duplicates = products.add_variant(
            db,
            business.id,
            product_id,
            _actor.id,
            label=payload.label,
            attribute_value_ids=payload.attribute_value_ids,
        )
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except (ImplicitVariantNeedsLabel, VariantLabelRequired) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except InvalidAttributeValue as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except DuplicateVariantInProduct as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> VariantResponse:
    try:
        variant = products.deactivate_variant(db, business.id, variant_id, _actor.id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> VariantResponse:
    try:
        variant = products.reactivate_variant(db, business.id, variant_id, _actor.id)
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
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> VariantCreationResponse:
    try:
        variant, duplicates = products.update_variant(
            db,
            business.id,
            variant_id,
            _actor.id,
            label=payload.label,
            attribute_value_ids=payload.attribute_value_ids,
        )
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc
    except InvalidAttributeValue as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except VariantLabelRequired as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except DuplicateVariantInProduct as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    return VariantCreationResponse(
        variant=_variant_response(variant),
        possible_duplicates=[_variant_response(candidate) for candidate in duplicates],
    )


@router.post(
    "/products/{product_id}/image",
    response_model=ProductResponse,
    dependencies=[Depends(require_csrf)],
)
def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    content = file.file.read()
    content_type = file.content_type or ""

    try:
        product = set_product_image(db, business.id, product_id, _actor.id, content, content_type)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except (InvalidImageType, ImageTooLarge) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except StorageNotConfigured as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "El almacenamiento de imagenes no esta configurado"
        ) from exc
    except StorageRequestFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo subir la imagen") from exc

    return _product_response(product)


@router.delete(
    "/products/{product_id}/image",
    response_model=ProductResponse,
    dependencies=[Depends(require_csrf)],
)
def delete_product_image(
    product_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    try:
        product = remove_product_image(db, business.id, product_id, _actor.id)
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except StorageNotConfigured as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "El almacenamiento de imagenes no esta configurado"
        ) from exc
    except StorageRequestFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo eliminar la imagen") from exc

    return _product_response(product)


@router.post(
    "/providers",
    response_model=ProviderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_provider(
    payload: CreateProviderRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProviderResponse:
    try:
        provider = providers.create_provider(
            db,
            business.id,
            payload.name,
            _actor.id,
            contact_name=payload.contact_name,
            email=payload.email,
            phone=payload.phone,
            category_ids=payload.category_ids,
        )
    except DuplicateProviderName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "El proveedor ya existe") from exc
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Categoria invalida") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _provider_response(provider)


@router.get("/providers", response_model=list[ProviderResponse])
def list_providers(
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[ProviderResponse]:
    return [_provider_response(provider) for provider in providers.list_providers(db, business.id)]


@router.get("/providers/{provider_id}", response_model=ProviderResponse)
def get_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> ProviderResponse:
    try:
        provider = providers.get_provider(db, business.id, provider_id)
    except ProviderNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado") from exc

    return _provider_response(provider)


@router.patch(
    "/providers/{provider_id}",
    response_model=ProviderResponse,
    dependencies=[Depends(require_csrf)],
)
def update_provider(
    provider_id: int,
    payload: UpdateProviderRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProviderResponse:
    try:
        provider = providers.update_provider(
            db,
            business.id,
            provider_id,
            _actor.id,
            name=payload.name,
            contact_name=payload.contact_name,
            email=payload.email,
            phone=payload.phone,
            last_purchase_at=payload.last_purchase_at,
        )
    except ProviderNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado") from exc
    except DuplicateProviderName as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "El proveedor ya existe") from exc
    except InvalidCatalogInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _provider_response(provider)


@router.put(
    "/providers/{provider_id}/categories",
    response_model=ProviderResponse,
    dependencies=[Depends(require_csrf)],
)
def set_provider_categories(
    provider_id: int,
    payload: SetProviderCategoriesRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProviderResponse:
    try:
        provider = providers.set_provider_categories(
            db, business.id, provider_id, _actor.id, payload.category_ids
        )
    except ProviderNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado") from exc
    except CategoryNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Categoria invalida") from exc

    return _provider_response(provider)


@router.post(
    "/providers/{provider_id}/deactivate",
    response_model=ProviderResponse,
    dependencies=[Depends(require_csrf)],
)
def deactivate_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProviderResponse:
    try:
        provider = providers.deactivate_provider(db, business.id, provider_id, _actor.id)
    except ProviderNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado") from exc

    return _provider_response(provider)


@router.post(
    "/providers/{provider_id}/reactivate",
    response_model=ProviderResponse,
    dependencies=[Depends(require_csrf)],
)
def reactivate_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProviderResponse:
    try:
        provider = providers.reactivate_provider(db, business.id, provider_id, _actor.id)
    except ProviderNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proveedor no encontrado") from exc

    return _provider_response(provider)


@router.put(
    "/products/{product_id}/provider",
    response_model=ProductResponse,
    dependencies=[Depends(require_csrf)],
)
def set_product_provider(
    product_id: int,
    payload: SetProductProviderRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(GERENTE)),
    business: Business = Depends(get_active_business),
) -> ProductResponse:
    try:
        product = products.set_product_provider(
            db, business.id, product_id, _actor.id, payload.provider_id
        )
    except ProductNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado") from exc
    except ProviderNotFound as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Proveedor invalido") from exc

    return _product_response(product)


@router.post(
    "/shortages",
    response_model=ShortageResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_shortage(
    payload: CreateShortageRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> ShortageResponse:
    try:
        shortage = shortages.create_shortage(db, business.id, payload.variant_id, _actor.id)
    except VariantNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante no encontrada") from exc
    except DuplicateOpenShortage as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "La variante ya tiene un faltante abierto"
        ) from exc

    return _shortage_response(shortage)


@router.get("/shortages", response_model=list[ShortageResponse])
def list_shortages(
    status_filter: str | None = Query(default=None, alias="status"),
    provider_id: int | None = None,
    category_id: int | None = None,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> list[ShortageResponse]:
    if status_filter is not None and status_filter not in (
        ShortageStatus.FALTANTE.value,
        ShortageStatus.PEDIDO.value,
        ShortageStatus.RECIBIDO.value,
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status invalido")

    shortage_list = shortages.list_shortages(
        db, business.id, status=status_filter, provider_id=provider_id, category_id=category_id
    )
    return [_shortage_response(shortage) for shortage in shortage_list]


@router.get("/shortages/count", response_model=ShortageCountResponse)
def count_shortages(
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> ShortageCountResponse:
    return ShortageCountResponse(count=shortages.count_open_shortages(db, business.id))


@router.patch(
    "/shortages/{shortage_id}",
    response_model=ShortageResponse,
    dependencies=[Depends(require_csrf)],
)
def change_shortage_status(
    shortage_id: int,
    payload: ChangeShortageStatusRequest,
    db: Session = Depends(get_db),
    _actor: Account = Depends(get_current_user),
    business: Business = Depends(get_active_business),
) -> ShortageResponse:
    if payload.status not in (
        ShortageStatus.FALTANTE.value,
        ShortageStatus.PEDIDO.value,
        ShortageStatus.RECIBIDO.value,
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status invalido")

    try:
        shortage = shortages.change_shortage_status(
            db, business.id, shortage_id, _actor.id, payload.status
        )
    except ShortageNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Faltante no encontrado") from exc
    except InvalidShortageTransition as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Transicion de estado invalida") from exc

    return _shortage_response(shortage)
