"""rename identifiers to english

Revision ID: c8d927a0baa9
Revises: a1f3c9d2e8b7
Create Date: 2026-08-30 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "c8d927a0baa9"
down_revision: str | None = "a1f3c9d2e8b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.rename_table("organizacion", "organization")
    op.execute("ALTER SEQUENCE organizacion_id_seq RENAME TO organization_id_seq")
    op.alter_column("organization", "nombre", new_column_name="name")
    op.execute("ALTER TABLE organization RENAME CONSTRAINT pk_organizacion TO pk_organization")

    op.rename_table("rol", "role")
    op.execute("ALTER SEQUENCE rol_id_seq RENAME TO role_id_seq")
    op.alter_column("role", "nombre", new_column_name="name")
    op.execute("ALTER TABLE role RENAME CONSTRAINT pk_rol TO pk_role")
    op.execute("ALTER TABLE role RENAME CONSTRAINT uq_rol_nombre TO uq_role_name")

    op.rename_table("negocio", "business")
    op.execute("ALTER SEQUENCE negocio_id_seq RENAME TO business_id_seq")
    op.alter_column("business", "organizacion_id", new_column_name="organization_id")
    op.alter_column("business", "nombre", new_column_name="name")
    op.alter_column("business", "rubro", new_column_name="industry")
    op.alter_column("business", "estado", new_column_name="status")
    op.execute("ALTER TABLE business RENAME CONSTRAINT pk_negocio TO pk_business")
    op.execute(
        "ALTER TABLE business RENAME CONSTRAINT fk_negocio_organizacion_id_organizacion "
        "TO fk_business_organization_id_organization"
    )
    op.drop_constraint(op.f("ck_negocio_estado_valido"), "business", type_="check")
    op.execute("UPDATE business SET status = 'active' WHERE status = 'activo'")
    op.execute("UPDATE business SET status = 'inactive' WHERE status = 'inactivo'")
    op.create_check_constraint(
        op.f("ck_business_status_valid"), "business", "status IN ('active', 'inactive')"
    )

    op.rename_table("usuario", "account")
    op.execute("ALTER SEQUENCE usuario_id_seq RENAME TO account_id_seq")
    op.alter_column("account", "organizacion_id", new_column_name="organization_id")
    op.alter_column("account", "nombre", new_column_name="name")
    op.alter_column("account", "estado", new_column_name="status")
    op.execute("ALTER TABLE account RENAME CONSTRAINT pk_usuario TO pk_account")
    op.execute(
        "ALTER TABLE account RENAME CONSTRAINT fk_usuario_organizacion_id_organizacion "
        "TO fk_account_organization_id_organization"
    )
    op.execute("ALTER TABLE account RENAME CONSTRAINT uq_usuario_user_name TO uq_account_user_name")
    op.drop_constraint(op.f("ck_usuario_estado_valido"), "account", type_="check")
    op.execute("UPDATE account SET status = 'active' WHERE status = 'activo'")
    op.execute("UPDATE account SET status = 'inactive' WHERE status = 'inactivo'")
    op.create_check_constraint(
        op.f("ck_account_status_valid"), "account", "status IN ('active', 'inactive')"
    )

    op.rename_table("acceso_a_negocio", "business_access")
    op.execute("ALTER SEQUENCE acceso_a_negocio_id_seq RENAME TO business_access_id_seq")
    op.alter_column("business_access", "usuario_id", new_column_name="account_id")
    op.alter_column("business_access", "negocio_id", new_column_name="business_id")
    op.alter_column("business_access", "rol_id", new_column_name="role_id")
    op.alter_column("business_access", "estado", new_column_name="status")
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT pk_acceso_a_negocio TO pk_business_access"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT fk_acceso_a_negocio_usuario_id_usuario "
        "TO fk_business_access_account_id_account"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT fk_acceso_a_negocio_negocio_id_negocio "
        "TO fk_business_access_business_id_business"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT fk_acceso_a_negocio_rol_id_rol "
        "TO fk_business_access_role_id_role"
    )
    op.execute(
        "ALTER TABLE business_access "
        "RENAME CONSTRAINT uq_acceso_a_negocio_usuario_id_negocio_id "
        "TO uq_business_access_account_id_business_id"
    )
    op.drop_constraint(op.f("ck_acceso_a_negocio_estado_valido"), "business_access", type_="check")
    op.execute("UPDATE business_access SET status = 'active' WHERE status = 'activo'")
    op.execute("UPDATE business_access SET status = 'inactive' WHERE status = 'inactivo'")
    op.create_check_constraint(
        op.f("ck_business_access_status_valid"),
        "business_access",
        "status IN ('active', 'inactive')",
    )

    op.rename_table("sesion", "account_session")
    op.alter_column("account_session", "usuario_id", new_column_name="account_id")
    op.alter_column("account_session", "creado_en", new_column_name="created_at")
    op.alter_column("account_session", "expira_en", new_column_name="expires_at")
    op.execute("ALTER TABLE account_session RENAME CONSTRAINT pk_sesion TO pk_account_session")
    op.execute(
        "ALTER TABLE account_session RENAME CONSTRAINT fk_sesion_usuario_id_usuario "
        "TO fk_account_session_account_id_account"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE account_session RENAME CONSTRAINT fk_account_session_account_id_account "
        "TO fk_sesion_usuario_id_usuario"
    )
    op.execute("ALTER TABLE account_session RENAME CONSTRAINT pk_account_session TO pk_sesion")
    op.alter_column("account_session", "expires_at", new_column_name="expira_en")
    op.alter_column("account_session", "created_at", new_column_name="creado_en")
    op.alter_column("account_session", "account_id", new_column_name="usuario_id")
    op.rename_table("account_session", "sesion")

    op.drop_constraint(op.f("ck_business_access_status_valid"), "business_access", type_="check")
    op.execute("UPDATE business_access SET status = 'activo' WHERE status = 'active'")
    op.execute("UPDATE business_access SET status = 'inactivo' WHERE status = 'inactive'")
    op.create_check_constraint(
        op.f("ck_acceso_a_negocio_estado_valido"),
        "business_access",
        "status IN ('activo', 'inactivo')",
    )
    op.execute(
        "ALTER TABLE business_access "
        "RENAME CONSTRAINT uq_business_access_account_id_business_id "
        "TO uq_acceso_a_negocio_usuario_id_negocio_id"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT fk_business_access_role_id_role "
        "TO fk_acceso_a_negocio_rol_id_rol"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT fk_business_access_business_id_business "
        "TO fk_acceso_a_negocio_negocio_id_negocio"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT fk_business_access_account_id_account "
        "TO fk_acceso_a_negocio_usuario_id_usuario"
    )
    op.execute(
        "ALTER TABLE business_access RENAME CONSTRAINT pk_business_access TO pk_acceso_a_negocio"
    )
    op.alter_column("business_access", "status", new_column_name="estado")
    op.alter_column("business_access", "role_id", new_column_name="rol_id")
    op.alter_column("business_access", "business_id", new_column_name="negocio_id")
    op.alter_column("business_access", "account_id", new_column_name="usuario_id")
    op.execute("ALTER SEQUENCE business_access_id_seq RENAME TO acceso_a_negocio_id_seq")
    op.rename_table("business_access", "acceso_a_negocio")

    op.drop_constraint(op.f("ck_account_status_valid"), "account", type_="check")
    op.execute("UPDATE account SET status = 'activo' WHERE status = 'active'")
    op.execute("UPDATE account SET status = 'inactivo' WHERE status = 'inactive'")
    op.create_check_constraint(
        op.f("ck_usuario_estado_valido"), "account", "status IN ('activo', 'inactivo')"
    )
    op.execute("ALTER TABLE account RENAME CONSTRAINT uq_account_user_name TO uq_usuario_user_name")
    op.execute(
        "ALTER TABLE account RENAME CONSTRAINT fk_account_organization_id_organization "
        "TO fk_usuario_organizacion_id_organizacion"
    )
    op.execute("ALTER TABLE account RENAME CONSTRAINT pk_account TO pk_usuario")
    op.alter_column("account", "status", new_column_name="estado")
    op.alter_column("account", "name", new_column_name="nombre")
    op.alter_column("account", "organization_id", new_column_name="organizacion_id")
    op.execute("ALTER SEQUENCE account_id_seq RENAME TO usuario_id_seq")
    op.rename_table("account", "usuario")

    op.drop_constraint(op.f("ck_business_status_valid"), "business", type_="check")
    op.execute("UPDATE business SET status = 'activo' WHERE status = 'active'")
    op.execute("UPDATE business SET status = 'inactivo' WHERE status = 'inactive'")
    op.create_check_constraint(
        op.f("ck_negocio_estado_valido"), "business", "status IN ('activo', 'inactivo')"
    )
    op.execute(
        "ALTER TABLE business RENAME CONSTRAINT fk_business_organization_id_organization "
        "TO fk_negocio_organizacion_id_organizacion"
    )
    op.execute("ALTER TABLE business RENAME CONSTRAINT pk_business TO pk_negocio")
    op.alter_column("business", "status", new_column_name="estado")
    op.alter_column("business", "industry", new_column_name="rubro")
    op.alter_column("business", "name", new_column_name="nombre")
    op.alter_column("business", "organization_id", new_column_name="organizacion_id")
    op.execute("ALTER SEQUENCE business_id_seq RENAME TO negocio_id_seq")
    op.rename_table("business", "negocio")

    op.execute("ALTER TABLE role RENAME CONSTRAINT uq_role_name TO uq_rol_nombre")
    op.execute("ALTER TABLE role RENAME CONSTRAINT pk_role TO pk_rol")
    op.alter_column("role", "name", new_column_name="nombre")
    op.execute("ALTER SEQUENCE role_id_seq RENAME TO rol_id_seq")
    op.rename_table("role", "rol")

    op.execute("ALTER TABLE organization RENAME CONSTRAINT pk_organization TO pk_organizacion")
    op.alter_column("organization", "name", new_column_name="nombre")
    op.execute("ALTER SEQUENCE organization_id_seq RENAME TO organizacion_id_seq")
    op.rename_table("organization", "organizacion")
