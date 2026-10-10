import re
from collections.abc import Callable

from fastapi import Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants.submission import (
    MISSING_SUBMISSION_KEY_DETAIL,
    REUSED_SUBMISSION_KEY_DETAIL,
    SUBMISSION_KEY_DESCRIPTION,
    SUBMISSION_KEY_HEADER_NAME,
    SUBMISSION_KEY_MAX_LENGTH,
    SUBMISSION_KEY_MIN_LENGTH,
    SUBMISSION_KEY_PATTERN,
)
from app.domain import submissions

_SUBMISSION_KEY_REGEX = re.compile(SUBMISSION_KEY_PATTERN)


def require_submission_key(
    submission_key: str | None = Header(
        default=None, alias=SUBMISSION_KEY_HEADER_NAME, description=SUBMISSION_KEY_DESCRIPTION
    ),
) -> str:
    if (
        submission_key is None
        or not SUBMISSION_KEY_MIN_LENGTH <= len(submission_key) <= SUBMISSION_KEY_MAX_LENGTH
        or not _SUBMISSION_KEY_REGEX.fullmatch(submission_key)
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, MISSING_SUBMISSION_KEY_DETAIL)
    return submission_key


def respond_once[ResponseT: BaseModel](
    db: Session,
    account_id: int,
    submission_key: str,
    request: Request,
    request_data: bytes,
    response_model: type[ResponseT],
    perform: Callable[[], ResponseT],
) -> ResponseT:
    try:
        response_body = submissions.run_once(
            db,
            account_id,
            submission_key,
            f"{request.method} {request.url.path}",
            submissions.request_fingerprint(request_data),
            lambda: perform().model_dump(mode="json"),
        )
    except submissions.SubmissionKeyReused as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, REUSED_SUBMISSION_KEY_DETAIL
        ) from exc
    return response_model.model_validate(response_body)
