from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.limits import NOMBRE_MAX_LENGTH
from app.db.base import Base


class Rol(Base):
    __tablename__ = "rol"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(NOMBRE_MAX_LENGTH), nullable=False, unique=True)
