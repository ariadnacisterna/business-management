"""add decimal stock quantities

Revision ID: b9457223ee69
Revises: d3f7a1b5c9e2
Create Date: 2026-09-22 13:29:19.443159

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b9457223ee69"
down_revision: str | None = "d3f7a1b5c9e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STOCK_QUANTITY_PRECISION = 13
STOCK_QUANTITY_SCALE = 3


def upgrade() -> None:
    op.alter_column(
        "variant",
        "quantity",
        type_=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_type=sa.Integer(),
        existing_nullable=False,
        postgresql_using=f"quantity::numeric({STOCK_QUANTITY_PRECISION},{STOCK_QUANTITY_SCALE})",
    )
    op.alter_column(
        "variant",
        "minimum_quantity",
        type_=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_type=sa.Integer(),
        existing_nullable=True,
        postgresql_using=(
            f"minimum_quantity::numeric({STOCK_QUANTITY_PRECISION},{STOCK_QUANTITY_SCALE})"
        ),
    )
    op.alter_column(
        "stock_movement",
        "quantity_before",
        type_=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_type=sa.Integer(),
        existing_nullable=False,
        postgresql_using=(
            f"quantity_before::numeric({STOCK_QUANTITY_PRECISION},{STOCK_QUANTITY_SCALE})"
        ),
    )
    op.alter_column(
        "stock_movement",
        "quantity_after",
        type_=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_type=sa.Integer(),
        existing_nullable=False,
        postgresql_using=(
            f"quantity_after::numeric({STOCK_QUANTITY_PRECISION},{STOCK_QUANTITY_SCALE})"
        ),
    )


def downgrade() -> None:
    op.alter_column(
        "stock_movement",
        "quantity_after",
        type_=sa.Integer(),
        existing_type=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_nullable=False,
        postgresql_using="round(quantity_after)::integer",
    )
    op.alter_column(
        "stock_movement",
        "quantity_before",
        type_=sa.Integer(),
        existing_type=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_nullable=False,
        postgresql_using="round(quantity_before)::integer",
    )
    op.alter_column(
        "variant",
        "minimum_quantity",
        type_=sa.Integer(),
        existing_type=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_nullable=True,
        postgresql_using="round(minimum_quantity)::integer",
    )
    op.alter_column(
        "variant",
        "quantity",
        type_=sa.Integer(),
        existing_type=sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        existing_nullable=False,
        postgresql_using="round(quantity)::integer",
    )
