from sqlalchemy import Column, ForeignKey, Table

from app.db.base import Base

variant_attribute_value = Table(
    "variant_attribute_value",
    Base.metadata,
    Column("variant_id", ForeignKey("variant.id"), primary_key=True),
    Column("attribute_value_id", ForeignKey("attribute_value.id"), primary_key=True),
)
