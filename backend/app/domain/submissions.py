import hashlib
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.constants.submission import SUBMISSION_RETENTION_HOURS, SUBMISSION_UNIQUE_CONSTRAINT_NAME
from app.db.models import Submission

SUBMISSION_RETENTION = timedelta(hours=SUBMISSION_RETENTION_HOURS)

ResponseBody = dict[str, Any]


class SubmissionKeyReused(Exception):
    pass


def request_fingerprint(request_data: bytes) -> str:
    return hashlib.sha256(request_data).hexdigest()


def _find_submission(db: Session, account_id: int, key: str) -> Submission | None:
    return db.scalars(
        select(Submission).where(Submission.account_id == account_id, Submission.key == key)
    ).first()


def _previous_response(submission: Submission, operation: str, fingerprint: str) -> ResponseBody:
    if submission.operation != operation or submission.request_fingerprint != fingerprint:
        raise SubmissionKeyReused
    return submission.response_body


def _is_same_key_conflict(error: IntegrityError) -> bool:
    diagnostics = getattr(error.orig, "diag", None)
    return getattr(diagnostics, "constraint_name", None) == SUBMISSION_UNIQUE_CONSTRAINT_NAME


def _delete_expired_submissions(db: Session, account_id: int, now: datetime) -> None:
    expired_ids = (
        select(Submission.id)
        .where(
            Submission.account_id == account_id,
            Submission.created_at < now - SUBMISSION_RETENTION,
        )
        .with_for_update(skip_locked=True)
    )
    db.execute(delete(Submission).where(Submission.id.in_(expired_ids)))


def run_once(
    db: Session,
    account_id: int,
    key: str,
    operation: str,
    fingerprint: str,
    perform: Callable[[], ResponseBody],
) -> ResponseBody:
    previous = _find_submission(db, account_id, key)
    if previous is not None:
        return _previous_response(previous, operation, fingerprint)

    try:
        response_body = perform()
        now = datetime.now(UTC)
        _delete_expired_submissions(db, account_id, now)
        db.add(
            Submission(
                account_id=account_id,
                key=key,
                operation=operation,
                request_fingerprint=fingerprint,
                response_body=response_body,
                created_at=now,
            )
        )
        db.flush()
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if not _is_same_key_conflict(error):
            raise
        return _previous_response(_find_submission(db, account_id, key), operation, fingerprint)
    except BaseException:
        db.rollback()
        raise
    return response_body
