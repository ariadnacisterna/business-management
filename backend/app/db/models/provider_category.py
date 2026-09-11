from sqlalchemy import Column, ForeignKey, Table

from app.db.base import Base

provider_category = Table(
    "provider_category",
    Base.metadata,
    Column("provider_id", ForeignKey("provider.id"), primary_key=True),
    Column("category_id", ForeignKey("category.id"), primary_key=True),
)
