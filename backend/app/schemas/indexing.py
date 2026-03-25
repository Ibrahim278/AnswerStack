from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class IndexingJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    status: str
    documents_processed: int
    documents_total: int
    percentage: float
    current_document_id: UUID | None
    error_detail: dict | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class IndexingStatusResponse(BaseModel):
    index_status: str  # not_indexed, indexing, indexed, stale
    job: IndexingJobResponse | None
    last_indexed_at: datetime | None


class IndexingTriggerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    status: str
    created_at: datetime
