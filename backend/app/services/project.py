from uuid import UUID

from app.core.errors import NotFoundError
from app.models.project import Project
from app.repositories.project import ProjectRepository
from app.schemas.pagination import PaginatedResponse, encode_cursor
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate


class ProjectService:
    def __init__(self, repo: ProjectRepository):
        self._repo = repo

    async def create_project(self, data: ProjectCreate) -> Project:
        project = Project(name=data.name, description=data.description)
        return await self._repo.create(project)

    async def get_project(self, project_id: UUID) -> Project:
        project = await self._repo.get_by_id(project_id)
        if project is None:
            raise NotFoundError("project", str(project_id))
        return project

    async def list_projects(
        self, cursor: str | None = None, limit: int = 20
    ) -> PaginatedResponse[ProjectResponse]:
        # Clamp limit to reasonable range
        limit = max(1, min(limit, 100))
        projects = await self._repo.list_paginated(cursor, limit)

        has_more = len(projects) > limit
        if has_more:
            projects = projects[:limit]

        items = [ProjectResponse.model_validate(p) for p in projects]
        next_cursor = encode_cursor(projects[-1].id) if has_more and projects else None

        return PaginatedResponse(
            items=items,
            next_cursor=next_cursor,
            has_more=has_more,
        )

    async def update_project(self, project_id: UUID, data: ProjectUpdate) -> Project:
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            # Nothing to update, just return current
            return await self.get_project(project_id)

        project = await self._repo.update(project_id, **update_data)
        if project is None:
            raise NotFoundError("project", str(project_id))
        return project

    async def delete_project(self, project_id: UUID) -> None:
        deleted = await self._repo.delete(project_id)
        if not deleted:
            raise NotFoundError("project", str(project_id))

    async def activate_project(self, project_id: UUID) -> Project:
        # Verify project exists first
        await self.get_project(project_id)
        project = await self._repo.activate(project_id)
        if project is None:
            raise NotFoundError("project", str(project_id))
        return project
