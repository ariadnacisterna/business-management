from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.text import normalize_for_comparison
from app.db.models import ImportRun
from app.domain.catalog.attribute_values import _build_attribute_value
from app.domain.catalog.categories import _build_category
from app.domain.catalog.products import VariantInput, _add_variant_core, _create_product_core
from app.domain.catalog.units import _build_unit
from app.domain.import_.errors import ImportPlanHasErrors
from app.domain.import_.planning import GroupPlan, ImportPlan, RowPlan, analyze_import
from app.domain.pricing.prices import _apply_price_change, get_current_price_for_variant

DEFAULT_UNIT_ALLOWS_FRACTION = False


@dataclass
class ImportResult:
    import_run: ImportRun
    plan: ImportPlan


def _is_single_implicit_group(group: GroupPlan) -> bool:
    if len(group.rows) != 1:
        return False
    row = group.rows[0]
    return not row.variant_label and not row.attribute_pairs


class _ApplyContext:
    def __init__(self) -> None:
        self.category_ids: dict[str, int] = {}
        self.unit_ids: dict[str, int] = {}
        self.attribute_value_ids: dict[tuple[int, str], int] = {}
        self.created_categories = 0
        self.created_units = 0
        self.created_attribute_values = 0
        self.created_products = 0
        self.created_variants = 0
        self.updated_variants = 0


def _resolve_category_id(
    db: Session, organization_id: int, group: GroupPlan, actor_account_id: int, ctx: _ApplyContext
) -> int:
    if group.category_id is not None:
        return group.category_id
    key = normalize_for_comparison(group.category_name)
    if key not in ctx.category_ids:
        category = _build_category(db, organization_id, group.category_name, actor_account_id)
        ctx.category_ids[key] = category.id
        ctx.created_categories += 1
    return ctx.category_ids[key]


def _resolve_unit_id(
    db: Session, organization_id: int, group: GroupPlan, actor_account_id: int, ctx: _ApplyContext
) -> int:
    if group.unit_id is not None:
        return group.unit_id
    key = normalize_for_comparison(group.unit_name)
    if key not in ctx.unit_ids:
        unit = _build_unit(
            db,
            organization_id,
            group.unit_name,
            group.unit_name,
            actor_account_id,
            allows_fraction=DEFAULT_UNIT_ALLOWS_FRACTION,
        )
        ctx.unit_ids[key] = unit.id
        ctx.created_units += 1
    return ctx.unit_ids[key]


def _resolve_attribute_value_ids(
    db: Session, row: RowPlan, actor_account_id: int, ctx: _ApplyContext
) -> list[int]:
    created_ids = []
    for attribute_id, value in row.pending_attribute_values:
        key = (attribute_id, normalize_for_comparison(value))
        if key not in ctx.attribute_value_ids:
            attribute_value = _build_attribute_value(db, attribute_id, value, actor_account_id)
            ctx.attribute_value_ids[key] = attribute_value.id
            ctx.created_attribute_values += 1
        created_ids.append(ctx.attribute_value_ids[key])
    return [*row.attribute_value_ids, *created_ids]


def _apply_new_group(
    db: Session,
    organization_id: int,
    business_id: int,
    category_id: int,
    unit_id: int,
    group: GroupPlan,
    actor_account_id: int,
    now: datetime,
    ctx: _ApplyContext,
) -> None:
    for row in group.rows:
        row.attribute_value_ids = _resolve_attribute_value_ids(db, row, actor_account_id, ctx)

    if _is_single_implicit_group(group):
        variant_inputs = None
    else:
        variant_inputs = [
            VariantInput(label=row.variant_label, attribute_value_ids=row.attribute_value_ids)
            for row in group.rows
        ]

    _product, created_variants, _duplicates = _create_product_core(
        db,
        organization_id,
        category_id,
        unit_id,
        group.product_name,
        actor_account_id,
        variants=variant_inputs,
    )
    ctx.created_products += 1
    ctx.created_variants += len(created_variants)

    for row, variant in zip(group.rows, created_variants, strict=True):
        _apply_price_change(
            db, variant.id, business_id, row.price, actor_account_id, now, current_price=None
        )


def _apply_existing_group(
    db: Session,
    business_id: int,
    group: GroupPlan,
    actor_account_id: int,
    now: datetime,
    ctx: _ApplyContext,
) -> None:
    for row in group.rows:
        row.attribute_value_ids = _resolve_attribute_value_ids(db, row, actor_account_id, ctx)

        if row.existing_variant_id is not None:
            current_price = get_current_price_for_variant(db, row.existing_variant_id, business_id)
            if current_price is None or current_price.amount != row.price:
                _apply_price_change(
                    db,
                    row.existing_variant_id,
                    business_id,
                    row.price,
                    actor_account_id,
                    now,
                    current_price,
                )
                ctx.updated_variants += 1
            continue

        variant, _duplicates = _add_variant_core(
            db,
            group.existing_product_id,
            actor_account_id,
            label=row.variant_label,
            attribute_value_ids=row.attribute_value_ids,
        )
        ctx.created_variants += 1
        _apply_price_change(
            db, variant.id, business_id, row.price, actor_account_id, now, current_price=None
        )


def apply_import(
    db: Session,
    organization_id: int,
    business_id: int,
    filename: str,
    content: bytes,
    actor_account_id: int,
) -> ImportResult:
    plan = analyze_import(db, organization_id, business_id, filename, content)
    if plan.has_errors:
        raise ImportPlanHasErrors(plan)

    now = datetime.now(UTC)
    ctx = _ApplyContext()

    try:
        for group in plan.groups:
            category_id = _resolve_category_id(db, organization_id, group, actor_account_id, ctx)
            unit_id = _resolve_unit_id(db, organization_id, group, actor_account_id, ctx)

            if group.existing_product_id is None:
                _apply_new_group(
                    db,
                    organization_id,
                    business_id,
                    category_id,
                    unit_id,
                    group,
                    actor_account_id,
                    now,
                    ctx,
                )
            else:
                _apply_existing_group(db, business_id, group, actor_account_id, now, ctx)

        import_run = ImportRun(
            business_id=business_id,
            file_name=filename,
            row_count=len(plan.rows),
            created_categories_count=ctx.created_categories,
            created_units_count=ctx.created_units,
            created_attribute_values_count=ctx.created_attribute_values,
            created_products_count=ctx.created_products,
            created_variants_count=ctx.created_variants,
            updated_variants_count=ctx.updated_variants,
            created_by_account_id=actor_account_id,
            created_at=now,
        )
        db.add(import_run)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(import_run)
    return ImportResult(import_run=import_run, plan=plan)
