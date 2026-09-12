"""add inventory

Revision ID: a4c7d1f9b3e5
Revises: 9b6d4a1c2e7f
Create Date: 2026-09-11 00:00:00.000002

"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op
from app.core.config import get_settings

revision: str = "a4c7d1f9b3e5"
down_revision: str | None = "9b6d4a1c2e7f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_MOVEMENT_REASON_NAMES = ("Entrada", "Salida", "Corrección", "Rotura")


def upgrade() -> None:
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

    op.add_column("variant", sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("variant", "quantity", server_default=None)
    op.add_column("variant", sa.Column("minimum_quantity", sa.Integer(), nullable=True))
    op.create_check_constraint(
        op.f("ck_variant_quantity_non_negative"), "variant", "quantity >= 0"
    )
    op.create_check_constraint(
        op.f("ck_variant_minimum_quantity_non_negative"),
        "variant",
        "minimum_quantity IS NULL OR minimum_quantity >= 0",
    )

    op.create_table(
        "stock_movement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("reason_id", sa.Integer(), nullable=False),
        sa.Column("quantity_before", sa.Integer(), nullable=False),
        sa.Column("quantity_after", sa.Integer(), nullable=False),
        sa.Column("observation", sa.String(length=500), nullable=True),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "quantity_before >= 0", name=op.f("ck_stock_movement_quantity_before_non_negative")
        ),
        sa.CheckConstraint(
            "quantity_after >= 0", name=op.f("ck_stock_movement_quantity_after_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"], ["variant.id"], name=op.f("fk_stock_movement_variant_id_variant")
        ),
        sa.ForeignKeyConstraint(
            ["reason_id"],
            ["movement_reason.id"],
            name=op.f("fk_stock_movement_reason_id_movement_reason"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_stock_movement_created_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_movement")),
    )

    _seed_default_movement_reasons()


def _seed_default_movement_reasons() -> None:
    bind = op.get_bind()
    settings = get_settings()

    account_table = sa.table(
        "account", sa.column("id", sa.Integer), sa.column("user_name", sa.String)
    )
    admin_account_id = bind.execute(
        sa.select(account_table.c.id).where(
            account_table.c.user_name == settings.initial_admin_username
        )
    ).scalar_one_or_none()

    if admin_account_id is None:
        return

    business_table = sa.table("business", sa.column("id", sa.Integer))
    business_ids = bind.execute(sa.select(business_table.c.id)).scalars().all()
    if not business_ids:
        return

    now = datetime.now(UTC)
    movement_reason_table = sa.table(
        "movement_reason",
        sa.column("business_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("status", sa.String),
        sa.column("created_by_account_id", sa.Integer),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_by_account_id", sa.Integer),
        sa.column("updated_at", sa.DateTime),
    )
    bind.execute(
        movement_reason_table.insert(),
        [
            {
                "business_id": business_id,
                "name": name,
                "status": "active",
                "created_by_account_id": admin_account_id,
                "created_at": now,
                "updated_by_account_id": admin_account_id,
                "updated_at": now,
            }
            for business_id in business_ids
            for name in DEFAULT_MOVEMENT_REASON_NAMES
        ],
    )


def downgrade() -> None:
    op.drop_table("stock_movement")
    op.drop_constraint(op.f("ck_variant_minimum_quantity_non_negative"), "variant", type_="check")
    op.drop_constraint(op.f("ck_variant_quantity_non_negative"), "variant", type_="check")
    op.drop_column("variant", "minimum_quantity")
    op.drop_column("variant", "quantity")
    op.drop_table("movement_reason")
