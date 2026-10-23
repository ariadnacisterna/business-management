"""add sales

Revision ID: b5d9e3a7c1f4
Revises: a8e4c2f6d1b3
Create Date: 2026-10-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b5d9e3a7c1f4"
down_revision: str | None = "a8e4c2f6d1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRICE_PRECISION = 12
PRICE_SCALE = 2
STOCK_QUANTITY_PRECISION = 13
STOCK_QUANTITY_SCALE = 3
STATUS_MAX_LENGTH = 20
VOID_REASON_MAX_LENGTH = 500


def _money(name: str) -> sa.Column:
    return sa.Column(name, sa.Numeric(precision=PRICE_PRECISION, scale=PRICE_SCALE), nullable=False)


def _quantity(name: str) -> sa.Column:
    return sa.Column(
        name,
        sa.Numeric(precision=STOCK_QUANTITY_PRECISION, scale=STOCK_QUANTITY_SCALE),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "sale",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("payment_method", sa.String(length=STATUS_MAX_LENGTH), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        _money("subtotal"),
        _money("discount"),
        _money("total"),
        sa.Column("insufficient_stock", sa.Boolean(), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_account_id", sa.Integer(), nullable=True),
        sa.Column("void_reason", sa.String(length=VOID_REASON_MAX_LENGTH), nullable=True),
        sa.CheckConstraint(
            "payment_method IN ('efectivo', 'transferencia', 'fiado')",
            name=op.f("ck_sale_payment_method_valid"),
        ),
        sa.CheckConstraint(
            "payment_method <> 'fiado' OR customer_id IS NOT NULL",
            name=op.f("ck_sale_fiado_has_customer"),
        ),
        sa.CheckConstraint("subtotal >= 0", name=op.f("ck_sale_subtotal_non_negative")),
        sa.CheckConstraint("discount >= 0", name=op.f("ck_sale_discount_non_negative")),
        sa.CheckConstraint("total >= 0", name=op.f("ck_sale_total_non_negative")),
        sa.CheckConstraint("total = subtotal - discount", name=op.f("ck_sale_total_matches")),
        sa.CheckConstraint(
            "(voided_at IS NULL AND voided_by_account_id IS NULL AND void_reason IS NULL) OR "
            "(voided_at IS NOT NULL AND voided_by_account_id IS NOT NULL "
            "AND void_reason IS NOT NULL)",
            name=op.f("ck_sale_void_complete"),
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["business.id"], name=op.f("fk_sale_business_id_business")
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customer.id"], name=op.f("fk_sale_customer_id_customer")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_sale_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_account_id"],
            ["account.id"],
            name=op.f("fk_sale_voided_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sale")),
    )
    op.create_index("ix_sale_business_id_created_at", "sale", ["business_id", "created_at"])

    op.create_table(
        "sale_line",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sale_id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        _quantity("quantity"),
        _money("unit_price"),
        _money("line_total"),
        _quantity("stock_taken"),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_sale_line_quantity_positive")),
        sa.CheckConstraint("unit_price > 0", name=op.f("ck_sale_line_unit_price_positive")),
        sa.CheckConstraint("line_total >= 0", name=op.f("ck_sale_line_line_total_non_negative")),
        sa.CheckConstraint(
            "stock_taken >= 0 AND stock_taken <= quantity",
            name=op.f("ck_sale_line_stock_taken_in_range"),
        ),
        sa.ForeignKeyConstraint(["sale_id"], ["sale.id"], name=op.f("fk_sale_line_sale_id_sale")),
        sa.ForeignKeyConstraint(
            ["variant_id"], ["variant.id"], name=op.f("fk_sale_line_variant_id_variant")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sale_line")),
    )
    op.create_index("ix_sale_line_sale_id", "sale_line", ["sale_id"])
    op.create_index("ix_sale_line_variant_id", "sale_line", ["variant_id"])

    op.add_column("stock_movement", sa.Column("sale_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_stock_movement_sale_id_sale"), "stock_movement", "sale", ["sale_id"], ["id"]
    )
    op.create_index(op.f("ix_stock_movement_sale_id"), "stock_movement", ["sale_id"])

    op.add_column("credit", sa.Column("sale_id", sa.Integer(), nullable=True))
    op.create_foreign_key(op.f("fk_credit_sale_id_sale"), "credit", "sale", ["sale_id"], ["id"])
    op.create_index(
        "uq_credit_sale_id_type",
        "credit",
        ["sale_id", "type"],
        unique=True,
        postgresql_where=sa.text("sale_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_credit_sale_id_type", table_name="credit")
    op.drop_constraint(op.f("fk_credit_sale_id_sale"), "credit", type_="foreignkey")
    op.drop_column("credit", "sale_id")
    op.drop_index(op.f("ix_stock_movement_sale_id"), table_name="stock_movement")
    op.drop_constraint(op.f("fk_stock_movement_sale_id_sale"), "stock_movement", type_="foreignkey")
    op.drop_column("stock_movement", "sale_id")
    op.drop_index("ix_sale_line_variant_id", table_name="sale_line")
    op.drop_index("ix_sale_line_sale_id", table_name="sale_line")
    op.drop_table("sale_line")
    op.drop_index("ix_sale_business_id_created_at", table_name="sale")
    op.drop_table("sale")
