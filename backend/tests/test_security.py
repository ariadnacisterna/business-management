from app.core.security import (
    generate_csrf_token,
    generate_session_token,
    hash_password,
    verify_password,
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
