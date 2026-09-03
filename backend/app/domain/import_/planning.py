from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.constants.import_ import (
    ATTRIBUTE_KEY_VALUE_SEPARATOR,
    ATTRIBUTE_PAIR_SEPARATOR,
    ATTRIBUTES_COLUMN,
    CATEGORY_COLUMN,
    PRICE_COLUMN,
    PRODUCT_NAME_COLUMN,
    UNIT_COLUMN,
    VARIANT_LABEL_COLUMN,
)
from app.constants.status import EntityStatus
from app.core.text import normalize_for_comparison
from app.db.models import Attribute, AttributeValue, Category, Product, Unit, Variant
from app.domain.catalog.attributes import list_attributes
from app.domain.catalog.categories import list_categories
from app.domain.catalog.products import find_possible_duplicates
from app.domain.catalog.units import list_units
from app.domain.import_.parsing import ParsedRow, parse_file
from app.domain.pricing.prices import get_current_price_for_variant


@dataclass
class RowError:
    field: str
    reason: str


@dataclass
class DuplicateMatch:
    variant_id: int
    product_name: str
    variant_label: str | None


@dataclass
class RowPlan:
    row_number: int
    category_name: str
    product_name: str
    unit_name: str
    variant_label: str | None
    price_raw: str
    attribute_pairs: list[tuple[str, str]]
    outcome: str = "new"
    price: Decimal | None = None
    errors: list[RowError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    possible_duplicates: list[DuplicateMatch] = field(default_factory=list)
    attribute_value_ids: list[int] = field(default_factory=list)
    pending_attribute_values: list[tuple[int, str]] = field(default_factory=list)
    existing_variant_id: int | None = None
    current_price_amount: Decimal | None = None

    @property
    def is_valid(self) -> bool:
        return not self.errors


@dataclass
class GroupPlan:
    category_name: str
    product_name: str
    unit_name: str
    is_new_category: bool
    is_new_unit: bool
    category_id: int | None
    unit_id: int | None
    existing_product_id: int | None
    rows: list[RowPlan]


@dataclass
class TaxonomyPlan:
    categories: list[str] = field(default_factory=list)
    units: list[str] = field(default_factory=list)
    attribute_values: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class ImportPlan:
    file_name: str
    rows: list[RowPlan]
    groups: list[GroupPlan]
    taxonomy: TaxonomyPlan

    @property
    def has_errors(self) -> bool:
        return any(not row.is_valid for row in self.rows)

    @property
    def new_count(self) -> int:
        return sum(1 for row in self.rows if row.is_valid and row.outcome == "new")

    @property
    def update_count(self) -> int:
        return sum(1 for row in self.rows if row.is_valid and row.outcome == "update")

    @property
    def duplicate_count(self) -> int:
        return sum(1 for row in self.rows if row.possible_duplicates)

    @property
    def warning_count(self) -> int:
        return sum(1 for row in self.rows if row.warnings)

    @property
    def error_count(self) -> int:
        return sum(1 for row in self.rows if not row.is_valid)


@dataclass
class _CatalogSnapshot:
    categories_by_name: dict[str, Category]
    units_by_name: dict[str, Unit]
    attributes_by_name: dict[str, Attribute]
    active_values_by_attribute: dict[int, dict[str, AttributeValue]]


def _load_snapshot(db: Session, organization_id: int) -> _CatalogSnapshot:
    categories = {
        normalize_for_comparison(category.name): category
        for category in list_categories(db, organization_id)
    }
    units = {normalize_for_comparison(unit.name): unit for unit in list_units(db, organization_id)}
    attributes = {
        normalize_for_comparison(attribute.name): attribute
        for attribute in list_attributes(db, organization_id)
    }
    active_values = {
        attribute.id: {
            value.normalized_value: value
            for value in attribute.values
            if value.status == EntityStatus.ACTIVE.value
        }
        for attribute in attributes.values()
    }
    return _CatalogSnapshot(categories, units, attributes, active_values)


def _parse_price(raw: str) -> tuple[Decimal | None, str | None]:
    if not raw:
        return None, "El precio es obligatorio"
    try:
        amount = Decimal(raw.replace(",", "."))
    except InvalidOperation:
        return None, f"'{raw}' no es un precio valido"
    if amount <= 0:
        return None, "El precio debe ser estrictamente mayor que cero"
    return amount, None


def _parse_attribute_pairs(raw: str) -> tuple[list[tuple[str, str]], str | None]:
    if not raw:
        return [], None

    pairs = []
    for chunk in raw.split(ATTRIBUTE_PAIR_SEPARATOR):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ATTRIBUTE_KEY_VALUE_SEPARATOR not in chunk:
            return [], f"'{chunk}' no tiene el formato atributo=valor"
        name, _, value = chunk.partition(ATTRIBUTE_KEY_VALUE_SEPARATOR)
        name, value = name.strip(), value.strip()
        if not name or not value:
            return [], f"'{chunk}' no tiene el formato atributo=valor"
        pairs.append((name, value))
    return pairs, None


def _build_row_plan(parsed: ParsedRow) -> RowPlan:
    values = parsed.values
    row = RowPlan(
        row_number=parsed.row_number,
        category_name=values[CATEGORY_COLUMN],
        product_name=values[PRODUCT_NAME_COLUMN],
        unit_name=values[UNIT_COLUMN],
        variant_label=values[VARIANT_LABEL_COLUMN] or None,
        price_raw=values[PRICE_COLUMN],
        attribute_pairs=[],
    )

    if not row.category_name:
        row.errors.append(RowError(CATEGORY_COLUMN, "La categoria es obligatoria"))
    if not row.product_name:
        row.errors.append(RowError(PRODUCT_NAME_COLUMN, "El nombre del producto es obligatorio"))
    if not row.unit_name:
        row.errors.append(RowError(UNIT_COLUMN, "La unidad es obligatoria"))

    price, price_error = _parse_price(row.price_raw)
    row.price = price
    if price_error:
        row.errors.append(RowError(PRICE_COLUMN, price_error))

    pairs, pairs_error = _parse_attribute_pairs(values[ATTRIBUTES_COLUMN])
    row.attribute_pairs = pairs
    if pairs_error:
        row.errors.append(RowError(ATTRIBUTES_COLUMN, pairs_error))

    return row


def _group_rows(rows: list[RowPlan]) -> list[list[RowPlan]]:
    groups: dict[tuple[str, str], list[RowPlan]] = {}
    order: list[tuple[str, str]] = []
    for row in rows:
        key = (
            normalize_for_comparison(row.category_name) if row.category_name else "",
            normalize_for_comparison(row.product_name) if row.product_name else "",
        )
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(row)
    return [groups[key] for key in order]


def _validate_unit_consistency(group_rows: list[RowPlan]) -> None:
    named = [row.unit_name for row in group_rows if row.unit_name]
    if not named:
        return
    canonical_norm = normalize_for_comparison(named[0])
    for row in group_rows:
        if row.unit_name and normalize_for_comparison(row.unit_name) != canonical_norm:
            row.errors.append(
                RowError(
                    UNIT_COLUMN, "Todas las filas del mismo producto deben usar la misma unidad"
                )
            )


def _validate_variant_labels(group_rows: list[RowPlan]) -> None:
    if len(group_rows) <= 1:
        return
    for row in group_rows:
        if not row.variant_label:
            row.errors.append(
                RowError(
                    VARIANT_LABEL_COLUMN,
                    "El nombre de variante es obligatorio cuando el producto agrupa mas de una "
                    "fila",
                )
            )


def _resolve_attributes(
    row: RowPlan,
    snapshot: _CatalogSnapshot,
    pending_attribute_values: dict[int, set[str]],
    taxonomy: TaxonomyPlan,
) -> tuple[list[int], list[tuple[int, str]], bool]:
    resolved_ids: list[int] = []
    identity_pairs: list[tuple[int, str]] = []
    has_new_attribute_value = False

    for attribute_name, value in row.attribute_pairs:
        attribute = snapshot.attributes_by_name.get(normalize_for_comparison(attribute_name))
        if attribute is None:
            row.errors.append(
                RowError(ATTRIBUTES_COLUMN, f"El atributo '{attribute_name}' no existe")
            )
            continue

        normalized_value = normalize_for_comparison(value)
        identity_pairs.append((attribute.id, normalized_value))
        existing_value = snapshot.active_values_by_attribute.get(attribute.id, {}).get(
            normalized_value
        )
        if existing_value is not None:
            resolved_ids.append(existing_value.id)
            continue

        has_new_attribute_value = True
        row.pending_attribute_values.append((attribute.id, value))
        row.warnings.append(f"Creara el valor '{value}' para el atributo '{attribute.name}'")
        if normalized_value not in pending_attribute_values.get(attribute.id, set()):
            pending_attribute_values.setdefault(attribute.id, set()).add(normalized_value)
            taxonomy.attribute_values.append((attribute.name, value))

    return resolved_ids, identity_pairs, has_new_attribute_value


def _check_repeated_identity(
    row: RowPlan, identity_pairs: list[tuple[int, str]], seen_identities: dict[tuple, int]
) -> None:
    label_norm = normalize_for_comparison(row.variant_label) if row.variant_label else ""
    identity_key = (
        normalize_for_comparison(row.category_name) if row.category_name else "",
        normalize_for_comparison(row.product_name) if row.product_name else "",
        label_norm,
        frozenset(identity_pairs),
    )
    earlier_row_number = seen_identities.get(identity_key)
    if earlier_row_number is not None:
        field_name = VARIANT_LABEL_COLUMN if row.variant_label else PRODUCT_NAME_COLUMN
        row.errors.append(
            RowError(field_name, f"Fila repetida: coincide con la fila {earlier_row_number}")
        )
    else:
        seen_identities[identity_key] = row.row_number


def _find_matching_variant(
    product: Product, label_norm: str, attribute_value_ids: set[int]
) -> Variant | None:
    for variant in product.variants:
        if variant.status != EntityStatus.ACTIVE.value:
            continue
        variant_label_norm = normalize_for_comparison(variant.label) if variant.label else ""
        if variant_label_norm != label_norm:
            continue
        if {value.id for value in variant.attribute_values} != attribute_value_ids:
            continue
        return variant
    return None


def _has_unlabeled_implicit_variant(product: Product) -> bool:
    return any(
        variant.is_implicit and variant.label is None
        for variant in product.variants
        if variant.status == EntityStatus.ACTIVE.value
    )


def _apply_possible_duplicates(db: Session, row: RowPlan, category_id: int) -> None:
    duplicates = find_possible_duplicates(
        db, category_id, row.product_name, row.variant_label, set(row.attribute_value_ids)
    )
    row.possible_duplicates = [
        DuplicateMatch(
            variant_id=candidate.id,
            product_name=candidate.product.name,
            variant_label=candidate.label,
        )
        for candidate in duplicates
    ]


def _resolve_row(
    db: Session,
    row: RowPlan,
    business_id: int,
    snapshot: _CatalogSnapshot,
    existing_product: Product | None,
    category: Category | None,
    is_new_category: bool,
    pending_attribute_values: dict[int, set[str]],
    taxonomy: TaxonomyPlan,
    seen_identities: dict[tuple, int],
) -> None:
    resolved_ids, identity_pairs, has_new_attribute_value = _resolve_attributes(
        row, snapshot, pending_attribute_values, taxonomy
    )
    row.attribute_value_ids = resolved_ids
    _check_repeated_identity(row, identity_pairs, seen_identities)

    label_norm = normalize_for_comparison(row.variant_label) if row.variant_label else ""
    match = None
    if existing_product is not None and not has_new_attribute_value:
        match = _find_matching_variant(existing_product, label_norm, set(resolved_ids))

    if match is not None:
        row.outcome = "update"
        row.existing_variant_id = match.id
        current_price = get_current_price_for_variant(db, match.id, business_id)
        if current_price is not None:
            row.current_price_amount = current_price.amount
        return

    row.outcome = "new"
    if existing_product is not None:
        row.warnings.append(f"Agregara una variante nueva al producto '{row.product_name}'")
        if _has_unlabeled_implicit_variant(existing_product):
            row.errors.append(
                RowError(
                    VARIANT_LABEL_COLUMN,
                    "El producto tiene una variante implicita sin nombre: debe nombrarse antes "
                    "de poder agregar otra variante",
                )
            )
    if category is not None and not is_new_category and not has_new_attribute_value:
        _apply_possible_duplicates(db, row, category.id)


def _process_group(
    db: Session,
    business_id: int,
    group_rows: list[RowPlan],
    snapshot: _CatalogSnapshot,
    pending_categories: set[str],
    pending_units: set[str],
    pending_attribute_values: dict[int, set[str]],
    taxonomy: TaxonomyPlan,
    seen_identities: dict[tuple, int],
) -> GroupPlan:
    first = group_rows[0]
    named_categories = [row.category_name for row in group_rows if row.category_name]
    canonical_category_name = named_categories[0] if named_categories else first.category_name
    category_norm = (
        normalize_for_comparison(canonical_category_name) if canonical_category_name else ""
    )

    category = snapshot.categories_by_name.get(category_norm)
    is_new_category = category is None and bool(category_norm)
    if is_new_category and category_norm not in pending_categories:
        pending_categories.add(category_norm)
        taxonomy.categories.append(canonical_category_name)

    _validate_unit_consistency(group_rows)
    named_units = [row.unit_name for row in group_rows if row.unit_name]
    canonical_unit_name = named_units[0] if named_units else first.unit_name
    unit_norm = normalize_for_comparison(canonical_unit_name) if canonical_unit_name else ""

    unit = snapshot.units_by_name.get(unit_norm)
    is_new_unit = unit is None and bool(unit_norm)
    if is_new_unit and unit_norm not in pending_units:
        pending_units.add(unit_norm)
        taxonomy.units.append(canonical_unit_name)

    existing_product = None
    named_products = [row.product_name for row in group_rows if row.product_name]
    if category is not None and named_products:
        product_name_norm = normalize_for_comparison(named_products[0])
        existing_product = next(
            (
                product
                for product in category.products
                if product.status == EntityStatus.ACTIVE.value
                and normalize_for_comparison(product.name) == product_name_norm
            ),
            None,
        )

    _validate_variant_labels(group_rows)

    for row in group_rows:
        if is_new_category:
            row.warnings.append(f"Creara la categoria '{canonical_category_name}'")
        if is_new_unit:
            row.warnings.append(f"Creara la unidad '{canonical_unit_name}'")
        _resolve_row(
            db,
            row,
            business_id,
            snapshot,
            existing_product,
            category,
            is_new_category,
            pending_attribute_values,
            taxonomy,
            seen_identities,
        )

    return GroupPlan(
        category_name=canonical_category_name,
        product_name=named_products[0] if named_products else first.product_name,
        unit_name=canonical_unit_name,
        is_new_category=is_new_category,
        is_new_unit=is_new_unit,
        category_id=category.id if category else None,
        unit_id=unit.id if unit else None,
        existing_product_id=existing_product.id if existing_product else None,
        rows=group_rows,
    )


def analyze_import(
    db: Session, organization_id: int, business_id: int, filename: str, content: bytes
) -> ImportPlan:
    parsed_rows = parse_file(filename, content)
    snapshot = _load_snapshot(db, organization_id)
    rows = [_build_row_plan(parsed) for parsed in parsed_rows]

    taxonomy = TaxonomyPlan()
    pending_categories: set[str] = set()
    pending_units: set[str] = set()
    pending_attribute_values: dict[int, set[str]] = {}
    seen_identities: dict[tuple, int] = {}

    groups = [
        _process_group(
            db,
            business_id,
            group_rows,
            snapshot,
            pending_categories,
            pending_units,
            pending_attribute_values,
            taxonomy,
            seen_identities,
        )
        for group_rows in _group_rows(rows)
    ]

    rows_sorted = sorted(rows, key=lambda row: row.row_number)
    return ImportPlan(file_name=filename, rows=rows_sorted, groups=groups, taxonomy=taxonomy)
