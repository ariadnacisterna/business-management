"""add authentication and access

Revision ID: a1f3c9d2e8b7
Revises: c603b2693d97
Create Date: 2026-08-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.constants.estado import EstadoEntidad
from app.constants.roles import ADMINISTRADOR
from app.core.config import get_settings
from app.core.security import hash_password

revision: str = "a1f3c9d2e8b7"
down_revision: str | None = "c603b2693d97"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("usuario", sa.Column("user_name", sa.String(length=80), nullable=False))
    op.add_column("usuario", sa.Column("password_hash", sa.String(length=255), nullable=False))
    op.create_unique_constraint(op.f("uq_usuario_user_name"), "usuario", ["user_name"])

    op.create_table(
        "acceso_a_negocio",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("negocio_id", sa.Integer(), nullable=False),
        sa.Column("rol_id", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.CheckConstraint(
            "estado IN ('activo', 'inactivo')",
            name=op.f("ck_acceso_a_negocio_estado_valido"),
        ),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name=op.f("fk_acceso_a_negocio_usuario_id_usuario"),
        ),
        sa.ForeignKeyConstraint(
            ["negocio_id"],
            ["negocio.id"],
            name=op.f("fk_acceso_a_negocio_negocio_id_negocio"),
        ),
        sa.ForeignKeyConstraint(
            ["rol_id"],
            ["rol.id"],
            name=op.f("fk_acceso_a_negocio_rol_id_rol"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_acceso_a_negocio")),
        sa.UniqueConstraint(
            "usuario_id",
            "negocio_id",
            name="uq_acceso_a_negocio_usuario_id_negocio_id",
        ),
    )

    op.create_table(
        "sesion",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("csrf_token", sa.String(length=64), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expira_en", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["usuario_id"],
            ["usuario.id"],
            name=op.f("fk_sesion_usuario_id_usuario"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sesion")),
    )

    _seed_initial_admin()


def _seed_initial_admin() -> None:
    settings = get_settings()
    bind = op.get_bind()

    organizacion_table = sa.table("organizacion", sa.column("id", sa.Integer))
    organizacion_id = bind.execute(sa.select(organizacion_table.c.id)).scalar_one()

    negocio_table = sa.table("negocio", sa.column("id", sa.Integer))
    negocio_id = bind.execute(sa.select(negocio_table.c.id)).scalar_one()

    rol_table = sa.table("rol", sa.column("id", sa.Integer), sa.column("nombre", sa.String))
    rol_id = bind.execute(
        sa.select(rol_table.c.id).where(rol_table.c.nombre == ADMINISTRADOR)
    ).scalar_one()

    usuario_table = sa.table(
        "usuario",
        sa.column("id", sa.Integer),
        sa.column("organizacion_id", sa.Integer),
        sa.column("nombre", sa.String),
        sa.column("user_name", sa.String),
        sa.column("password_hash", sa.String),
        sa.column("estado", sa.String),
    )
    usuario_id = bind.execute(
        usuario_table.insert().returning(usuario_table.c.id),
        {
            "organizacion_id": organizacion_id,
            "nombre": settings.initial_admin_name,
            "user_name": settings.initial_admin_username,
            "password_hash": hash_password(settings.initial_admin_password),
            "estado": EstadoEntidad.ACTIVO.value,
        },
    ).scalar_one()

    acceso_table = sa.table(
        "acceso_a_negocio",
        sa.column("usuario_id", sa.Integer),
        sa.column("negocio_id", sa.Integer),
        sa.column("rol_id", sa.Integer),
        sa.column("estado", sa.String),
    )
    bind.execute(
        acceso_table.insert(),
        {
            "usuario_id": usuario_id,
            "negocio_id": negocio_id,
            "rol_id": rol_id,
            "estado": EstadoEntidad.ACTIVO.value,
        },
    )


def downgrade() -> None:
    op.drop_table("sesion")
    op.drop_table("acceso_a_negocio")

    _remove_initial_admin()

    op.drop_constraint(op.f("uq_usuario_user_name"), "usuario", type_="unique")
    op.drop_column("usuario", "password_hash")
    op.drop_column("usuario", "user_name")


def _remove_initial_admin() -> None:
    settings = get_settings()
    bind = op.get_bind()

    usuario_table = sa.table("usuario", sa.column("user_name", sa.String))
    bind.execute(
        usuario_table.delete().where(usuario_table.c.user_name == settings.initial_admin_username)
    )
