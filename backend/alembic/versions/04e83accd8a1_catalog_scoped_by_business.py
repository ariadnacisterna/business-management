"""catalog scoped by business instead of organization

Revision ID: 04e83accd8a1
Revises: d1e2a9f47b6c
Create Date: 2026-09-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "04e83accd8a1"
down_revision: str | None = "d1e2a9f47b6c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATALOG_TABLES_WITH_UNIQUE_NAME = ("category", "unit", "attribute")
ALL_CATALOG_TABLES = (*CATALOG_TABLES_WITH_UNIQUE_NAME, "product")


def _backfill_business_id_from_organization(table: str) -> None:
    op.execute(
        f"""
        UPDATE {table} t
        SET business_id = fb.business_id
        FROM (
            SELECT DISTINCT ON (organization_id) organization_id, id AS business_id
            FROM business
            ORDER BY organization_id, id
        ) fb
        WHERE t.organization_id = fb.organization_id
        """
    )


def _backfill_organization_id_from_business(table: str) -> None:
    op.execute(
        f"""
        UPDATE {table} t
        SET organization_id = b.organization_id
        FROM business b
        WHERE t.business_id = b.id
        """
    )


def upgrade() -> None:
    for table in ALL_CATALOG_TABLES:
        op.add_column(table, sa.Column("business_id", sa.Integer(), nullable=True))
        _backfill_business_id_from_organization(table)
        op.alter_column(table, "business_id", nullable=False)
        op.create_foreign_key(
            op.f(f"fk_{table}_business_id_business"),
            table,
            "business",
            ["business_id"],
            ["id"],
        )
        op.drop_constraint(
            op.f(f"fk_{table}_organization_id_organization"), table, type_="foreignkey"
        )

    for table in CATALOG_TABLES_WITH_UNIQUE_NAME:
        op.drop_constraint(f"uq_{table}_organization_id_name", table, type_="unique")
        op.create_unique_constraint(f"uq_{table}_business_id_name", table, ["business_id", "name"])

    for table in ALL_CATALOG_TABLES:
        op.drop_column(table, "organization_id")


def downgrade() -> None:
    for table in ALL_CATALOG_TABLES:
        op.add_column(table, sa.Column("organization_id", sa.Integer(), nullable=True))
        _backfill_organization_id_from_business(table)
        op.alter_column(table, "organization_id", nullable=False)

    for table in CATALOG_TABLES_WITH_UNIQUE_NAME:
        op.drop_constraint(f"uq_{table}_business_id_name", table, type_="unique")
        op.create_unique_constraint(
            f"uq_{table}_organization_id_name", table, ["organization_id", "name"]
        )

    for table in ALL_CATALOG_TABLES:
        op.create_foreign_key(
            op.f(f"fk_{table}_organization_id_organization"),
            table,
            "organization",
            ["organization_id"],
            ["id"],
        )
        op.drop_constraint(op.f(f"fk_{table}_business_id_business"), table, type_="foreignkey")
        op.drop_column(table, "business_id")
