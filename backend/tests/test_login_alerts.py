from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa

from app.constants.access import CSRF_HEADER_NAME, SUSPICIOUS_LOGIN_LOOKBACK_HOURS
from app.constants.roles import ADMINISTRADOR, DUENO, EMPLEADO
from app.constants.status import EntityStatus, LoginOutcome
from app.core.config import get_settings
from app.db.models import Account, Business, BusinessAccess, LoginAttempt, Role

ACCOUNT_PASSWORD = "Clave-segura-1"
ALERTS_PATH = "/accounts/login-alerts"


def _login(client, user_name, password=ACCOUNT_PASSWORD):
    response = client.post("/auth/login", json={"user_name": user_name, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies


def _owner_cookies(client):
    settings = get_settings()
    return _login(client, settings.initial_admin_username, settings.initial_admin_password)


def _create_account(client, cookies, user_name, role):
    response = client.post(
        "/accounts",
        json={
            "name": f"Persona {user_name}",
            "user_name": user_name,
            "initial_password": ACCOUNT_PASSWORD,
            "role": role,
        },
        cookies=cookies,
        headers={CSRF_HEADER_NAME: cookies["csrf_token"]},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _record_attempts(db_session, user_name, outcome, times, hours_ago=0):
    attempted_at = datetime.now(UTC) - timedelta(hours=hours_ago)
    for _ in range(times):
        db_session.add(
            LoginAttempt(
                user_name=user_name,
                ip_address="203.0.113.7",
                attempted_at=attempted_at,
                outcome=outcome.value,
            )
        )
    db_session.commit()


def _alerts(client, cookies):
    response = client.get(ALERTS_PATH, cookies=cookies)
    assert response.status_code == 200, response.text
    return {alert["user_name"]: alert for alert in response.json()}


@pytest.fixture
def other_business_account(db_session):
    first_business = db_session.scalars(sa.select(Business).order_by(Business.id)).first()
    other_business = Business(
        organization_id=first_business.organization_id,
        name="Otro negocio de prueba",
        industry="General",
        status=EntityStatus.ACTIVE.value,
    )
    account = Account(
        organization_id=first_business.organization_id,
        name="Persona de otro negocio",
        user_name="cuenta-otro-negocio",
        password_hash="sin-uso",
        status=EntityStatus.ACTIVE.value,
    )
    db_session.add_all([other_business, account])
    db_session.flush()
    roles = {role.name: role for role in db_session.scalars(sa.select(Role))}
    owner = db_session.scalars(
        sa.select(Account).where(Account.user_name == get_settings().initial_admin_username)
    ).one()
    db_session.add_all(
        [
            BusinessAccess(
                account_id=account.id,
                business_id=other_business.id,
                role_id=roles[EMPLEADO].id,
                status=EntityStatus.ACTIVE.value,
            ),
            BusinessAccess(
                account_id=owner.id,
                business_id=other_business.id,
                role_id=roles[DUENO].id,
                status=EntityStatus.ACTIVE.value,
            ),
        ]
    )
    db_session.commit()
    return account


def test_accounts_blocked_in_the_last_day_are_listed_with_how_many_times(client, db_session):
    owner_cookies = _owner_cookies(client)
    _create_account(client, owner_cookies, "cuenta-empleada", EMPLEADO)
    _create_account(client, owner_cookies, "cuenta-tranquila", EMPLEADO)
    _record_attempts(db_session, "cuenta-empleada", LoginOutcome.FAILED, 5)
    _record_attempts(db_session, "cuenta-empleada", LoginOutcome.BLOCKED, 3)
    _record_attempts(db_session, "cuenta-tranquila", LoginOutcome.FAILED, 4)

    alerts = _alerts(client, owner_cookies)

    assert set(alerts) == {"cuenta-empleada"}
    assert alerts["cuenta-empleada"]["blocked_attempts"] == 3
    assert alerts["cuenta-empleada"]["name"] == "Persona cuenta-empleada"
    assert alerts["cuenta-empleada"]["last_blocked_at"]


def test_blocks_older_than_the_lookback_are_not_listed(client, db_session):
    owner_cookies = _owner_cookies(client)
    _create_account(client, owner_cookies, "cuenta-empleada", EMPLEADO)
    _record_attempts(
        db_session,
        "cuenta-empleada",
        LoginOutcome.BLOCKED,
        2,
        hours_ago=SUSPICIOUS_LOGIN_LOOKBACK_HOURS + 1,
    )

    assert _alerts(client, owner_cookies) == {}


def test_blocks_for_names_that_are_not_accounts_are_not_listed(client, db_session):
    owner_cookies = _owner_cookies(client)
    _record_attempts(db_session, "nadie-con-este-nombre", LoginOutcome.BLOCKED, 4)

    assert _alerts(client, owner_cookies) == {}


def test_real_lockouts_show_up_in_the_alert(client):
    owner_cookies = _owner_cookies(client)
    _create_account(client, owner_cookies, "cuenta-atacada", EMPLEADO)
    for _ in range(6):
        client.post("/auth/login", json={"user_name": "Cuenta-Atacada", "password": "mala"})

    alerts = _alerts(client, owner_cookies)

    assert alerts["cuenta-atacada"]["blocked_attempts"] == 1


def test_an_administrator_only_sees_accounts_of_the_active_business(
    client, db_session, other_business_account
):
    owner_cookies = _owner_cookies(client)
    _create_account(client, owner_cookies, "cuenta-administradora", ADMINISTRADOR)
    _create_account(client, owner_cookies, "cuenta-empleada", EMPLEADO)
    _record_attempts(db_session, "cuenta-empleada", LoginOutcome.BLOCKED, 1)
    _record_attempts(db_session, other_business_account.user_name, LoginOutcome.BLOCKED, 2)

    administrator_alerts = _alerts(client, _login(client, "cuenta-administradora"))
    owner_alerts = _alerts(client, owner_cookies)

    assert set(administrator_alerts) == {"cuenta-empleada"}
    assert set(owner_alerts) == {"cuenta-empleada", other_business_account.user_name}
