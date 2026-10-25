"""add sale payments and free lines

Revision ID: c4e8a2d6f9b1
Revises: b5d9e3a7c1f4
Create Date: 2026-10-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4e8a2d6f9b1"
down_revision: str | None = "b5d9e3a7c1f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRICE_PRECISION = 12
PRICE_SCALE = 2
STATUS_MAX_LENGTH = 20
FREE_LINE_DESCRIPTION_MAX_LENGTH = 100
PAYMENT_METHODS_SQL = "'efectivo', 'transferencia', 'fiado'"


def upgrade() -> None:
    op.create_table(
        "sale_payment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sale_id", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=STATUS_MAX_LENGTH), nullable=False),
        sa.Column(
            "amount",
            sa.Numeric(precision=PRICE_PRECISION, scale=PRICE_SCALE),
            nullable=False,
        ),
        sa.CheckConstraint(
            f"method IN ({PAYMENT_METHODS_SQL})", name=op.f("ck_sale_payment_method_valid")
        ),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_sale_payment_amount_non_negative")),
        sa.ForeignKeyConstraint(
            ["sale_id"], ["sale.id"], name=op.f("fk_sale_payment_sale_id_sale")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sale_payment")),
        sa.UniqueConstraint("sale_id", "method", name=op.f("uq_sale_payment_sale_id")),
    )
    op.execute(
        "INSERT INTO sale_payment (sale_id, method, amount) "
        "SELECT id, payment_method, total FROM sale ORDER BY id"
    )
    op.drop_constraint(op.f("ck_sale_fiado_has_customer"), "sale", type_="check")
    op.drop_constraint(op.f("ck_sale_payment_method_valid"), "sale", type_="check")
    op.drop_column("sale", "payment_method")

    op.alter_column("sale_line", "variant_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "sale_line",
        sa.Column("description", sa.String(length=FREE_LINE_DESCRIPTION_MAX_LENGTH), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_sale_line_product_or_free_amount"),
        "sale_line",
        "(variant_id IS NOT NULL AND description IS NULL) OR "
        "(variant_id IS NULL AND description IS NOT NULL AND quantity = 1 "
        "AND stock_taken = 0 AND line_total = unit_price)",
    )


def downgrade() -> None:
    connection = op.get_bind()
    blocking = connection.execute(
        sa.text(
            "SELECT (SELECT count(*) FROM sale_line WHERE variant_id IS NULL) + "
            "(SELECT count(*) FROM (SELECT sale_id FROM sale_payment GROUP BY sale_id "
            "HAVING count(*) > 1) AS split)"
        )
    ).scalar_one()
    if blocking:
        raise RuntimeError(
            "No se puede volver atrás: hay ventas con monto libre o con varias formas de pago"
        )
    op.drop_constraint(op.f("ck_sale_line_product_or_free_amount"), "sale_line", type_="check")
    op.drop_column("sale_line", "description")
    op.alter_column("sale_line", "variant_id", existing_type=sa.Integer(), nullable=False)

    op.add_column(
        "sale", sa.Column("payment_method", sa.String(length=STATUS_MAX_LENGTH), nullable=True)
    )
    op.execute(
        "UPDATE sale s SET payment_method = ("
        "SELECT p.method FROM sale_payment p WHERE p.sale_id = s.id)"
    )
    op.execute("UPDATE sale SET payment_method = 'efectivo' WHERE payment_method IS NULL")
    op.alter_column(
        "sale", "payment_method", existing_type=sa.String(length=STATUS_MAX_LENGTH), nullable=False
    )
    op.create_check_constraint(
        op.f("ck_sale_payment_method_valid"), "sale", f"payment_method IN ({PAYMENT_METHODS_SQL})"
    )
    op.create_check_constraint(
        op.f("ck_sale_fiado_has_customer"),
        "sale",
        "payment_method <> 'fiado' OR customer_id IS NOT NULL",
    )
    op.drop_table("sale_payment")
