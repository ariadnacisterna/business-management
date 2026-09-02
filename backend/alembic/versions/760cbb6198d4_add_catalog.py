"""add catalog

Revision ID: 760cbb6198d4
Revises: c8d927a0baa9
Create Date: 2026-09-02 00:00:00.000000

"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op
from app.core.text import normalize_for_comparison

revision: str = "760cbb6198d4"
down_revision: str | None = "c8d927a0baa9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ATTRIBUTE_NAME = "color"
INITIAL_ATTRIBUTE_VALUES = (
    "Rojo",
    "Azul",
    "Verde",
    "Amarillo",
    "Naranja",
    "Violeta",
    "Rosa",
    "Celeste",
    "Blanco",
    "Negro",
    "Gris",
    "Marrón",
    "Beige",
)


def upgrade() -> None:
    op.create_table(
        "category",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_category_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name=op.f("fk_category_organization_id_organization"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_category_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_category_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_category")),
        sa.UniqueConstraint("organization_id", "name", name="uq_category_organization_id_name"),
    )

    op.create_table(
        "unit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("abbreviation", sa.String(length=20), nullable=False),
        sa.Column("allows_fraction", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('active', 'inactive')", name=op.f("ck_unit_status_valid")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name=op.f("fk_unit_organization_id_organization"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_unit_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_unit_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_unit")),
        sa.UniqueConstraint("organization_id", "name", name="uq_unit_organization_id_name"),
    )

    op.create_table(
        "attribute",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_attribute_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name=op.f("fk_attribute_organization_id_organization"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_attribute_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_attribute_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attribute")),
        sa.UniqueConstraint("organization_id", "name", name="uq_attribute_organization_id_name"),
    )

    op.create_table(
        "attribute_value",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.Column("normalized_value", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_attribute_value_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["attribute_id"],
            ["attribute.id"],
            name=op.f("fk_attribute_value_attribute_id_attribute"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_attribute_value_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_attribute_value_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attribute_value")),
    )
    op.create_index(
        "uq_attribute_value_attribute_id_normalized_value",
        "attribute_value",
        ["attribute_id", "normalized_value"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "product",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_product_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name=op.f("fk_product_organization_id_organization"),
        ),
        sa.ForeignKeyConstraint(
            ["category_id"], ["category.id"], name=op.f("fk_product_category_id_category")
        ),
        sa.ForeignKeyConstraint(["unit_id"], ["unit.id"], name=op.f("fk_product_unit_id_unit")),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_product_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_product_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product")),
    )

    op.create_table(
        "variant",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("is_implicit", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_account_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_variant_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["product.id"], name=op.f("fk_variant_product_id_product")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["account.id"],
            name=op.f("fk_variant_created_by_account_id_account"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_account_id"],
            ["account.id"],
            name=op.f("fk_variant_updated_by_account_id_account"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_variant")),
    )

    op.create_table(
        "variant_attribute_value",
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("attribute_value_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["variant.id"],
            name=op.f("fk_variant_attribute_value_variant_id_variant"),
        ),
        sa.ForeignKeyConstraint(
            ["attribute_value_id"],
            ["attribute_value.id"],
            name=op.f("fk_variant_attribute_value_attribute_value_id_attribute_value"),
        ),
        sa.PrimaryKeyConstraint(
            "variant_id", "attribute_value_id", name=op.f("pk_variant_attribute_value")
        ),
    )

    _seed_color_attribute()


def _seed_color_attribute() -> None:
    bind = op.get_bind()
    now = datetime.now(UTC)

    organization_table = sa.table("organization", sa.column("id", sa.Integer))
    organization_id = bind.execute(sa.select(organization_table.c.id)).scalar_one()

    account_table = sa.table("account", sa.column("id", sa.Integer))
    account_id = bind.execute(sa.select(account_table.c.id)).scalar_one()

    attribute_table = sa.table(
        "attribute",
        sa.column("id", sa.Integer),
        sa.column("organization_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("status", sa.String),
        sa.column("created_by_account_id", sa.Integer),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_by_account_id", sa.Integer),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    attribute_id = bind.execute(
        attribute_table.insert().returning(attribute_table.c.id),
        {
            "organization_id": organization_id,
            "name": ATTRIBUTE_NAME,
            "status": "active",
            "created_by_account_id": account_id,
            "created_at": now,
            "updated_by_account_id": account_id,
            "updated_at": now,
        },
    ).scalar_one()

    attribute_value_table = sa.table(
        "attribute_value",
        sa.column("attribute_id", sa.Integer),
        sa.column("value", sa.String),
        sa.column("normalized_value", sa.String),
        sa.column("status", sa.String),
        sa.column("created_by_account_id", sa.Integer),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_by_account_id", sa.Integer),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    bind.execute(
        attribute_value_table.insert(),
        [
            {
                "attribute_id": attribute_id,
                "value": value,
                "normalized_value": normalize_for_comparison(value),
                "status": "active",
                "created_by_account_id": account_id,
                "created_at": now,
                "updated_by_account_id": account_id,
                "updated_at": now,
            }
            for value in INITIAL_ATTRIBUTE_VALUES
        ],
    )


def downgrade() -> None:
    op.drop_table("variant_attribute_value")
    op.drop_table("variant")
    op.drop_table("product")
    op.drop_index("uq_attribute_value_attribute_id_normalized_value", table_name="attribute_value")
    op.drop_table("attribute_value")
    op.drop_table("attribute")
    op.drop_table("unit")
    op.drop_table("category")
