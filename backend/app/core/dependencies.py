from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.repositories.project import ProjectRepository, SQLAlchemyProjectRepository
from app.services.project import ProjectService


async def get_project_repository(
    session: AsyncSession = Depends(get_db_session),
) -> ProjectRepository:
    return SQLAlchemyProjectRepository(session)


async def get_project_service(
    repo: ProjectRepository = Depends(get_project_repository),
) -> ProjectService:
    return ProjectService(repo)
