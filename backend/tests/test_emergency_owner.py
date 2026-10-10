import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from app.constants.roles import DUENO, EMPLEADO, GERENTE
from app.constants.status import EntityStatus
from app.core.config import get_settings
from app.core.security import verify_password
from app.db.models import Account, AccountSession, Business, BusinessAccess
from app.domain.access import accounts
from app.domain.access.sessions import create_session
from scripts import emergency_owner

NEW_PASSWORD = "Clave-nueva-1"
OLD_PASSWORD = "Clave-vieja-1"


def _run_script(monkeypatch, connection_url, visible_answers, hidden_answers):
    hidden = iter([connection_url, *hidden_answers])
    visible = iter(visible_answers)
    monkeypatch.setattr(emergency_owner, "getpass", lambda prompt="": next(hidden))
    monkeypatch.setattr("builtins.input", lambda prompt="": next(visible))
    emergency_owner.main()


def _supabase_style_url(test_url):
    return make_url(test_url).set(drivername="postgresql").render_as_string(hide_password=False)


def _first_business(db):
    return db.scalars(select(Business).order_by(Business.id)).first()


def _business_count(db):
    return db.scalar(select(func.count()).select_from(Business))


def _account(db, user_name):
    db.expire_all()
    return db.scalars(select(Account).where(Account.user_name == user_name)).first()


def _accesses(db, account):
    return list(db.scalars(select(BusinessAccess).where(BusinessAccess.account_id == account.id)))


def _session_count(db, account):
    return db.scalar(
        select(func.count())
        .select_from(AccountSession)
        .where(AccountSession.account_id == account.id)
    )


def _assert_owner_of_every_business(db, account):
    accesses = _accesses(db, account)
    assert len(accesses) == _business_count(db)
    assert {access.role.name for access in accesses} == {DUENO}
    assert {access.status for access in accesses} == {EntityStatus.ACTIVE.value}


def _existing_account(db, user_name, role_name, sessions=0, status=EntityStatus.ACTIVE.value):
    account = accounts.create_account(
        db, _first_business(db), "Cuenta previa", user_name, OLD_PASSWORD, role_name, DUENO
    )
    account.status = status
    for _ in range(sessions):
        create_session(db, account.id)
    db.commit()
    return account


def test_creates_an_active_owner_with_access_to_every_business(
    monkeypatch, db_session, postgres_empty_schema
):
    _run_script(
        monkeypatch,
        _supabase_style_url(postgres_empty_schema),
        ["nueva-duena", "Nueva Duena", "si"],
        [NEW_PASSWORD, NEW_PASSWORD],
    )

    account = _account(db_session, "nueva-duena")
    assert account is not None
    assert account.name == "Nueva Duena"
    assert account.status == EntityStatus.ACTIVE.value
    assert verify_password(NEW_PASSWORD, account.password_hash)
    _assert_owner_of_every_business(db_session, account)


def test_reactivates_an_inactive_account_and_closes_its_sessions(
    monkeypatch, db_session, postgres_empty_schema
):
    account = _existing_account(
        db_session, "duena-inactiva", DUENO, sessions=2, status=EntityStatus.INACTIVE.value
    )

    _run_script(
        monkeypatch, postgres_empty_schema, ["duena-inactiva", "si"], [NEW_PASSWORD, NEW_PASSWORD]
    )

    account = _account(db_session, "duena-inactiva")
    assert account.status == EntityStatus.ACTIVE.value
    assert verify_password(NEW_PASSWORD, account.password_hash)
    assert _session_count(db_session, account) == 0
    _assert_owner_of_every_business(db_session, account)


def test_promotes_an_account_with_another_role_to_owner(
    monkeypatch, db_session, postgres_empty_schema
):
    account = _existing_account(db_session, "gerenta-promovida", GERENTE, sessions=1)

    _run_script(
        monkeypatch,
        postgres_empty_schema,
        ["gerenta-promovida", "si"],
        [NEW_PASSWORD, NEW_PASSWORD],
    )

    account = _account(db_session, "gerenta-promovida")
    assert account.name == "Cuenta previa"
    assert _session_count(db_session, account) == 0
    _assert_owner_of_every_business(db_session, account)


def test_promotes_the_initial_administrator(monkeypatch, db_session, postgres_empty_schema):
    user_name = get_settings().initial_admin_username

    _run_script(monkeypatch, postgres_empty_schema, [user_name, "si"], [NEW_PASSWORD, NEW_PASSWORD])

    account = _account(db_session, user_name)
    assert verify_password(NEW_PASSWORD, account.password_hash)
    _assert_owner_of_every_business(db_session, account)


def test_rejects_a_password_that_breaks_the_rules_without_changing_anything(
    monkeypatch, db_session, postgres_empty_schema
):
    account = _existing_account(db_session, "empleada-clave-debil", EMPLEADO, sessions=1)

    with pytest.raises(SystemExit) as raised:
        _run_script(
            monkeypatch,
            postgres_empty_schema,
            ["empleada-clave-debil"],
            ["sinmayuscula1", "sinmayuscula1"],
        )

    assert "No se cambió nada" in str(raised.value)
    account = _account(db_session, "empleada-clave-debil")
    assert verify_password(OLD_PASSWORD, account.password_hash)
    assert _session_count(db_session, account) == 1
    assert {access.role.name for access in _accesses(db_session, account)} == {EMPLEADO}


def test_rejects_a_weak_password_for_a_new_account(monkeypatch, db_session, postgres_empty_schema):
    with pytest.raises(SystemExit):
        _run_script(
            monkeypatch, postgres_empty_schema, ["cuenta-corta", "Cuenta corta"], ["Ab1", "Ab1"]
        )

    assert _account(db_session, "cuenta-corta") is None


def test_rejects_passwords_that_do_not_match(monkeypatch, db_session, postgres_empty_schema):
    with pytest.raises(SystemExit) as raised:
        _run_script(
            monkeypatch,
            postgres_empty_schema,
            ["otra-duena", "Otra Duena"],
            [NEW_PASSWORD, "Clave-nueva-2"],
        )

    assert "no coinciden" in str(raised.value)
    assert _account(db_session, "otra-duena") is None


@pytest.mark.parametrize("answer", ["", "no", "s", "sii"])
def test_cancelling_without_confirmation_changes_nothing(
    monkeypatch, db_session, postgres_empty_schema, answer
):
    account = _existing_account(
        db_session, "gerenta-inactiva", GERENTE, sessions=1, status=EntityStatus.INACTIVE.value
    )

    _run_script(
        monkeypatch, postgres_empty_schema, ["gerenta-inactiva", answer], [NEW_PASSWORD] * 2
    )

    account = _account(db_session, "gerenta-inactiva")
    assert account.status == EntityStatus.INACTIVE.value
    assert verify_password(OLD_PASSWORD, account.password_hash)
    assert _session_count(db_session, account) == 1
    assert len(_accesses(db_session, account)) == 1
    assert {access.role.name for access in _accesses(db_session, account)} == {GERENTE}


@pytest.mark.parametrize("answer", ["si", "Sí", " SI "])
def test_accepts_the_confirmation_with_or_without_accent(
    monkeypatch, db_session, postgres_empty_schema, answer
):
    _run_script(
        monkeypatch,
        postgres_empty_schema,
        ["duena-confirmada", "Duena confirmada", answer],
        [NEW_PASSWORD, NEW_PASSWORD],
    )

    assert _account(db_session, "duena-confirmada") is not None


def test_cancelling_a_new_account_creates_nothing(monkeypatch, db_session, postgres_empty_schema):
    _run_script(
        monkeypatch,
        postgres_empty_schema,
        ["duena-cancelada", "Duena cancelada", "no"],
        [NEW_PASSWORD, NEW_PASSWORD],
    )

    assert _account(db_session, "duena-cancelada") is None


@pytest.mark.parametrize(
    "raw_url",
    [
        "postgresql://usuario:Secreta-1@servidor.example:5432/postgres",
        "postgresql+psycopg://usuario:Secreta-1@servidor.example:5432/postgres",
        "  postgres://usuario:Secreta-1@servidor.example:5432/postgres  ",
    ],
)
def test_connection_url_accepts_supabase_and_render_formats(raw_url):
    url = emergency_owner.sqlalchemy_connection_url(raw_url)

    assert url.drivername == emergency_owner.SQLALCHEMY_DRIVER
    assert url.host == "servidor.example"
    assert url.password == "Secreta-1"


@pytest.mark.parametrize(
    "raw_url", ["", "Secreta-1", "mysql://usuario:Secreta-1@servidor/base", "postgresql://"]
)
def test_connection_url_rejects_other_formats_without_showing_it(raw_url):
    with pytest.raises(SystemExit) as raised:
        emergency_owner.sqlalchemy_connection_url(raw_url)

    assert "Secreta-1" not in str(raised.value)


def test_connection_failure_does_not_show_the_connection(monkeypatch):
    with pytest.raises(SystemExit) as raised:
        _run_script(monkeypatch, "postgresql://usuario:Secreta-1@127.0.0.1:1/postgres", [], [])

    assert "No se pudo conectar" in str(raised.value)
    assert "Secreta-1" not in str(raised.value)
    assert "127.0.0.1" not in str(raised.value)
