"""add login attempt

Revision ID: e7b2c4d8f1a6
Revises: b9457223ee69
Create Date: 2026-10-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7b2c4d8f1a6"
down_revision: str | None = "b9457223ee69"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERNAME_MAX_LENGTH = 80
IP_ADDRESS_MAX_LENGTH = 45
LOGIN_OUTCOME_MAX_LENGTH = 20


def upgrade() -> None:
    op.create_table(
        "login_attempt",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_name", sa.String(length=USERNAME_MAX_LENGTH), nullable=False),
        sa.Column("ip_address", sa.String(length=IP_ADDRESS_MAX_LENGTH), nullable=False),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("outcome", sa.String(length=LOGIN_OUTCOME_MAX_LENGTH), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_attempt")),
    )
    op.create_index(
        "ix_login_attempt_user_name_attempted_at",
        "login_attempt",
        ["user_name", "attempted_at"],
    )
    op.create_index(
        "ix_login_attempt_ip_address_attempted_at",
        "login_attempt",
        ["ip_address", "attempted_at"],
    )
    op.create_index("ix_login_attempt_attempted_at", "login_attempt", ["attempted_at"])


def downgrade() -> None:
    op.drop_index("ix_login_attempt_attempted_at", table_name="login_attempt")
    op.drop_index("ix_login_attempt_ip_address_attempted_at", table_name="login_attempt")
    op.drop_index("ix_login_attempt_user_name_attempted_at", table_name="login_attempt")
    op.drop_table("login_attempt")
