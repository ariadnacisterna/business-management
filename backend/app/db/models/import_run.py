from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.limits import NAME_MAX_LENGTH
from app.db.base import Base


class ImportRun(Base):
    __tablename__ = "import_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(NAME_MAX_LENGTH), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_categories_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_units_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_attribute_values_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_products_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_variants_count: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_variants_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by_account_id: Mapped[int] = mapped_column(ForeignKey("account.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
