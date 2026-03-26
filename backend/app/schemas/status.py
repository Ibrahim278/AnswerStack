from datetime import datetime

from pydantic import BaseModel


class ProviderStatus(BaseModel):
    configured: bool
    connected: bool
    last_error: str | None = None


class HealthStatus(BaseModel):
    database: bool
    vector_store: bool


class ActiveJobStatus(BaseModel):
    status: str
    progress_current: int
    progress_total: int


class ProjectStatus(BaseModel):
    index_status: str
    documents_total: int
    documents_stale: int
    last_indexed: datetime | None = None
    active_job: ActiveJobStatus | None = None


class SystemStatusResponse(BaseModel):
    status: str  # ready, indexing, misconfigured, degraded, no_documents, stale
    provider: ProviderStatus
    health: HealthStatus
    project: ProjectStatus | None = None
