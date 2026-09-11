"""add customers and credits

Revision ID: e5a8c1f6b3d9
Revises: f1a3c7d9b2e4
Create Date: 2026-09-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5a8c1f6b3d9"
down_revision: str | None = "f1a3c7d9b2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customer",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_customer_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["business.id"], name=op.f("fk_customer_business_id_business")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_customer_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_customer_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer")),
        sa.UniqueConstraint("business_id", "name", name="uq_customer_business_id_name"),
    )

    op.create_table(
        "credit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "type IN ('cargo', 'pago')", name=op.f("ck_credit_type_valid")
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_credit_amount_positive")),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customer.id"], name=op.f("fk_credit_customer_id_customer")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_credit_created_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit")),
    )


def downgrade() -> None:
    op.drop_table("credit")
    op.drop_table("customer")
