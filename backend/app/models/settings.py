import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

SETTINGS_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=lambda: SETTINGS_ID,
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
    temperature: Mapped[float] = mapped_column(
        Float, default=0.7, nullable=False
    )
    system_prompt: Mapped[str] = mapped_column(
        Text,
        default="You are a helpful assistant that answers questions based on the provided context. Always cite your sources.",
        nullable=False,
    )
    chunk_size: Mapped[int] = mapped_column(
        Integer, default=4000, nullable=False
    )
    chunk_overlap: Mapped[int] = mapped_column(
        Integer, default=800, nullable=False
    )
    top_k: Mapped[int] = mapped_column(
        Integer, default=5, nullable=False
    )
    similarity_threshold: Mapped[float] = mapped_column(
        Float, default=0.3, nullable=False
    )
    reranker_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    provider_capabilities: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
