"""add product presentation

Revision ID: a8e4c2f6d1b3
Revises: f3b8d2a6c1e9
Create Date: 2026-10-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a8e4c2f6d1b3"
down_revision: str | None = "f3b8d2a6c1e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRESENTATION_NAME_MAX_LENGTH = 50
STOCK_QUANTITY_PRECISION = 13
STOCK_QUANTITY_SCALE = 3


def upgrade() -> None:
    op.add_column(
        "product",
        sa.Column(
            "presentation_name", sa.String(length=PRESENTATION_NAME_MAX_LENGTH), nullable=True
        ),
    )
    op.add_column(
        "product",
        sa.Column(
            "presentation_plural_name",
            sa.String(length=PRESENTATION_NAME_MAX_LENGTH),
            nullable=True,
        ),
    )
    op.add_column(
        "product",
        sa.Column(
            "presentation_quantity",
            sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        op.f("ck_product_presentation_complete"),
        "product",
        "(presentation_name IS NULL AND presentation_plural_name IS NULL "
        "AND presentation_quantity IS NULL) OR (presentation_name IS NOT NULL "
        "AND presentation_plural_name IS NOT NULL AND presentation_quantity IS NOT NULL)",
    )
    op.create_check_constraint(
        op.f("ck_product_presentation_quantity_positive"),
        "product",
        "presentation_quantity IS NULL OR presentation_quantity > 0",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_product_presentation_quantity_positive"), "product", type_="check")
    op.drop_constraint(op.f("ck_product_presentation_complete"), "product", type_="check")
    op.drop_column("product", "presentation_quantity")
    op.drop_column("product", "presentation_plural_name")
    op.drop_column("product", "presentation_name")
