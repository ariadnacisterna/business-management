"""initial schema

Revision ID: c603b2693d97
Revises:
Create Date: 2026-08-27 23:33:24.854897

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.constants.roles import INITIAL_ROLES
from app.core.config import get_settings

revision: str = "c603b2693d97"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizacion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizacion")),
    )
    op.create_table(
        "rol",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rol")),
        sa.UniqueConstraint("nombre", name=op.f("uq_rol_nombre")),
    )
    op.create_table(
        "negocio",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organizacion_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("rubro", sa.String(length=100), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.CheckConstraint(
            "estado IN ('activo', 'inactivo')", name=op.f("ck_negocio_estado_valido")
        ),
        sa.ForeignKeyConstraint(
            ["organizacion_id"],
            ["organizacion.id"],
            name=op.f("fk_negocio_organizacion_id_organizacion"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_negocio")),
    )
    op.create_table(
        "usuario",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organizacion_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.CheckConstraint(
            "estado IN ('activo', 'inactivo')", name=op.f("ck_usuario_estado_valido")
        ),
        sa.ForeignKeyConstraint(
            ["organizacion_id"],
            ["organizacion.id"],
            name=op.f("fk_usuario_organizacion_id_organizacion"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usuario")),
    )

    _seed_initial_data()


def _seed_initial_data() -> None:
    settings = get_settings()
    bind = op.get_bind()

    rol_table = sa.table("rol", sa.column("nombre", sa.String))
    bind.execute(rol_table.insert(), [{"nombre": nombre} for nombre in INITIAL_ROLES])

    organizacion_table = sa.table(
        "organizacion", sa.column("id", sa.Integer), sa.column("nombre", sa.String)
    )
    organizacion_id = bind.execute(
        organizacion_table.insert().returning(organizacion_table.c.id),
        {"nombre": settings.initial_organization_name},
    ).scalar_one()

    negocio_table = sa.table(
        "negocio",
        sa.column("organizacion_id", sa.Integer),
        sa.column("nombre", sa.String),
        sa.column("rubro", sa.String),
        sa.column("estado", sa.String),
    )
    bind.execute(
        negocio_table.insert(),
        {
            "organizacion_id": organizacion_id,
            "nombre": settings.initial_business_name,
            "rubro": settings.initial_business_industry,
            "estado": "activo",
        },
    )


def downgrade() -> None:
    op.drop_table("usuario")
    op.drop_table("negocio")
    op.drop_table("rol")
    op.drop_table("organizacion")
