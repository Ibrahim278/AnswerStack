from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_project_service
from app.schemas.pagination import PaginatedResponse
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.project import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", status_code=201, response_model=ProjectResponse)
async def create_project(
    data: ProjectCreate,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Create a new project with a name and optional description."""
    project = await service.create_project(data)
    return ProjectResponse.model_validate(project)


@router.get("", response_model=PaginatedResponse[ProjectResponse])
async def list_projects(
    cursor: str | None = Query(None, description="Pagination cursor from previous response"),
    limit: int = Query(20, ge=1, le=100, description="Number of projects to return"),
    service: ProjectService = Depends(get_project_service),
) -> PaginatedResponse[ProjectResponse]:
    """List all projects with cursor-based pagination, ordered by most recently created."""
    return await service.list_projects(cursor=cursor, limit=limit)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Get a single project by ID."""
    project = await service.get_project(project_id)
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Update a project's name and/or description."""
    project = await service.update_project(project_id, data)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID,
    service: ProjectService = Depends(get_project_service),
) -> None:
    """Delete a project. This is a hard delete -- all associated data will be removed."""
    await service.delete_project(project_id)


@router.post("/{project_id}/activate", response_model=ProjectResponse)
async def activate_project(
    project_id: UUID,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Mark a project as active. Only one project can be active at a time."""
    project = await service.activate_project(project_id)
    return ProjectResponse.model_validate(project)
