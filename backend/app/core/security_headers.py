from urllib.parse import urlsplit

from app.constants.security_headers import (
    BLOB_SOURCE,
    CONTENT_TYPE_OPTIONS,
    DATA_SOURCE,
    FRAME_OPTIONS,
    NONE_SOURCE,
    REFERRER_POLICY,
    SELF_SOURCE,
    STRICT_TRANSPORT_SECURITY,
)
from app.core.config import get_settings


def _image_storage_origin() -> str | None:
    storage_url = get_settings().supabase_url
    if not storage_url:
        return None
    parts = urlsplit(storage_url)
    if not parts.scheme or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


def build_content_security_policy() -> str:
    image_sources = [SELF_SOURCE, DATA_SOURCE, BLOB_SOURCE]
    storage_origin = _image_storage_origin()
    if storage_origin:
        image_sources.append(storage_origin)

    directives = {
        "default-src": [SELF_SOURCE],
        "script-src": [SELF_SOURCE],
        "style-src": [SELF_SOURCE],
        "img-src": image_sources,
        "font-src": [SELF_SOURCE],
        "connect-src": [SELF_SOURCE],
        "object-src": [NONE_SOURCE],
        "base-uri": [SELF_SOURCE],
        "form-action": [SELF_SOURCE],
        "frame-ancestors": [NONE_SOURCE],
    }
    return "; ".join(f"{name} {' '.join(sources)}" for name, sources in directives.items())


def build_security_headers(include_content_security_policy: bool) -> dict[str, str]:
    headers = {
        "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY,
        "X-Content-Type-Options": CONTENT_TYPE_OPTIONS,
        "X-Frame-Options": FRAME_OPTIONS,
        "Referrer-Policy": REFERRER_POLICY,
    }
    if include_content_security_policy:
        headers["Content-Security-Policy"] = build_content_security_policy()
    return headers
