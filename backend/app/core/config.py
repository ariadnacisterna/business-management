from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.constants.access import RENDER_CLIENT_IP_HEADER

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8")

    database_url: str
    db_pool_size: int = 5
    db_max_overflow: int = 10

    initial_organization_name: str = "Organizacion principal"
    initial_business_name: str = "Negocio principal"
    initial_business_industry: str = "General"
    initial_business_2_name: str | None = None
    initial_business_2_industry: str | None = None

    initial_admin_name: str = "Administrador principal"
    initial_admin_username: str
    initial_admin_password: str

    session_ttl_minutes: int = 720
    cookie_secure: bool = True

    render: bool = False
    client_ip_header: str | None = None
    enable_api_docs: bool = False

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str | None = None

    @property
    def session_cookie_secure(self) -> bool:
        return self.cookie_secure or self.render

    @property
    def trusted_client_ip_header(self) -> str | None:
        if self.client_ip_header:
            return self.client_ip_header
        if self.render:
            return RENDER_CLIENT_IP_HEADER
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
