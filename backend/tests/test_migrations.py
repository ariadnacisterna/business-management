import pytest
import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import command
from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO, GERENTE
from app.core.config import get_settings
from tests.conftest import alembic_config

SCHEMA_TABLES = {
    "organization",
    "business",
    "role",
    "account",
    "business_access",
    "account_session",
}
PRE_RENAME_SCHEMA_TABLES = {
    "organizacion",
    "negocio",
    "rol",
    "usuario",
    "acceso_a_negocio",
    "sesion",
}
PRE_RENAME_REVISION = "a1f3c9d2e8b7"


def _isolate_from_second_business_env(monkeypatch, request):
    monkeypatch.setenv("INITIAL_BUSINESS_2_NAME", "")
    monkeypatch.setenv("INITIAL_BUSINESS_2_INDUSTRY", "")
    get_settings.cache_clear()
    request.addfinalizer(get_settings.cache_clear)


def test_upgrade_from_empty_database_creates_schema_and_seed_data(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= SCHEMA_TABLES

        with engine.connect() as connection:
            roles = (
                connection.execute(sa.text("SELECT name FROM role ORDER BY name")).scalars().all()
            )
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO, DUENO])

            organization_count = connection.execute(
                sa.text("SELECT count(*) FROM organization")
            ).scalar_one()
            assert organization_count == 1

            business = connection.execute(
                sa.text("SELECT industry, status, organization_id FROM business")
            ).one()
            assert business.status == "active"
            assert business.organization_id is not None

            settings = get_settings()
            accounts = connection.execute(sa.text("SELECT user_name, status FROM account")).all()
            assert len(accounts) == 1
            assert accounts[0].user_name == settings.initial_admin_username
            assert accounts[0].status == "active"

            accesses = connection.execute(
                sa.text(
                    "SELECT ba.status, r.name AS role_name "
                    "FROM business_access ba JOIN role r ON r.id = ba.role_id"
                )
            ).all()
            assert len(accesses) == 1
            assert accesses[0].status == "active"
            assert accesses[0].role_name == DUENO
    finally:
        engine.dispose()

    command.downgrade(config, "base")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert not table_names & SCHEMA_TABLES
    finally:
        engine.dispose()


def test_upgrade_from_pre_rename_schema_renames_tables_columns_and_data(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, PRE_RENAME_REVISION)

    engine = sa.create_engine(postgres_empty_schema)
    try:
        pre_rename_tables = set(inspect(engine).get_table_names())
        assert pre_rename_tables >= PRE_RENAME_SCHEMA_TABLES
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= SCHEMA_TABLES
        assert not table_names & PRE_RENAME_SCHEMA_TABLES

        with engine.connect() as connection:
            settings = get_settings()

            roles = (
                connection.execute(sa.text("SELECT name FROM role ORDER BY name")).scalars().all()
            )
            assert roles == sorted([ADMINISTRADOR, GERENTE, EMPLEADO, DUENO])

            business = connection.execute(
                sa.text("SELECT industry, status, organization_id FROM business")
            ).one()
            assert business.status == "active"
            assert business.organization_id is not None

            accounts = connection.execute(sa.text("SELECT user_name, status FROM account")).all()
            assert len(accounts) == 1
            assert accounts[0].user_name == settings.initial_admin_username
            assert accounts[0].status == "active"

            accesses = connection.execute(
                sa.text(
                    "SELECT ba.status, r.name AS role_name "
                    "FROM business_access ba JOIN role r ON r.id = ba.role_id"
                )
            ).all()
            assert len(accesses) == 1
            assert accesses[0].status == "active"
            assert accesses[0].role_name == DUENO
    finally:
        engine.dispose()

    command.downgrade(config, PRE_RENAME_REVISION)

    engine = sa.create_engine(postgres_empty_schema)
    try:
        table_names = set(inspect(engine).get_table_names())
        assert table_names >= PRE_RENAME_SCHEMA_TABLES
        assert not table_names & SCHEMA_TABLES

        with engine.connect() as connection:
            negocio = connection.execute(sa.text("SELECT estado FROM negocio")).one()
            assert negocio.estado == "activo"

            usuarios = connection.execute(sa.text("SELECT estado FROM usuario")).all()
            assert len(usuarios) == 1
            assert usuarios[0].estado == "activo"
    finally:
        engine.dispose()

    command.downgrade(config, "base")


def test_upgrade_without_second_business_settings_creates_only_one_business(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            business_count = connection.execute(
                sa.text("SELECT count(*) FROM business")
            ).scalar_one()
            assert business_count == 1

            columns = {column["name"] for column in inspect(engine).get_columns("account_session")}
            assert "active_business_id" in columns
    finally:
        engine.dispose()


def test_upgrade_with_second_business_settings_creates_it_and_grants_admin_access(
    postgres_empty_schema, monkeypatch
):
    monkeypatch.setenv("INITIAL_BUSINESS_2_NAME", "Despensa")
    monkeypatch.setenv("INITIAL_BUSINESS_2_INDUSTRY", "Despensa")
    get_settings.cache_clear()

    try:
        config = alembic_config()
        command.upgrade(config, "head")

        engine = sa.create_engine(postgres_empty_schema)
        try:
            with engine.connect() as connection:
                businesses = connection.execute(
                    sa.text("SELECT name, industry, status FROM business ORDER BY id")
                ).all()
                assert len(businesses) == 2
                assert businesses[1].name == "Despensa"
                assert businesses[1].industry == "Despensa"
                assert businesses[1].status == "active"

                accesses = connection.execute(
                    sa.text(
                        "SELECT ba.business_id, ba.status, r.name AS role_name "
                        "FROM business_access ba JOIN role r ON r.id = ba.role_id "
                        "ORDER BY ba.business_id"
                    )
                ).all()
                assert len(accesses) == 2
                assert all(access.status == "active" for access in accesses)
                assert all(access.role_name == DUENO for access in accesses)
        finally:
            engine.dispose()

        command.downgrade(config, "base")

        engine = sa.create_engine(postgres_empty_schema)
        try:
            with engine.connect() as connection:
                table_names = set(inspect(engine).get_table_names())
                assert not table_names & SCHEMA_TABLES
        finally:
            engine.dispose()
    finally:
        get_settings.cache_clear()


def test_font_size_migration_backfills_existing_accounts_and_enforces_the_range(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "c2e6a8f0d4b1")
    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            font_sizes = (
                connection.execute(sa.text("SELECT font_size FROM account")).scalars().all()
            )
            assert font_sizes == [3]

            default = connection.execute(
                sa.text(
                    "SELECT column_default FROM information_schema.columns "
                    "WHERE table_name = 'account' AND column_name = 'font_size'"
                )
            ).scalar_one()
            assert default is None

        with engine.begin() as connection:
            try:
                connection.execute(sa.text("UPDATE account SET font_size = 6"))
            except sa.exc.IntegrityError:
                pass
            else:
                raise AssertionError("font_size fuera de rango fue aceptado")
    finally:
        engine.dispose()

    command.downgrade(config, "c2e6a8f0d4b1")
    command.downgrade(config, "base")


def test_decimal_stock_migration_preserves_existing_integer_values(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()

    command.upgrade(config, "d3f7a1b5c9e2")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.begin() as connection:
            business_id = connection.execute(
                sa.text("SELECT id FROM business LIMIT 1")
            ).scalar_one()
            account_id = connection.execute(sa.text("SELECT id FROM account LIMIT 1")).scalar_one()
            category_id = connection.execute(
                sa.text(
                    "INSERT INTO category "
                    "(business_id, name, status, created_by_account_id, created_at, "
                    "updated_by_account_id, updated_at) "
                    "VALUES (:business_id, 'Categoria migracion', 'active', :account_id, now(), "
                    ":account_id, now()) RETURNING id"
                ),
                {"business_id": business_id, "account_id": account_id},
            ).scalar_one()
            unit_id = connection.execute(
                sa.text(
                    "INSERT INTO unit "
                    "(business_id, name, abbreviation, allows_fraction, status, "
                    "created_by_account_id, created_at, updated_by_account_id, updated_at) "
                    "VALUES (:business_id, 'Unidad migracion', 'um', false, 'active', "
                    ":account_id, now(), :account_id, now()) RETURNING id"
                ),
                {"business_id": business_id, "account_id": account_id},
            ).scalar_one()
            product_id = connection.execute(
                sa.text(
                    "INSERT INTO product "
                    "(business_id, category_id, unit_id, name, status, "
                    "created_by_account_id, created_at, updated_by_account_id, updated_at) "
                    "VALUES (:business_id, :category_id, :unit_id, 'Producto migracion', 'active', "
                    ":account_id, now(), :account_id, now()) RETURNING id"
                ),
                {
                    "business_id": business_id,
                    "category_id": category_id,
                    "unit_id": unit_id,
                    "account_id": account_id,
                },
            ).scalar_one()
            variant_id = connection.execute(
                sa.text(
                    "INSERT INTO variant "
                    "(product_id, is_implicit, quantity, minimum_quantity, status, "
                    "created_by_account_id, created_at, updated_by_account_id, updated_at) "
                    "VALUES (:product_id, true, 42, 7, 'active', :account_id, now(), "
                    ":account_id, now()) RETURNING id"
                ),
                {"product_id": product_id, "account_id": account_id},
            ).scalar_one()
            connection.execute(
                sa.text(
                    "INSERT INTO stock_movement "
                    "(variant_id, quantity_before, quantity_after, created_by_account_id, "
                    "created_at) "
                    "VALUES (:variant_id, 10, 42, :account_id, now())"
                ),
                {"variant_id": variant_id, "account_id": account_id},
            )
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            variant = connection.execute(
                sa.text("SELECT quantity, minimum_quantity FROM variant WHERE id = :id"),
                {"id": variant_id},
            ).one()
            assert variant.quantity == 42
            assert variant.minimum_quantity == 7

            movement = connection.execute(
                sa.text(
                    "SELECT quantity_before, quantity_after FROM stock_movement "
                    "WHERE variant_id = :id"
                ),
                {"id": variant_id},
            ).one()
            assert movement.quantity_before == 10
            assert movement.quantity_after == 42

            variant_columns = {
                column["name"]: column["type"] for column in inspect(engine).get_columns("variant")
            }
            assert variant_columns["quantity"].precision == 13
            assert variant_columns["quantity"].scale == 3
            assert variant_columns["minimum_quantity"].precision == 13
            assert variant_columns["minimum_quantity"].scale == 3
    finally:
        engine.dispose()

    command.downgrade(config, "d3f7a1b5c9e2")

    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.connect() as connection:
            variant = connection.execute(
                sa.text("SELECT quantity, minimum_quantity FROM variant WHERE id = :id"),
                {"id": variant_id},
            ).one()
            assert variant.quantity == 42
            assert variant.minimum_quantity == 7
    finally:
        engine.dispose()

    command.downgrade(config, "base")


INTEGRITY_REVISION = "f3b8d2a6c1e9"
PRE_INTEGRITY_REVISION = "e7b2c4d8f1a6"
NEW_INTEGRITY_CHECKS = ("ck_stock_movement_quantity_changed", "ck_price_effective_range")
EXISTING_INTEGRITY_RULES = (
    "ck_variant_quantity_non_negative",
    "ck_variant_minimum_quantity_non_negative",
    "ck_stock_movement_quantity_before_non_negative",
    "ck_stock_movement_quantity_after_non_negative",
    "ck_price_amount_positive",
    "ck_credit_amount_positive",
)


def _validated_constraints(connection):
    return dict(
        connection.execute(
            sa.text(
                "SELECT conname, convalidated FROM pg_constraint "
                "WHERE connamespace = 'public'::regnamespace"
            )
        ).all()
    )


def _insert_variant_with_movement(connection, quantity_before, quantity_after):
    business_id = connection.execute(sa.text("SELECT id FROM business LIMIT 1")).scalar_one()
    account_id = connection.execute(sa.text("SELECT id FROM account LIMIT 1")).scalar_one()
    parameters = {"business_id": business_id, "account_id": account_id}
    audit = ":account_id, now(), :account_id, now()"
    category_id = connection.execute(
        sa.text(
            "INSERT INTO category (business_id, name, status, created_by_account_id, "
            "created_at, updated_by_account_id, updated_at) VALUES (:business_id, "
            f"'Categoria vieja', 'active', {audit}) RETURNING id"
        ),
        parameters,
    ).scalar_one()
    unit_id = connection.execute(
        sa.text(
            "INSERT INTO unit (business_id, name, abbreviation, allows_fraction, status, "
            "created_by_account_id, created_at, updated_by_account_id, updated_at) VALUES "
            f"(:business_id, 'Unidad vieja', 'uv', false, 'active', {audit}) RETURNING id"
        ),
        parameters,
    ).scalar_one()
    product_id = connection.execute(
        sa.text(
            "INSERT INTO product (business_id, category_id, unit_id, name, status, "
            "created_by_account_id, created_at, updated_by_account_id, updated_at) VALUES "
            f"(:business_id, :category_id, :unit_id, 'Producto viejo', 'active', {audit}) "
            "RETURNING id"
        ),
        {**parameters, "category_id": category_id, "unit_id": unit_id},
    ).scalar_one()
    variant_id = connection.execute(
        sa.text(
            "INSERT INTO variant (product_id, is_implicit, quantity, status, "
            "created_by_account_id, created_at, updated_by_account_id, updated_at) VALUES "
            f"(:product_id, true, :quantity, 'active', {audit}) RETURNING id"
        ),
        {**parameters, "product_id": product_id, "quantity": quantity_after},
    ).scalar_one()
    connection.execute(
        sa.text(
            "INSERT INTO stock_movement (variant_id, quantity_before, quantity_after, "
            "created_by_account_id, created_at) "
            "VALUES (:variant_id, :quantity_before, :quantity_after, :account_id, now())"
        ),
        {
            **parameters,
            "variant_id": variant_id,
            "quantity_before": quantity_before,
            "quantity_after": quantity_after,
        },
    )


def test_integrity_migration_validates_new_rules_on_clean_data_and_keeps_existing_ones(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()
    command.upgrade(config, PRE_INTEGRITY_REVISION)
    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.begin() as connection:
            _insert_variant_with_movement(connection, 0, 5)

        command.upgrade(config, INTEGRITY_REVISION)

        with engine.connect() as connection:
            constraints = _validated_constraints(connection)
            indexes = connection.execute(
                sa.text("SELECT indexname FROM pg_indexes WHERE tablename = 'price'")
            ).scalars()
            assert "uq_price_variant_id_business_id_current" in set(indexes)
        for name in NEW_INTEGRITY_CHECKS + EXISTING_INTEGRITY_RULES:
            assert constraints[name] is True
        assert "submission" in set(inspect(engine).get_table_names())

        command.downgrade(config, PRE_INTEGRITY_REVISION)

        with engine.connect() as connection:
            constraints = _validated_constraints(connection)
        assert not set(NEW_INTEGRITY_CHECKS) & set(constraints)
        assert "submission" not in set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_integrity_migration_leaves_a_rule_unvalidated_when_old_data_breaks_it(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()
    command.upgrade(config, PRE_INTEGRITY_REVISION)
    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.begin() as connection:
            _insert_variant_with_movement(connection, 4, 4)

        command.upgrade(config, INTEGRITY_REVISION)

        with engine.connect() as connection:
            constraints = _validated_constraints(connection)
            movement_count = connection.execute(
                sa.text("SELECT count(*) FROM stock_movement")
            ).scalar_one()
        assert constraints["ck_stock_movement_quantity_changed"] is False
        assert constraints["ck_price_effective_range"] is True
        assert movement_count == 1
    finally:
        engine.dispose()


SALES_REVISION = "b5d9e3a7c1f4"
SALE_PAYMENTS_REVISION = "c4e8a2d6f9b1"


def _insert_old_sale(connection, payment_method, total, customer_id=None):
    account_id = connection.execute(sa.text("SELECT id FROM account LIMIT 1")).scalar_one()
    business_id = connection.execute(sa.text("SELECT id FROM business LIMIT 1")).scalar_one()
    variant_id = connection.execute(sa.text("SELECT id FROM variant LIMIT 1")).scalar_one()
    sale_id = connection.execute(
        sa.text(
            "INSERT INTO sale (business_id, payment_method, customer_id, subtotal, discount, "
            "total, insufficient_stock, created_by_account_id, created_at) VALUES "
            "(:business_id, :payment_method, :customer_id, :total, 0, :total, false, "
            ":account_id, now()) RETURNING id"
        ),
        {
            "business_id": business_id,
            "payment_method": payment_method,
            "customer_id": customer_id,
            "total": total,
            "account_id": account_id,
        },
    ).scalar_one()
    connection.execute(
        sa.text(
            "INSERT INTO sale_line (sale_id, variant_id, quantity, unit_price, line_total, "
            "stock_taken) VALUES (:sale_id, :variant_id, 1, :total, :total, 0)"
        ),
        {"sale_id": sale_id, "variant_id": variant_id, "total": total},
    )
    return sale_id


def _insert_customer(connection):
    account_id = connection.execute(sa.text("SELECT id FROM account LIMIT 1")).scalar_one()
    business_id = connection.execute(sa.text("SELECT id FROM business LIMIT 1")).scalar_one()
    return connection.execute(
        sa.text(
            "INSERT INTO customer (business_id, name, status, created_by_account_id, created_at, "
            "updated_by_account_id, updated_at) VALUES (:business_id, 'Cliente viejo', 'active', "
            ":account_id, now(), :account_id, now()) RETURNING id"
        ),
        {"business_id": business_id, "account_id": account_id},
    ).scalar_one()


def test_sale_payments_migration_turns_each_sale_into_one_payment_and_back(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()
    command.upgrade(config, SALES_REVISION)
    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.begin() as connection:
            _insert_variant_with_movement(connection, 0, 5)
            customer_id = _insert_customer(connection)
            cash = _insert_old_sale(connection, "efectivo", "150.50")
            transfer = _insert_old_sale(connection, "transferencia", "80")
            fiado = _insert_old_sale(connection, "fiado", "200", customer_id)

        command.upgrade(config, SALE_PAYMENTS_REVISION)

        with engine.connect() as connection:
            payments = connection.execute(
                sa.text("SELECT sale_id, method, amount FROM sale_payment ORDER BY sale_id")
            ).all()
            customers = dict(connection.execute(sa.text("SELECT id, customer_id FROM sale")).all())
            line_variants = connection.execute(
                sa.text("SELECT variant_id, description FROM sale_line ORDER BY id")
            ).all()
        assert [(row.sale_id, row.method, str(row.amount)) for row in payments] == [
            (cash, "efectivo", "150.50"),
            (transfer, "transferencia", "80.00"),
            (fiado, "fiado", "200.00"),
        ]
        assert customers[fiado] == customer_id
        assert all(row.variant_id is not None and row.description is None for row in line_variants)
        assert "payment_method" not in {
            column["name"] for column in inspect(engine).get_columns("sale")
        }

        command.downgrade(config, SALES_REVISION)

        with engine.connect() as connection:
            methods = dict(connection.execute(sa.text("SELECT id, payment_method FROM sale")).all())
        assert methods == {cash: "efectivo", transfer: "transferencia", fiado: "fiado"}
        assert "sale_payment" not in set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
    command.downgrade(config, "base")


def test_sale_payments_migration_refuses_to_go_back_when_a_sale_is_split(
    postgres_empty_schema, monkeypatch, request
):
    _isolate_from_second_business_env(monkeypatch, request)
    config = alembic_config()
    command.upgrade(config, SALES_REVISION)
    engine = sa.create_engine(postgres_empty_schema)
    try:
        with engine.begin() as connection:
            _insert_variant_with_movement(connection, 0, 5)
            sale_id = _insert_old_sale(connection, "efectivo", "100")

        command.upgrade(config, SALE_PAYMENTS_REVISION)
        with engine.begin() as connection:
            connection.execute(
                sa.text("UPDATE sale_payment SET amount = 60 WHERE sale_id = :id"), {"id": sale_id}
            )
            connection.execute(
                sa.text(
                    "INSERT INTO sale_payment (sale_id, method, amount) "
                    "VALUES (:id, 'transferencia', 40)"
                ),
                {"id": sale_id},
            )

        with pytest.raises(RuntimeError, match="varias formas de pago"):
            command.downgrade(config, SALES_REVISION)

        with engine.connect() as connection:
            count = connection.execute(sa.text("SELECT count(*) FROM sale_payment")).scalar_one()
        assert count == 2
    finally:
        engine.dispose()
