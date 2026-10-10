from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa

from app.constants.access import (
    LOGIN_ATTEMPT_RETENTION_DAYS,
    LOGIN_FAILURE_WINDOW_MINUTES,
    LOGIN_MAX_FAILURES_PER_IP,
    LOGIN_MAX_FAILURES_PER_USER,
)
from app.constants.status import LoginOutcome
from app.core.config import get_settings
from app.db.models import LoginAttempt

TRUSTED_IP_HEADER = "CF-Connecting-IP"


@pytest.fixture
def trusted_ip_header(monkeypatch):
    monkeypatch.setattr(get_settings(), "client_ip_header", TRUSTED_IP_HEADER)


def _login(client, user_name, password, ip_address=None):
    headers = {TRUSTED_IP_HEADER: ip_address} if ip_address else {}
    return client.post(
        "/auth/login", json={"user_name": user_name, "password": password}, headers=headers
    )


def _admin_credentials():
    settings = get_settings()
    return settings.initial_admin_username, settings.initial_admin_password


def _fail_times(client, user_name, times, ip_address=None):
    for _ in range(times):
        assert _login(client, user_name, "contrasena-equivocada", ip_address).status_code == 401


def _attempts(db_session):
    db_session.expire_all()
    return db_session.scalars(sa.select(LoginAttempt).order_by(LoginAttempt.id)).all()


def _move_attempts_back(db_session, minutes):
    db_session.execute(
        sa.update(LoginAttempt).values(
            attempted_at=LoginAttempt.attempted_at - timedelta(minutes=minutes)
        )
    )
    db_session.commit()


def test_a_few_typing_mistakes_do_not_lock_the_account(client):
    user_name, password = _admin_credentials()

    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER - 1)

    assert _login(client, user_name, password).status_code == 200


def test_a_successful_login_resets_the_failure_count_of_that_user(client):
    user_name, password = _admin_credentials()

    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER - 1)
    assert _login(client, user_name, password).status_code == 200
    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER - 1)

    assert _login(client, user_name, password).status_code == 200


def test_repeated_failures_lock_the_user_even_with_the_right_password(client):
    user_name, password = _admin_credentials()

    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER)
    response = _login(client, user_name, password)

    assert response.status_code == 429
    retry_after_seconds = response.json()["detail"]["retry_after_seconds"]
    assert 0 < retry_after_seconds <= LOGIN_FAILURE_WINDOW_MINUTES * 60
    assert response.headers["retry-after"] == str(retry_after_seconds)
    assert "session_id" not in response.cookies


def test_failures_count_for_the_user_regardless_of_case_and_spaces(client):
    user_name, password = _admin_credentials()

    for variant in (user_name.upper(), f"  {user_name}  ", user_name.capitalize()):
        _login(client, variant, "contrasena-equivocada")
    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER - 3)

    assert _login(client, user_name, password).status_code == 429


def test_the_lock_does_not_reveal_whether_the_user_exists(client):
    existing_user_name, _ = _admin_credentials()

    _fail_times(client, existing_user_name, LOGIN_MAX_FAILURES_PER_USER)
    _fail_times(client, "nadie-se-llama-asi", LOGIN_MAX_FAILURES_PER_USER)

    existing = _login(client, existing_user_name, "otra-cosa")
    missing = _login(client, "nadie-se-llama-asi", "otra-cosa")
    assert existing.status_code == missing.status_code == 429
    assert existing.json()["detail"]["message"] == missing.json()["detail"]["message"]


def test_the_lock_is_temporary(client, db_session):
    user_name, password = _admin_credentials()
    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER)
    assert _login(client, user_name, password).status_code == 429

    _move_attempts_back(db_session, LOGIN_FAILURE_WINDOW_MINUTES + 1)

    assert _login(client, user_name, password).status_code == 200


def test_attempts_during_the_lock_do_not_extend_it(client, db_session):
    user_name, password = _admin_credentials()
    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER)
    _move_attempts_back(db_session, LOGIN_FAILURE_WINDOW_MINUTES - 1)

    for _ in range(3):
        assert _login(client, user_name, "contrasena-equivocada").status_code == 429
    _move_attempts_back(db_session, 2)

    assert _login(client, user_name, password).status_code == 200


def test_the_user_lock_applies_from_any_ip_and_does_not_affect_other_users(
    client, trusted_ip_header
):
    user_name, password = _admin_credentials()
    for index in range(LOGIN_MAX_FAILURES_PER_USER):
        _fail_times(client, user_name, 1, ip_address=f"10.0.0.{index + 1}")

    assert _login(client, user_name, password, ip_address="10.0.1.1").status_code == 429
    assert _login(client, "otra-persona", "algo", ip_address="10.0.1.1").status_code == 401


def test_many_failures_from_one_ip_lock_that_ip_for_every_user(client, trusted_ip_header):
    user_name, password = _admin_credentials()
    for index in range(LOGIN_MAX_FAILURES_PER_IP):
        _fail_times(client, f"usuario-{index}", 1, ip_address="203.0.113.7")

    assert _login(client, user_name, password, ip_address="203.0.113.7").status_code == 429
    assert _login(client, user_name, password, ip_address="198.51.100.2").status_code == 200


def test_every_attempt_is_recorded_with_user_ip_time_and_outcome(client, db_session):
    user_name, password = _admin_credentials()
    before = datetime.now(UTC)

    _fail_times(client, "Alguien", 1)
    assert _login(client, user_name, password).status_code == 200
    _fail_times(client, user_name, LOGIN_MAX_FAILURES_PER_USER)
    assert _login(client, user_name, password).status_code == 429

    attempts = _attempts(db_session)
    assert [attempt.outcome for attempt in attempts] == (
        [LoginOutcome.FAILED.value, LoginOutcome.SUCCEEDED.value]
        + [LoginOutcome.FAILED.value] * LOGIN_MAX_FAILURES_PER_USER
        + [LoginOutcome.BLOCKED.value]
    )
    assert attempts[0].user_name == "alguien"
    assert attempts[1].user_name == user_name.lower()
    assert all(attempt.ip_address == "testclient" for attempt in attempts)
    assert all(attempt.attempted_at >= before for attempt in attempts)


def test_forged_forwarding_headers_are_not_trusted_by_default(client, db_session):
    client.post(
        "/auth/login",
        json={"user_name": "alguien", "password": "algo"},
        headers={"X-Forwarded-For": "1.2.3.4", TRUSTED_IP_HEADER: "5.6.7.8"},
    )

    assert _attempts(db_session)[0].ip_address == "testclient"


def test_old_attempts_are_deleted(client, db_session):
    now = datetime.now(UTC)
    db_session.add_all(
        [
            LoginAttempt(
                user_name="vieja",
                ip_address="10.0.0.1",
                attempted_at=now - timedelta(days=LOGIN_ATTEMPT_RETENTION_DAYS + 1),
                outcome=LoginOutcome.FAILED.value,
            ),
            LoginAttempt(
                user_name="reciente",
                ip_address="10.0.0.1",
                attempted_at=now - timedelta(days=LOGIN_ATTEMPT_RETENTION_DAYS - 1),
                outcome=LoginOutcome.FAILED.value,
            ),
        ]
    )
    db_session.commit()

    _fail_times(client, "alguien", 1)

    remaining = {attempt.user_name for attempt in _attempts(db_session)}
    assert remaining == {"reciente", "alguien"}
