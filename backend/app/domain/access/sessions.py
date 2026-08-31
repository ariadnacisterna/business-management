from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import generate_csrf_token, generate_session_token
from app.db.models import Sesion


def create_session(db: Session, usuario_id: int) -> Sesion:
    settings = get_settings()
    ahora = datetime.now(UTC)
    sesion = Sesion(
        id=generate_session_token(),
        usuario_id=usuario_id,
        csrf_token=generate_csrf_token(),
        creado_en=ahora,
        expira_en=ahora + timedelta(minutes=settings.session_ttl_minutes),
    )
    db.add(sesion)
    return sesion


def get_valid_session(db: Session, token: str) -> Sesion | None:
    sesion = db.get(Sesion, token)
    if sesion is None:
        return None
    if sesion.expira_en <= datetime.now(UTC):
        db.delete(sesion)
        db.commit()
        return None
    return sesion


def extend_session(db: Session, sesion: Sesion) -> None:
    settings = get_settings()
    sesion.expira_en = datetime.now(UTC) + timedelta(minutes=settings.session_ttl_minutes)
    db.commit()


def delete_session(db: Session, sesion: Sesion) -> None:
    db.delete(sesion)


def delete_sessions_for_user(db: Session, usuario_id: int) -> None:
    db.execute(delete(Sesion).where(Sesion.usuario_id == usuario_id))
