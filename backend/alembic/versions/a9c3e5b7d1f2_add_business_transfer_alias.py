"""add business transfer alias

Revision ID: a9c3e5b7d1f2
Revises: c4e8a2d6f9b1
Create Date: 2026-10-26 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a9c3e5b7d1f2"
down_revision: str | None = "c4e8a2d6f9b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TRANSFER_ALIAS_MAX_LENGTH = 50


def upgrade() -> None:
    op.add_column(
        "business",
        sa.Column("transfer_alias", sa.String(length=TRANSFER_ALIAS_MAX_LENGTH), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("business", "transfer_alias")
