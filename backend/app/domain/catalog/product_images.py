from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.storage import delete_object, path_from_public_url, upload_object
from app.db.models import Product
from app.domain.catalog.errors import ImageTooLarge, InvalidImageType
from app.domain.catalog.products import get_product

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _validate_image(content: bytes, content_type: str) -> str:
    extension = ALLOWED_CONTENT_TYPES.get(content_type)
    if extension is None:
        raise InvalidImageType(f"Tipo de archivo no soportado: {content_type}")
    if len(content) > MAX_IMAGE_SIZE_BYTES:
        raise ImageTooLarge("La imagen supera el tamano maximo de 5MB")
    return extension


def set_product_image(
    db: Session,
    business_id: int,
    product_id: int,
    actor_account_id: int,
    content: bytes,
    content_type: str,
) -> Product:
    product = get_product(db, business_id, product_id)
    extension = _validate_image(content, content_type)

    previous_url = product.image_url
    path = f"products/{product.id}.{extension}"
    public_url = upload_object(path, content, content_type)

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
