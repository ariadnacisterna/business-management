"""add image_url to product

Revision ID: b7c4f1a9e3d2
Revises: 04e83accd8a1
Create Date: 2026-09-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7c4f1a9e3d2"
down_revision: str | None = "04e83accd8a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("product", sa.Column("image_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("product", "image_url")
