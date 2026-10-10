import json
import logging
import re
import secrets
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from app.constants.observability import (
    APP_LOGGER_NAME,
    NO_REQUEST_ID,
    REDACTED_TEXT,
    REQUEST_ID_BYTES,
)
from app.core.config import get_settings

current_request_id: ContextVar[str] = ContextVar("current_request_id", default=NO_REQUEST_ID)

_URL_CREDENTIALS_PATTERN = re.compile(r"(?P<scheme>[a-zA-Z][a-zA-Z0-9+.-]*://)[^/\s@]+@")
_STANDARD_RECORD_FIELDS = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def new_request_id() -> str:
    return secrets.token_hex(REQUEST_ID_BYTES).upper()


def _configured_secrets() -> list[str]:
    settings = get_settings()
    candidates = [
        settings.database_url,
        urlsplit(settings.database_url).password,
        settings.initial_admin_password,
        settings.supabase_service_role_key,
    ]
    return sorted({value for value in candidates if value}, key=len, reverse=True)


def redact(text: str) -> str:
    for secret_value in _configured_secrets():
        text = text.replace(secret_value, REDACTED_TEXT)
    return _URL_CREDENTIALS_PATTERN.sub(rf"\g<scheme>{REDACTED_TEXT}@", text)


def _redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, bool | int | float) or value is None:
        return value
    return redact(str(value))


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": current_request_id.get(),
            "message": redact(record.getMessage()),
        }
        for name, value in vars(record).items():
            if name not in _STANDARD_RECORD_FIELDS and name not in entry:
                entry[name] = _redact_value(value)
        if record.exc_info:
            entry["traceback"] = redact(self.formatException(record.exc_info))
        return json.dumps(entry, ensure_ascii=False)


def configure_logging() -> None:
    logger = logging.getLogger(APP_LOGGER_NAME)
    if any(isinstance(handler.formatter, JsonLogFormatter) for handler in logger.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
