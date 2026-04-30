import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class IndexingJobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class IndexingJob(Base):
    __tablename__ = "indexing_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[IndexingJobStatus] = mapped_column(
        Enum(IndexingJobStatus),
        default=IndexingJobStatus.PENDING,
        nullable=False,
    )
    documents_processed: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    documents_total: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    percentage: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    current_document_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        nullable=True,
    )
    error_detail: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
