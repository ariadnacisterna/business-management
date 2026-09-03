from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.roles import ADMINISTRADOR
from app.db.models import Account
from app.db.session import get_db
from app.domain.access.active_business import get_active_business
from app.domain.access.permissions import require_csrf, require_role
from app.domain.import_.applying import ImportResult, apply_import
from app.domain.import_.errors import (
    EmptyFile,
    FileTooLarge,
    ImportPlanHasErrors,
    InvalidFileEncoding,
    MissingColumns,
    TooManyRows,
    UnsupportedFileType,
)
from app.domain.import_.planning import ImportPlan, RowPlan, analyze_import

router = APIRouter(prefix="/imports")


class RowErrorSchema(BaseModel):
    field: str
    reason: str


class DuplicateMatchSchema(BaseModel):
    variant_id: int
    product_name: str
    variant_label: str | None


class ImportRowSchema(BaseModel):
    row_number: int
    outcome: str
    is_valid: bool
    category: str
    product_name: str
    unit: str
    variant_label: str | None
    price: Decimal | None
    current_price: Decimal | None
    errors: list[RowErrorSchema]
    warnings: list[str]
    possible_duplicates: list[DuplicateMatchSchema]


class AttributeValueCreationSchema(BaseModel):
    attribute_name: str
    value: str


class TaxonomyPreviewSchema(BaseModel):
    categories: list[str]
    units: list[str]
    attribute_values: list[AttributeValueCreationSchema]


class ImportSummarySchema(BaseModel):
    total_rows: int
    new_count: int
    update_count: int
    duplicate_count: int
    warning_count: int
    error_count: int
    can_confirm: bool


class ImportPreviewResponse(BaseModel):
    file_name: str
    summary: ImportSummarySchema
    taxonomy: TaxonomyPreviewSchema
    rows: list[ImportRowSchema]


class ImportRunSchema(BaseModel):
    id: int
    file_name: str
    row_count: int
    created_categories_count: int
    created_units_count: int
    created_attribute_values_count: int
    created_products_count: int
    created_variants_count: int
    updated_variants_count: int
    created_by_account_id: int
    created_at: datetime


class ImportConfirmResponse(BaseModel):
    import_run: ImportRunSchema
    summary: ImportSummarySchema


def _row_response(row: RowPlan) -> ImportRowSchema:
    return ImportRowSchema(
        row_number=row.row_number,
        outcome=row.outcome,
        is_valid=row.is_valid,
        category=row.category_name,
        product_name=row.product_name,
        unit=row.unit_name,
        variant_label=row.variant_label,
        price=row.price,
        current_price=row.current_price_amount,
        errors=[RowErrorSchema(field=error.field, reason=error.reason) for error in row.errors],
        warnings=list(row.warnings),
        possible_duplicates=[
            DuplicateMatchSchema(
                variant_id=match.variant_id,
                product_name=match.product_name,
                variant_label=match.variant_label,
            )
            for match in row.possible_duplicates
        ],
    )


def _summary_response(plan: ImportPlan) -> ImportSummarySchema:
    return ImportSummarySchema(
        total_rows=len(plan.rows),
        new_count=plan.new_count,
        update_count=plan.update_count,
        duplicate_count=plan.duplicate_count,
        warning_count=plan.warning_count,
        error_count=plan.error_count,
        can_confirm=not plan.has_errors,
    )


def _preview_response(plan: ImportPlan) -> ImportPreviewResponse:
    return ImportPreviewResponse(
        file_name=plan.file_name,
        summary=_summary_response(plan),
        taxonomy=TaxonomyPreviewSchema(
            categories=list(plan.taxonomy.categories),
            units=list(plan.taxonomy.units),
            attribute_values=[
                AttributeValueCreationSchema(attribute_name=name, value=value)
                for name, value in plan.taxonomy.attribute_values
            ],
        ),
        rows=[_row_response(row) for row in plan.rows],
    )


def _import_run_response(result: ImportResult) -> ImportRunSchema:
    run = result.import_run
    return ImportRunSchema(
        id=run.id,
        file_name=run.file_name,
        row_count=run.row_count,
        created_categories_count=run.created_categories_count,
        created_units_count=run.created_units_count,
        created_attribute_values_count=run.created_attribute_values_count,
        created_products_count=run.created_products_count,
        created_variants_count=run.created_variants_count,
        updated_variants_count=run.updated_variants_count,
        created_by_account_id=run.created_by_account_id,
        created_at=run.created_at,
    )


def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = file.filename or ""
    content = file.file.read()
    return filename, content


@router.post("/preview", response_model=ImportPreviewResponse)
def preview_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _actor: Account = Depends(require_role(ADMINISTRADOR)),
) -> ImportPreviewResponse:
    filename, content = _read_upload(file)
    business = get_active_business(db)

    try:
        plan = analyze_import(db, business.organization_id, business.id, filename, content)
    except FileTooLarge as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    except (
        UnsupportedFileType,
        MissingColumns,
        EmptyFile,
        TooManyRows,
        InvalidFileEncoding,
    ) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    return _preview_response(plan)


@router.post(
    "",
    response_model=ImportConfirmResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def confirm_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: Account = Depends(require_role(ADMINISTRADOR)),
) -> ImportConfirmResponse:
    filename, content = _read_upload(file)
    business = get_active_business(db)

    try:
        result = apply_import(
            db, business.organization_id, business.id, filename, content, actor.id
        )
    except FileTooLarge as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, str(exc)) from exc
    except (
        UnsupportedFileType,
        MissingColumns,
        EmptyFile,
        TooManyRows,
        InvalidFileEncoding,
    ) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ImportPlanHasErrors as exc:
        detail = _preview_response(exc.plan).model_dump(mode="json")
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail) from exc

    return ImportConfirmResponse(
        import_run=_import_run_response(result), summary=_summary_response(result.plan)
    )
