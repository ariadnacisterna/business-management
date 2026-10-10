from app.constants.http_cache import (
    CACHEABLE_STATUS,
    HASHED_ASSET_CACHE_CONTROL,
    HASHED_ASSETS_PATH_PREFIX,
    HTML_CACHE_CONTROL,
    HTML_MEDIA_TYPE,
)


def cache_control_for(path: str, status_code: int, content_type: str) -> str | None:
    if content_type.startswith(HTML_MEDIA_TYPE):
        return HTML_CACHE_CONTROL
    if path.startswith(HASHED_ASSETS_PATH_PREFIX) and status_code == CACHEABLE_STATUS:
        return HASHED_ASSET_CACHE_CONTROL
    return None
