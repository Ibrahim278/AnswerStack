from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.config import get_settings
from app.repositories.document import DocumentRepository, SQLAlchemyDocumentRepository
from app.repositories.project import ProjectRepository, SQLAlchemyProjectRepository
from app.services.document import DocumentService
from app.services.project import ProjectService


async def get_project_repository(
    session: AsyncSession = Depends(get_db_session),
) -> ProjectRepository:
    return SQLAlchemyProjectRepository(session)


async def get_project_service(
    repo: ProjectRepository = Depends(get_project_repository),
) -> ProjectService:
    return ProjectService(repo)


async def get_document_repository(
    session: AsyncSession = Depends(get_db_session),
) -> DocumentRepository:
    return SQLAlchemyDocumentRepository(session)


async def get_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> DocumentService:
    return DocumentService(repo, get_settings())
