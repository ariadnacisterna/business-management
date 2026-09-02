"""add pricing

Revision ID: 6a07f9b29396
Revises: 760cbb6198d4
Create Date: 2026-09-02 16:30:52.554289

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6a07f9b29396"
down_revision: str | None = "760cbb6198d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "price",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("ck_price_amount_positive")),
        sa.ForeignKeyConstraint(
            ["business_id"], ["business.id"], name=op.f("fk_price_business_id_business")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_price_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"], ["variant.id"], name=op.f("fk_price_variant_id_variant")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_price")),
    )
    op.create_index(
        "uq_price_variant_id_business_id_current",
        "price",
        ["variant_id", "business_id"],
        unique=True,
        postgresql_where=sa.text("effective_to IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_price_variant_id_business_id_current",
        table_name="price",
        postgresql_where=sa.text("effective_to IS NULL"),
    )
    op.drop_table("price")
