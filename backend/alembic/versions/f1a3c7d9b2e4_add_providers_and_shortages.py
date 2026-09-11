"""add providers and shortages

Revision ID: f1a3c7d9b2e4
Revises: b7c4f1a9e3d2
Create Date: 2026-09-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1a3c7d9b2e4"
down_revision: str | None = "b7c4f1a9e3d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "provider",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=255), nullable=True),
        sa.Column("last_purchase_at", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_provider_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["business.id"], name=op.f("fk_provider_business_id_business")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_provider_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_provider_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_provider")),
        sa.UniqueConstraint("business_id", "name", name="uq_provider_business_id_name"),
    )

    op.create_table(
        "provider_category",
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["provider.id"],
            name=op.f("fk_provider_category_provider_id_provider"),
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["category.id"],
            name=op.f("fk_provider_category_category_id_category"),
        ),
        sa.PrimaryKeyConstraint(
            "provider_id", "category_id", name=op.f("pk_provider_category")
        ),
    )

    op.add_column("product", sa.Column("provider_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_product_provider_id_provider"), "product", "provider", ["provider_id"], ["id"]
    )

    op.create_table(
        "shortage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('faltante', 'pedido', 'recibido')", name=op.f("ck_shortage_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"], ["variant.id"], name=op.f("fk_shortage_variant_id_variant")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_shortage_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_shortage_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shortage")),
    )
    op.create_index(
        "uq_shortage_variant_id_open",
        "shortage",
        ["variant_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('faltante', 'pedido')"),
    )


def downgrade() -> None:
    op.drop_index("uq_shortage_variant_id_open", table_name="shortage")
    op.drop_table("shortage")
    op.drop_constraint(op.f("fk_product_provider_id_provider"), "product", type_="foreignkey")
    op.drop_column("product", "provider_id")
    op.drop_table("provider_category")
    op.drop_table("provider")
