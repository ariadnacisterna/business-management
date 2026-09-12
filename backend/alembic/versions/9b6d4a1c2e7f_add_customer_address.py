"""add customer address

Revision ID: 9b6d4a1c2e7f
Revises: e5a8c1f6b3d9
Create Date: 2026-09-11 00:00:00.000001

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9b6d4a1c2e7f"
down_revision: str | None = "e5a8c1f6b3d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("customer", sa.Column("address", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("customer", "address")
