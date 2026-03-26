"""System status endpoint: composed view of provider, health, and project state."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.dependencies import (
    get_document_repository,
    get_indexing_service,
    get_settings_service,
)
from app.repositories.document import DocumentRepository
from app.schemas.status import (
    ActiveJobStatus,
    HealthStatus,
    ProjectStatus,
    ProviderStatus,
    SystemStatusResponse,
)
from app.services.indexing import IndexingService
from app.services.settings import SettingsService

logger = structlog.get_logger()

router = APIRouter(prefix="/status", tags=["status"])


@router.get("", response_model=SystemStatusResponse)
async def get_system_status(
    request: Request,
    project_id: str | None = Query(None),
    session: AsyncSession = Depends(get_db_session),
    settings_service: SettingsService = Depends(get_settings_service),
    indexing_service: IndexingService = Depends(get_indexing_service),
    doc_repo: DocumentRepository = Depends(get_document_repository),
) -> SystemStatusResponse:
    """Return composed system status with provider, health, and optional project info.

    The top-level ``status`` field is derived from subsystem states:
    - **misconfigured** -- provider URL not set
    - **degraded** -- database or vector store unhealthy
    - **indexing** -- an active indexing job is running/pending for the given project
    - **no_documents** -- the given project has zero documents
    - **stale** -- stale documents or stale index detected
    - **ready** -- everything healthy and up to date
    """

    # ------------------------------------------------------------------
    # 1. Provider status
    # ------------------------------------------------------------------
    provider_configured = False
    provider_connected = False
    provider_last_error: str | None = None

    try:
        settings = await settings_service.get_settings()
        provider_configured = bool(settings.provider_url and settings.provider_url.strip())
    except Exception as exc:
        logger.warning("Failed to read settings for status", error=str(exc))

    try:
        provider_service = getattr(request.app.state, "provider_service", None)
        if provider_service is not None and provider_service.is_configured:
            provider_connected = True
        elif provider_configured:
            provider_last_error = "Provider configured but service not initialised"
    except Exception as exc:
        provider_last_error = str(exc)
        logger.warning("Failed to check provider status", error=str(exc))

    provider = ProviderStatus(
        configured=provider_configured,
        connected=provider_connected,
        last_error=provider_last_error,
    )

    # ------------------------------------------------------------------
    # 2. Health status
    # ------------------------------------------------------------------
    db_healthy = True  # If we reached here, DB session is alive
    vector_healthy = False

    try:
        vector_repo = getattr(request.app.state, "vector_repo", None)
        vector_healthy = vector_repo is not None
    except Exception as exc:
        logger.warning("Vector store health check failed", error=str(exc))

    health = HealthStatus(database=db_healthy, vector_store=vector_healthy)

    # ------------------------------------------------------------------
    # 3. Project status (when project_id provided)
    # ------------------------------------------------------------------
    project_status: ProjectStatus | None = None
    parsed_project_id: UUID | None = None

    if project_id is not None:
        try:
            parsed_project_id = UUID(project_id)
        except ValueError:
            from app.core.errors import ValidationError

            raise ValidationError("project_id", "Invalid UUID format")

        try:
            idx_status = await indexing_service.get_indexing_status(parsed_project_id)

            # Count total documents
            all_docs = await doc_repo.list_by_project(parsed_project_id, None, 10_000)
            documents_total = len(all_docs)

            # Count stale documents
            stale_statuses = {"stale", "reindex_required"}
            documents_stale = sum(
                1 for d in all_docs if d.status.value in stale_statuses
            )

            # Active job info
            active_job: ActiveJobStatus | None = None
            if idx_status["job"] is not None:
                job = idx_status["job"]
                if job.status.value in ("pending", "running"):
                    active_job = ActiveJobStatus(
                        status=job.status.value,
                        progress_current=job.documents_processed,
                        progress_total=job.documents_total,
                    )

            project_status = ProjectStatus(
                index_status=idx_status["index_status"],
                documents_total=documents_total,
                documents_stale=documents_stale,
                last_indexed=idx_status["last_indexed_at"],
                active_job=active_job,
            )
        except Exception as exc:
            logger.warning(
                "Failed to fetch project status",
                project_id=project_id,
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # 4. Overall status derivation
    # ------------------------------------------------------------------
    overall_status = _derive_overall_status(
        provider=provider,
        health=health,
        project=project_status,
    )

    return SystemStatusResponse(
        status=overall_status,
        provider=provider,
        health=health,
        project=project_status,
    )


def _derive_overall_status(
    *,
    provider: ProviderStatus,
    health: HealthStatus,
    project: ProjectStatus | None,
) -> str:
    """Compute the single top-level status string from subsystem states."""

    if not provider.configured:
        return "misconfigured"

    if not health.database or not health.vector_store:
        return "degraded"

    if project is not None:
        if project.active_job is not None and project.active_job.status in (
            "running",
            "pending",
        ):
            return "indexing"

        if project.documents_total == 0:
            return "no_documents"

        if project.documents_stale > 0 or project.index_status == "stale":
            return "stale"

    return "ready"
