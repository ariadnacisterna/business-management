from datetime import UTC, datetime
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.core.storage import delete_object, path_from_public_url, upload_object
from app.db.models import Product
from app.domain.catalog.errors import ImageTooLarge, InvalidImageType
from app.domain.catalog.products import get_product

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

JPEG_SIGNATURE = b"\xff\xd8\xff"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
RIFF_SIGNATURE = b"RIFF"
WEBP_SIGNATURE = b"WEBP"
WEBP_SIGNATURE_OFFSET = 8


class ImageFormat(NamedTuple):
    content_type: str
    extension: str


JPEG_FORMAT = ImageFormat("image/jpeg", "jpg")
PNG_FORMAT = ImageFormat("image/png", "png")
WEBP_FORMAT = ImageFormat("image/webp", "webp")


def _is_webp(content: bytes) -> bool:
    webp_signature_end = WEBP_SIGNATURE_OFFSET + len(WEBP_SIGNATURE)
    return (
        content.startswith(RIFF_SIGNATURE)
        and content[WEBP_SIGNATURE_OFFSET:webp_signature_end] == WEBP_SIGNATURE
    )


def detect_image_format(content: bytes) -> ImageFormat | None:
    if content.startswith(JPEG_SIGNATURE):
        return JPEG_FORMAT
    if content.startswith(PNG_SIGNATURE):
        return PNG_FORMAT
    if _is_webp(content):
        return WEBP_FORMAT
    return None


def _validate_image(content: bytes) -> ImageFormat:
    if len(content) > MAX_IMAGE_SIZE_BYTES:
        raise ImageTooLarge("La imagen supera el tamano maximo de 5MB")
    image_format = detect_image_format(content)
    if image_format is None:
        raise InvalidImageType("El archivo no es una imagen JPG, PNG o WEBP")
    return image_format


def set_product_image(
    db: Session,
    business_id: int,
    product_id: int,
    actor_account_id: int,
    content: bytes,
) -> Product:
    product = get_product(db, business_id, product_id)
    image_format = _validate_image(content)

    previous_url = product.image_url
    path = f"products/{product.id}.{image_format.extension}"
    public_url = upload_object(path, content, image_format.content_type)

    if previous_url:
        previous_path = path_from_public_url(previous_url)
        if previous_path and previous_path != path:
            delete_object(previous_path)

    product.image_url = public_url
    product.updated_by_account_id = actor_account_id
    product.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(product)
    return product


def remove_product_image(
    db: Session,
    business_id: int,
    product_id: int,
    actor_account_id: int,
) -> Product:
    product = get_product(db, business_id, product_id)

    if product.image_url:
        path = path_from_public_url(product.image_url)
        if path:
            delete_object(path)

    product.image_url = None
    product.updated_by_account_id = actor_account_id
    product.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(product)
    return product
