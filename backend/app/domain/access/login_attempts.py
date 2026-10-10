import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, delete, func, select
from sqlalchemy.orm import Session

from app.constants.access import (
    LOGIN_ATTEMPT_RETENTION_DAYS,
    LOGIN_FAILURE_WINDOW_MINUTES,
    LOGIN_MAX_FAILURES_PER_IP,
    LOGIN_MAX_FAILURES_PER_USER,
    SUSPICIOUS_LOGIN_LOOKBACK_HOURS,
)
from app.constants.limits import USERNAME_MAX_LENGTH
from app.constants.status import LoginOutcome
from app.db.models import Account, LoginAttempt
from app.domain.access.errors import LoginLocked

FAILURE_WINDOW = timedelta(minutes=LOGIN_FAILURE_WINDOW_MINUTES)
SUSPICIOUS_LOGIN_LOOKBACK = timedelta(hours=SUSPICIOUS_LOGIN_LOOKBACK_HOURS)


@dataclass(frozen=True)
class BlockedLoginSummary:
    account: Account
    blocked_attempts: int
    last_blocked_at: datetime


def normalize_attempted_user_name(user_name: str) -> str:
    return user_name.strip().lower()[:USERNAME_MAX_LENGTH]


def _last_success_at(db: Session, user_name: str) -> datetime | None:
    return db.scalar(
        select(func.max(LoginAttempt.attempted_at)).where(
            LoginAttempt.user_name == user_name,
            LoginAttempt.outcome == LoginOutcome.SUCCEEDED.value,
        )
    )


def _locked_until(failure_times: list[datetime], max_failures: int) -> datetime | None:
    if len(failure_times) < max_failures:
        return None
    return failure_times[max_failures - 1] + FAILURE_WINDOW


def _recent_failure_times(
    db: Session, condition: ColumnElement[bool], since: datetime, limit: int
) -> list[datetime]:
    return list(
        db.scalars(
            select(LoginAttempt.attempted_at)
            .where(
                condition,
                LoginAttempt.outcome == LoginOutcome.FAILED.value,
                LoginAttempt.attempted_at > since,
            )
            .order_by(LoginAttempt.attempted_at.desc())
            .limit(limit)
        )
    )


def ensure_login_allowed(db: Session, user_name: str, ip_address: str, now: datetime) -> None:
    window_start = now - FAILURE_WINDOW
    last_success_at = _last_success_at(db, user_name)
    user_since = max(window_start, last_success_at) if last_success_at else window_start

    user_failures = _recent_failure_times(
        db, LoginAttempt.user_name == user_name, user_since, LOGIN_MAX_FAILURES_PER_USER
    )
    ip_failures = _recent_failure_times(
        db, LoginAttempt.ip_address == ip_address, window_start, LOGIN_MAX_FAILURES_PER_IP
    )

    lock_ends = [
        moment
        for moment in (
            _locked_until(user_failures, LOGIN_MAX_FAILURES_PER_USER),
            _locked_until(ip_failures, LOGIN_MAX_FAILURES_PER_IP),
        )
        if moment is not None and moment > now
    ]
    if lock_ends:
        raise LoginLocked(math.ceil((max(lock_ends) - now).total_seconds()))


def record_login_attempt(
    db: Session, user_name: str, ip_address: str, outcome: LoginOutcome, now: datetime
) -> None:
    db.add(
        LoginAttempt(
            user_name=user_name,
            ip_address=ip_address,
            attempted_at=now,
            outcome=outcome.value,
        )
    )


def delete_old_login_attempts(db: Session, now: datetime) -> None:
    cutoff = now - timedelta(days=LOGIN_ATTEMPT_RETENTION_DAYS)
    db.execute(delete(LoginAttempt).where(LoginAttempt.attempted_at < cutoff))


def summarize_recent_blocked_logins(
    db: Session, accounts: list[Account], now: datetime
) -> list[BlockedLoginSummary]:
    accounts_by_user_name = {
        normalize_attempted_user_name(account.user_name): account for account in accounts
    }
    if not accounts_by_user_name:
        return []

    rows = db.execute(
        select(
            LoginAttempt.user_name,
            func.count(LoginAttempt.id),
            func.max(LoginAttempt.attempted_at),
        )
        .where(
            LoginAttempt.user_name.in_(accounts_by_user_name),
            LoginAttempt.outcome == LoginOutcome.BLOCKED.value,
            LoginAttempt.attempted_at > now - SUSPICIOUS_LOGIN_LOOKBACK,
        )
        .group_by(LoginAttempt.user_name)
    ).all()

    summaries = [
        BlockedLoginSummary(
            account=accounts_by_user_name[user_name],
            blocked_attempts=blocked_attempts,
            last_blocked_at=last_blocked_at,
        )
        for user_name, blocked_attempts, last_blocked_at in rows
    ]
    return sorted(summaries, key=lambda summary: summary.last_blocked_at, reverse=True)
