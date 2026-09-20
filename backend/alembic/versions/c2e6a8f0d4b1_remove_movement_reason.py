"""remove movement reason

Revision ID: c2e6a8f0d4b1
Revises: a4c7d1f9b3e5
Create Date: 2026-09-19 00:00:00.000001

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c2e6a8f0d4b1"
down_revision: str | None = "a4c7d1f9b3e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("fk_stock_movement_reason_id_movement_reason"), "stock_movement", type_="foreignkey"
    )
    op.drop_column("stock_movement", "reason_id")
    op.drop_table("movement_reason")


def downgrade() -> None:
    op.create_table(
        "movement_reason",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_movement_reason_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["business.id"],
            name=op.f("fk_movement_reason_business_id_business"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_movement_reason_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_movement_reason_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movement_reason")),
        sa.UniqueConstraint("business_id", "name", name="uq_movement_reason_business_id_name"),
    )
    op.add_column("stock_movement", sa.Column("reason_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_stock_movement_reason_id_movement_reason"),
        "stock_movement",
        "movement_reason",
        ["reason_id"],
        ["id"],
    )
