import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHash, VerifyMismatchError

from app.constants.access import CSRF_TOKEN_BYTES, SESSION_TOKEN_BYTES

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHash):
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(CSRF_TOKEN_BYTES)
