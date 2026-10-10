"""add submission and integrity checks

Revision ID: f3b8d2a6c1e9
Revises: e7b2c4d8f1a6
Create Date: 2026-10-10 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f3b8d2a6c1e9"
down_revision: str | None = "e7b2c4d8f1a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SUBMISSION_KEY_MAX_LENGTH = 100
SUBMISSION_OPERATION_MAX_LENGTH = 255
SUBMISSION_FINGERPRINT_LENGTH = 64

CHECKS_VALIDATED_ONLY_ON_CLEAN_DATA = (
    (
        "stock_movement",
        "ck_stock_movement_quantity_changed",
        "quantity_before <> quantity_after",
    ),
    (
        "price",
        "ck_price_effective_range",
        "effective_to IS NULL OR effective_to >= effective_from",
    ),
)


def _add_check_validated_if_data_complies(table: str, name: str, condition: str) -> None:
    op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({condition}) NOT VALID")
    has_violations = (
        op.get_bind()
        .execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {table} WHERE NOT ({condition}))"))
        .scalar_one()
    )
    if not has_violations:
        op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")


def upgrade() -> None:
    op.create_table(
        "submission",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=SUBMISSION_KEY_MAX_LENGTH), nullable=False),
        sa.Column("operation", sa.String(length=SUBMISSION_OPERATION_MAX_LENGTH), nullable=False),
        sa.Column(
            "request_fingerprint",
            sa.String(length=SUBMISSION_FINGERPRINT_LENGTH),
            nullable=False,
        ),
        sa.Column("response_body", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["account_id"], ["account.id"], name=op.f("fk_submission_account_id_account")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_submission")),
        sa.UniqueConstraint("account_id", "key", name="uq_submission_account_id_key"),
    )
    op.create_index("ix_submission_created_at", "submission", ["created_at"])

    for table, name, condition in CHECKS_VALIDATED_ONLY_ON_CLEAN_DATA:
        _add_check_validated_if_data_complies(table, name, condition)


def downgrade() -> None:
    for table, name, _condition in reversed(CHECKS_VALIDATED_ONLY_ON_CLEAN_DATA):
        op.drop_constraint(op.f(name), table, type_="check")
    op.drop_index("ix_submission_created_at", table_name="submission")
    op.drop_table("submission")
