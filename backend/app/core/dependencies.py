from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.config import get_settings
from app.repositories.chat import ChatRepository, SQLAlchemyChatRepository
from app.repositories.document import DocumentRepository, SQLAlchemyDocumentRepository
from app.repositories.indexing_job import IndexingJobRepository, SQLAlchemyIndexingJobRepository
from app.repositories.project import ProjectRepository, SQLAlchemyProjectRepository
from app.repositories.provider_config import ProviderConfigRepository, SQLAlchemyProviderConfigRepository
from app.repositories.settings import SettingsRepository, SQLAlchemySettingsRepository
from app.services.chat import ChatService
from app.services.document import DocumentService
from app.services.indexing import IndexingService
from app.services.project import ProjectService
from app.services.settings import SettingsService


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
    project_repo: ProjectRepository = Depends(get_project_repository),
) -> DocumentService:
    return DocumentService(repo, get_settings(), project_repo)


async def get_provider_config_repository(
    session: AsyncSession = Depends(get_db_session),
) -> ProviderConfigRepository:
    return SQLAlchemyProviderConfigRepository(session)


async def get_settings_repository(
    session: AsyncSession = Depends(get_db_session),
) -> SettingsRepository:
    return SQLAlchemySettingsRepository(session)


async def get_settings_service(
    repo: SettingsRepository = Depends(get_settings_repository),
) -> SettingsService:
    return SettingsService(repo)


async def get_indexing_job_repository(
    session: AsyncSession = Depends(get_db_session),
) -> IndexingJobRepository:
    return SQLAlchemyIndexingJobRepository(session)


async def get_indexing_service(
    request: Request,
    job_repo: IndexingJobRepository = Depends(get_indexing_job_repository),
    doc_repo: DocumentRepository = Depends(get_document_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    settings_repo: SettingsRepository = Depends(get_settings_repository),
) -> IndexingService:
    return IndexingService(
        job_repo,
        doc_repo,
        project_repo,
        settings_repo,
        request.app.state.vector_repo,
    )


async def get_chat_repository(
    session: AsyncSession = Depends(get_db_session),
) -> ChatRepository:
    return SQLAlchemyChatRepository(session)


async def get_chat_service(
    repo: ChatRepository = Depends(get_chat_repository),
) -> ChatService:
    return ChatService(repo)
