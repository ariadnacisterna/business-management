from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    db_pool_size: int = 5
    db_max_overflow: int = 10

    initial_organization_name: str = "Organizacion principal"
    initial_business_name: str = "Negocio principal"
    initial_business_rubro: str = "General"


@lru_cache
def get_settings() -> Settings:
    return Settings()
