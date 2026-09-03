"""add second business and session active business

Revision ID: 7e2b9f4a1c86
Revises: 62f367492a3f
Create Date: 2026-09-03 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.constants.roles import ADMINISTRADOR
from app.core.config import get_settings

revision: str = "7e2b9f4a1c86"
down_revision: str | None = "62f367492a3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("account_session", sa.Column("active_business_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_account_session_active_business_id_business"),
        "account_session",
        "business",
        ["active_business_id"],
        ["id"],
    )

    _seed_second_business()


def _seed_second_business() -> None:
    settings = get_settings()
    if not settings.initial_business_2_name or not settings.initial_business_2_industry:
        return

    bind = op.get_bind()

    organization_table = sa.table("organization", sa.column("id", sa.Integer))
    organization_id = bind.execute(sa.select(organization_table.c.id)).scalar_one()

    business_table = sa.table(
        "business",
        sa.column("id", sa.Integer),
        sa.column("organization_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("industry", sa.String),
        sa.column("status", sa.String),
    )
    business_id = bind.execute(
        business_table.insert().returning(business_table.c.id),
        {
            "organization_id": organization_id,
            "name": settings.initial_business_2_name,
            "industry": settings.initial_business_2_industry,
            "status": "active",
        },
    ).scalar_one()

    account_table = sa.table(
        "account", sa.column("id", sa.Integer), sa.column("user_name", sa.String)
    )
    admin_account_id = bind.execute(
        sa.select(account_table.c.id).where(
            account_table.c.user_name == settings.initial_admin_username
        )
    ).scalar_one()

    role_table = sa.table("role", sa.column("id", sa.Integer), sa.column("name", sa.String))
    role_id = bind.execute(
        sa.select(role_table.c.id).where(role_table.c.name == ADMINISTRADOR)
    ).scalar_one()

    business_access_table = sa.table(
        "business_access",
        sa.column("account_id", sa.Integer),
        sa.column("business_id", sa.Integer),
        sa.column("role_id", sa.Integer),
        sa.column("status", sa.String),
    )
    bind.execute(
        business_access_table.insert(),
        {
            "account_id": admin_account_id,
            "business_id": business_id,
            "role_id": role_id,
            "status": "active",
        },
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_account_session_active_business_id_business"),
        "account_session",
        type_="foreignkey",
    )
    op.drop_column("account_session", "active_business_id")

    _remove_second_business()


def _remove_second_business() -> None:
    settings = get_settings()
    if not settings.initial_business_2_name or not settings.initial_business_2_industry:
        return

    bind = op.get_bind()

    business_table = sa.table(
        "business",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("industry", sa.String),
    )
    business_id = bind.execute(
        sa.select(business_table.c.id).where(
            business_table.c.name == settings.initial_business_2_name,
            business_table.c.industry == settings.initial_business_2_industry,
        )
    ).scalar_one_or_none()

    if business_id is None:
        return

    business_access_table = sa.table("business_access", sa.column("business_id", sa.Integer))
    bind.execute(
        business_access_table.delete().where(business_access_table.c.business_id == business_id)
    )

    bind.execute(business_table.delete().where(business_table.c.id == business_id))
