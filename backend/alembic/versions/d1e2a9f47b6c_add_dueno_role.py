"""add dueno role and promote initial admin

Revision ID: d1e2a9f47b6c
Revises: 7e2b9f4a1c86
Create Date: 2026-09-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.constants.roles import ADMINISTRADOR, DUENO
from app.core.config import get_settings

revision: str = "d1e2a9f47b6c"
down_revision: str | None = "7e2b9f4a1c86"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    role_table = sa.table("role", sa.column("id", sa.Integer), sa.column("name", sa.String))
    dueno_id = bind.execute(
        role_table.insert().returning(role_table.c.id), {"name": DUENO}
    ).scalar_one()

    settings = get_settings()

    account_table = sa.table(
        "account", sa.column("id", sa.Integer), sa.column("user_name", sa.String)
    )
    admin_account_id = bind.execute(
        sa.select(account_table.c.id).where(
            account_table.c.user_name == settings.initial_admin_username
        )
    ).scalar_one_or_none()

    if admin_account_id is not None:
        business_access_table = sa.table(
            "business_access",
            sa.column("account_id", sa.Integer),
            sa.column("role_id", sa.Integer),
        )
        bind.execute(
            business_access_table.update()
            .where(business_access_table.c.account_id == admin_account_id)
            .values(role_id=dueno_id)
        )


def downgrade() -> None:
    bind = op.get_bind()

    role_table = sa.table("role", sa.column("id", sa.Integer), sa.column("name", sa.String))
    dueno_id = bind.execute(
        sa.select(role_table.c.id).where(role_table.c.name == DUENO)
    ).scalar_one_or_none()

    if dueno_id is not None:
        administrador_id = bind.execute(
            sa.select(role_table.c.id).where(role_table.c.name == ADMINISTRADOR)
        ).scalar_one()

        business_access_table = sa.table(
            "business_access",
            sa.column("account_id", sa.Integer),
            sa.column("role_id", sa.Integer),
        )
        bind.execute(
            business_access_table.update()
            .where(business_access_table.c.role_id == dueno_id)
            .values(role_id=administrador_id)
        )

        bind.execute(role_table.delete().where(role_table.c.id == dueno_id))
