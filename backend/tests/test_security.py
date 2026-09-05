from app.constants.access import SESSION_TOKEN_HASH_LENGTH
from app.core.security import (
    generate_csrf_token,
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
    verify_token,
)


def test_hash_password_produces_a_verifiable_hash() -> None:
    password = "a-secure-password"

    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password, password_hash)


def test_verify_password_rejects_wrong_password() -> None:
    password_hash = hash_password("a-secure-password")

    assert not verify_password("another-password", password_hash)


def test_verify_password_rejects_malformed_hash() -> None:
    assert not verify_password("any-password", "this-is-not-a-valid-hash")


def test_generate_session_token_and_csrf_token_are_unique_and_unguessable() -> None:
    tokens = {generate_session_token() for _ in range(50)}
    csrf_tokens = {generate_csrf_token() for _ in range(50)}

    assert len(tokens) == 50
    assert len(csrf_tokens) == 50


def test_hash_token_hides_the_token_and_fits_the_stored_column() -> None:
    token = generate_session_token()

    token_hash = hash_token(token)

    assert token_hash != token
    assert len(token_hash) == SESSION_TOKEN_HASH_LENGTH


def test_hash_token_is_deterministic_for_the_same_token() -> None:
    token = generate_session_token()

    assert hash_token(token) == hash_token(token)


def test_hash_token_differs_between_tokens() -> None:
    assert hash_token(generate_session_token()) != hash_token(generate_session_token())


def test_verify_token_accepts_the_token_behind_the_hash() -> None:
    token = generate_csrf_token()

    assert verify_token(token, hash_token(token))


def test_verify_token_rejects_another_token_and_the_stored_hash_itself() -> None:
    token = generate_csrf_token()
    token_hash = hash_token(token)

    assert not verify_token(generate_csrf_token(), token_hash)
    assert not verify_token(token_hash, token_hash)
