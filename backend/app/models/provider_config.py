import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ProviderConfig(Base):
    __tablename__ = "providers"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    provider_url: Mapped[str] = mapped_column(
        String(2048), default="", nullable=False
    )
    provider_api_key: Mapped[str] = mapped_column(
        String(512), default="", nullable=False
    )
    provider_model: Mapped[str] = mapped_column(
        String(255), default="", nullable=False
    )
    embedding_model: Mapped[str] = mapped_column(
        String(255), default="", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
