"""add cash registers

Revision ID: d6a1f4c8b2e7
Revises: a9c3e5b7d1f2
Create Date: 2026-10-26 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d6a1f4c8b2e7"
down_revision: str | None = "a9c3e5b7d1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRICE_PRECISION = 12
PRICE_SCALE = 2
STATUS_MAX_LENGTH = 20
CASH_MOVEMENT_REASON_MAX_LENGTH = 200


def _money() -> sa.Numeric:
    return sa.Numeric(precision=PRICE_PRECISION, scale=PRICE_SCALE)


def upgrade() -> None:
    op.create_table(
        "cash_register",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by_account_id", sa.Integer(), nullable=True),
        sa.Column("expected_cash", _money(), nullable=True),
        sa.Column("counted_cash", _money(), nullable=True),
        sa.Column("cash_difference", _money(), nullable=True),
        sa.Column("transfers_closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transfers_closed_by_account_id", sa.Integer(), nullable=True),
        sa.Column("expected_transfer", _money(), nullable=True),
        sa.Column("counted_transfer", _money(), nullable=True),
        sa.Column("transfer_difference", _money(), nullable=True),
        sa.CheckConstraint("ends_at > opened_at", name=op.f("ck_cash_register_ends_after_opening")),
        sa.CheckConstraint(
            "(closed_at IS NULL AND closed_by_account_id IS NULL AND expected_cash IS NULL "
            "AND counted_cash IS NULL AND cash_difference IS NULL) OR "
            "(closed_at IS NOT NULL AND closed_by_account_id IS NOT NULL "
            "AND expected_cash IS NOT NULL AND counted_cash IS NOT NULL "
            "AND cash_difference IS NOT NULL)",
            name=op.f("ck_cash_register_close_complete"),
        ),
        sa.CheckConstraint(
            "counted_cash IS NULL OR counted_cash >= 0",
            name=op.f("ck_cash_register_counted_cash_valid"),
        ),
        sa.CheckConstraint(
            "(transfers_closed_at IS NULL AND transfers_closed_by_account_id IS NULL "
            "AND expected_transfer IS NULL AND counted_transfer IS NULL "
            "AND transfer_difference IS NULL) OR "
            "(transfers_closed_at IS NOT NULL AND transfers_closed_by_account_id IS NOT NULL "
            "AND expected_transfer IS NOT NULL AND counted_transfer IS NOT NULL "
            "AND transfer_difference IS NOT NULL AND closed_at IS NOT NULL)",
            name=op.f("ck_cash_register_transfers_close_complete"),
        ),
        sa.CheckConstraint(
            "counted_transfer IS NULL OR counted_transfer >= 0",
            name=op.f("ck_cash_register_counted_transfer_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["business.id"], name=op.f("fk_cash_register_business_id_business")
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["account.id"], name=op.f("fk_cash_register_account_id_account")
        ),
        sa.ForeignKeyConstraint(
            ["closed_by_account_id"],
            ["account.id"],
            name=op.f("fk_cash_register_closed_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["transfers_closed_by_account_id"],
            ["account.id"],
            name=op.f("fk_cash_register_transfers_closed_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_register")),
    )
    op.create_index(
        "ix_cash_register_business_id_opened_at", "cash_register", ["business_id", "opened_at"]
    )
    op.create_index(
        "ix_cash_register_account_id_business_id", "cash_register", ["account_id", "business_id"]
    )

    op.create_table(
        "cash_movement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cash_register_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=STATUS_MAX_LENGTH), nullable=False),
        sa.Column("amount", _money(), nullable=False),
        sa.Column("reason", sa.String(length=CASH_MOVEMENT_REASON_MAX_LENGTH), nullable=True),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('ingreso', 'retiro')", name=op.f("ck_cash_movement_kind_valid")
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_cash_movement_amount_positive")),
        sa.ForeignKeyConstraint(
            ["cash_register_id"],
            ["cash_register.id"],
            name=op.f("fk_cash_movement_cash_register_id_cash_register"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_cash_movement_created_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cash_movement")),
    )
    op.create_index("ix_cash_movement_cash_register_id", "cash_movement", ["cash_register_id"])

    op.add_column("sale", sa.Column("cash_register_id", sa.Integer(), nullable=True))
    op.add_column("sale", sa.Column("void_cash_register_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_sale_cash_register_id_cash_register"),
        "sale",
        "cash_register",
        ["cash_register_id"],
        ["id"],
    )
    op.create_foreign_key(
        op.f("fk_sale_void_cash_register_id_cash_register"),
        "sale",
        "cash_register",
        ["void_cash_register_id"],
        ["id"],
    )
    op.create_index("ix_sale_cash_register_id", "sale", ["cash_register_id"])
    op.create_index("ix_sale_void_cash_register_id", "sale", ["void_cash_register_id"])


def downgrade() -> None:
    op.drop_index("ix_sale_void_cash_register_id", table_name="sale")
    op.drop_index("ix_sale_cash_register_id", table_name="sale")
    op.drop_constraint(
        op.f("fk_sale_void_cash_register_id_cash_register"), "sale", type_="foreignkey"
    )
    op.drop_constraint(op.f("fk_sale_cash_register_id_cash_register"), "sale", type_="foreignkey")
    op.drop_column("sale", "void_cash_register_id")
    op.drop_column("sale", "cash_register_id")
    op.drop_index("ix_cash_movement_cash_register_id", table_name="cash_movement")
    op.drop_table("cash_movement")
    op.drop_index("ix_cash_register_account_id_business_id", table_name="cash_register")
    op.drop_index("ix_cash_register_business_id_opened_at", table_name="cash_register")
    op.drop_table("cash_register")
