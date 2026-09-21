"""add account font size

Revision ID: d3f7a1b5c9e2
Revises: c2e6a8f0d4b1
Create Date: 2026-09-21 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d3f7a1b5c9e2"
down_revision: str | None = "c2e6a8f0d4b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "account",
        sa.Column("font_size", sa.SmallInteger(), nullable=False, server_default="3"),
    )
    op.alter_column("account", "font_size", server_default=None)
    op.create_check_constraint(
        op.f("ck_account_font_size_range"), "account", "font_size BETWEEN 1 AND 5"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_account_font_size_range"), "account", type_="check")
    op.drop_column("account", "font_size")
