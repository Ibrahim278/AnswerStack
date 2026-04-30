from abc import abstractmethod
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import case, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.project import Project
from app.repositories.base import Repository
from app.schemas.pagination import decode_cursor


class ProjectRepository(Repository[Project]):
    @abstractmethod
    async def list_paginated(self, cursor: str | None, limit: int) -> list[Project]: ...

    @abstractmethod
    async def update(self, id: UUID, **kwargs) -> Project | None: ...

    @abstractmethod
    async def deactivate_all(self) -> None: ...

    @abstractmethod
    async def activate(self, id: UUID) -> Project | None: ...


class SQLAlchemyProjectRepository(ProjectRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_id(self, id: UUID) -> Project | None:
        result = await self._session.execute(
            select(Project).where(Project.id == id)
        )
        return result.scalar_one_or_none()

    async def create(self, entity: Project) -> Project:
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def delete(self, id: UUID) -> bool:
        project = await self.get_by_id(id)
        if project is None:
            return False
        await self._session.delete(project)
        await self._session.flush()
        return True

    async def list_paginated(self, cursor: str | None, limit: int) -> list[Project]:
        query = select(Project).order_by(Project.created_at.desc(), Project.id.desc())

        if cursor:
            cursor_id = decode_cursor(cursor)
            cursor_row = await self.get_by_id(cursor_id)
            if cursor_row is None:
                raise ValidationError("cursor", "Invalid pagination cursor")
            query = query.where(
                (Project.created_at < cursor_row.created_at)
                | (
                    (Project.created_at == cursor_row.created_at)
                    & (Project.id < cursor_id)
                )
            )

        query = query.limit(limit + 1)  # Fetch one extra to detect has_more
        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def update(self, id: UUID, **kwargs) -> Project | None:
        project = await self.get_by_id(id)
        if project is None:
            return None
        for key, value in kwargs.items():
            if hasattr(project, key):
                setattr(project, key, value)
        project.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        await self._session.refresh(project)
        return project

    async def deactivate_all(self) -> None:
        await self._session.execute(
            sa_update(Project).where(Project.is_active == True).values(is_active=False)  # noqa: E712
        )
        await self._session.flush()

    async def activate(self, id: UUID) -> Project | None:
        # Single atomic UPDATE: set is_active=True for the target row,
        # False for all others — no intermediate flush, no race window.
        await self._session.execute(
            sa_update(Project).values(
                is_active=case((Project.id == id, True), else_=False)
            )
        )
        await self._session.flush()
        return await self.get_by_id(id)
