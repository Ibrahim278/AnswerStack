"""Indexing API endpoints: build, status, cancel, retry."""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from app.core.dependencies import get_indexing_service, get_project_service
from app.schemas.indexing import (
    IndexingJobResponse,
    IndexingStatusResponse,
    IndexingTriggerResponse,
)
from app.services.indexing import IndexingService, run_indexing_job
from app.services.project import ProjectService

router = APIRouter(prefix="/projects/{project_id}/indexing", tags=["indexing"])


@router.post("/build", status_code=202, response_model=IndexingTriggerResponse)
async def trigger_build(
    project_id: UUID,
    request: Request,
    indexing_service: IndexingService = Depends(get_indexing_service),
    project_service: ProjectService = Depends(get_project_service),
) -> IndexingTriggerResponse:
    """Trigger a full index build for the project.

    Returns 202 Accepted with the new job details. The actual indexing
    runs as a background async task.
    """
    await project_service.get_project(project_id)
    job = await indexing_service.trigger_build(project_id)

    asyncio.create_task(
        run_indexing_job(
            request.app.state.session_factory,
            job.id,
            project_id,
            request.app.state.vector_repo,
            request.app.state.embedding_service,
        )
    )

    return IndexingTriggerResponse.model_validate(job)


@router.get("/status", response_model=IndexingStatusResponse)
async def get_indexing_status(
    project_id: UUID,
    indexing_service: IndexingService = Depends(get_indexing_service),
) -> IndexingStatusResponse:
    """Get the current indexing status and latest job for a project."""
    status = await indexing_service.get_indexing_status(project_id)
    return IndexingStatusResponse(
        index_status=status["index_status"],
        job=IndexingJobResponse.model_validate(status["job"]) if status["job"] else None,
        last_indexed_at=status["last_indexed_at"],
    )


@router.post("/cancel", response_model=IndexingJobResponse)
async def cancel_job(
    project_id: UUID,
    indexing_service: IndexingService = Depends(get_indexing_service),
) -> IndexingJobResponse:
    """Cancel the currently running indexing job for a project."""
    job = await indexing_service.cancel_job(project_id)
    return IndexingJobResponse.model_validate(job)


@router.post("/retry", status_code=202, response_model=IndexingTriggerResponse)
async def retry_job(
    project_id: UUID,
    request: Request,
    indexing_service: IndexingService = Depends(get_indexing_service),
) -> IndexingTriggerResponse:
    """Retry the last failed or cancelled indexing job.

    Creates a new job and launches the background runner.
    """
    job = await indexing_service.retry_job(project_id)

    asyncio.create_task(
        run_indexing_job(
            request.app.state.session_factory,
            job.id,
            project_id,
            request.app.state.vector_repo,
            request.app.state.embedding_service,
        )
    )

    return IndexingTriggerResponse.model_validate(job)
