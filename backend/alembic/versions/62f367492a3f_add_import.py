"""add import

Revision ID: 62f367492a3f
Revises: 6a07f9b29396
Create Date: 2026-09-03 10:29:22.291659

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "62f367492a3f"
down_revision: str | None = "6a07f9b29396"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_run",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("created_categories_count", sa.Integer(), nullable=False),
        sa.Column("created_units_count", sa.Integer(), nullable=False),
        sa.Column("created_attribute_values_count", sa.Integer(), nullable=False),
        sa.Column("created_products_count", sa.Integer(), nullable=False),
        sa.Column("created_variants_count", sa.Integer(), nullable=False),
        sa.Column("updated_variants_count", sa.Integer(), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["business_id"], ["business.id"], name=op.f("fk_import_run_business_id_business")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_import_run_created_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import_run")),
    )


def downgrade() -> None:
    op.drop_table("import_run")
