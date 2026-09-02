from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants.limits import NAME_MAX_LENGTH
from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.account import Account
    from app.db.models.attribute import Attribute
    from app.db.models.business import Business
    from app.db.models.category import Category
    from app.db.models.product import Product
    from app.db.models.unit import Unit


class Organization(Base):
    __tablename__ = "organization"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)

    businesses: Mapped[list["Business"]] = relationship(back_populates="organization")
    accounts: Mapped[list["Account"]] = relationship(back_populates="organization")
    categories: Mapped[list["Category"]] = relationship(back_populates="organization")
    units: Mapped[list["Unit"]] = relationship(back_populates="organization")
    attributes: Mapped[list["Attribute"]] = relationship(back_populates="organization")
    products: Mapped[list["Product"]] = relationship(back_populates="organization")
