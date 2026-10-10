import pytest

from scripts.e2e_server import UnsafeDatabaseError, check_e2e_database_url, e2e_database_url


def test_adds_the_e2e_suffix_to_the_local_database_name():
    url = e2e_database_url("postgresql+psycopg://abuela:abuela@localhost:55432/abuela")
    assert url == "postgresql+psycopg://abuela:abuela@localhost:55432/abuela_e2e"


def test_keeps_a_name_that_already_ends_in_e2e():
    url = e2e_database_url("postgresql+psycopg://abuela:abuela@127.0.0.1:55432/tienda_e2e")
    assert url.endswith("/tienda_e2e")


def test_refuses_a_database_that_is_not_local():
    with pytest.raises(UnsafeDatabaseError):
        e2e_database_url("postgresql+psycopg://user:secret@db.example.com:5432/postgres")


def test_refuses_a_name_without_the_e2e_suffix():
    with pytest.raises(UnsafeDatabaseError):
        check_e2e_database_url("postgresql+psycopg://abuela:abuela@localhost:55432/abuela")
