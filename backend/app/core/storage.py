import httpx

from app.core.config import get_settings


class StorageNotConfigured(Exception):
    pass


class StorageRequestFailed(Exception):
    pass


def _object_url(bucket: str, path: str) -> str:
    settings = get_settings()
    if not settings.supabase_url:
        raise StorageNotConfigured
    base = settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/{bucket}/{path}"


def _public_url(bucket: str, path: str) -> str:
    settings = get_settings()
    if not settings.supabase_url:
        raise StorageNotConfigured
    base = settings.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


def _auth_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise StorageNotConfigured
    return {"Authorization": f"Bearer {settings.supabase_service_role_key}"}


def upload_object(path: str, content: bytes, content_type: str) -> str:
    settings = get_settings()
    if not settings.supabase_storage_bucket:
        raise StorageNotConfigured

    response = httpx.put(
        _object_url(settings.supabase_storage_bucket, path),
        content=content,
        headers={
            **_auth_headers(),
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        timeout=30.0,
    )
    if response.status_code not in (200, 201):
        raise StorageRequestFailed(response.text)

    return _public_url(settings.supabase_storage_bucket, path)


def path_from_public_url(url: str) -> str | None:
    settings = get_settings()
    if not settings.supabase_storage_bucket:
        return None
    marker = f"/storage/v1/object/public/{settings.supabase_storage_bucket}/"
    index = url.find(marker)
    if index == -1:
        return None
    return url[index + len(marker) :]


def delete_object(path: str) -> None:
    settings = get_settings()
    if not settings.supabase_storage_bucket:
        raise StorageNotConfigured

    response = httpx.delete(
        _object_url(settings.supabase_storage_bucket, path),
        headers=_auth_headers(),
        timeout=30.0,
    )
    if response.status_code not in (200, 204):
        raise StorageRequestFailed(response.text)
