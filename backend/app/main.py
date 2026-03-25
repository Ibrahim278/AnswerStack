import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.database import create_engine, create_session_factory
from app.core.errors import AppError, app_error_handler, unhandled_error_handler, validation_error_handler
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(json_output=settings.log_json)

    # Ensure data directory exists for SQLite
    db_path = settings.database_url.replace("sqlite+aiosqlite:///", "")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    engine = create_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    # Ensure document storage directory exists
    doc_storage = Path(settings.document_storage_path)
    doc_storage.mkdir(parents=True, exist_ok=True)

    # Store on app.state for dependency access
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.settings = settings

    logger = structlog.get_logger()

    # Initialize provider service (singleton on app.state)
    from app.services.provider import ProviderService

    provider_service = ProviderService()
    app.state.provider_service = provider_service

    # Attempt initial provider configuration from DB settings
    try:
        from app.repositories.settings import SQLAlchemySettingsRepository

        async with session_factory() as session:
            settings_repo = SQLAlchemySettingsRepository(session)
            db_settings = await settings_repo.get()
            await session.commit()

            if db_settings.provider_url and db_settings.provider_url.strip():
                provider_service.configure(
                    base_url=db_settings.provider_url,
                    api_key=db_settings.provider_api_key,
                )
                # Try to verify provider is reachable (non-blocking)
                is_available = await provider_service.check_provider_available()
                if is_available:
                    logger.info("Provider configured and available", base_url=db_settings.provider_url)
                else:
                    logger.warning(
                        "Provider configured but not reachable (degraded mode)",
                        base_url=db_settings.provider_url,
                    )
            else:
                logger.info("No provider configured, starting in degraded mode")
    except Exception as e:
        logger.warning("Failed to initialize provider at startup", error=str(e))

    # Initialize ChromaDB vector repository
    from app.repositories.vector import ChromaDBVectorRepository

    chromadb_path = "data/chromadb"
    Path(chromadb_path).mkdir(parents=True, exist_ok=True)
    vector_repo = ChromaDBVectorRepository(path=chromadb_path)
    app.state.vector_repo = vector_repo
    logger.info("ChromaDB vector repository initialized", path=chromadb_path)

    # Initialize embedding service (uses provider_service singleton)
    from app.services.embedding import OpenAIEmbeddingService

    embedding_service = OpenAIEmbeddingService(provider_service)
    app.state.embedding_service = embedding_service
    logger.info("Embedding service initialized")

    # Initialize FlashRank reranker (singleton on app.state)
    try:
        from flashrank import Ranker

        ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2", max_length=512)
        app.state.ranker = ranker
        logger.info("FlashRank reranker initialized", model="ms-marco-MiniLM-L-12-v2")
    except Exception as e:
        app.state.ranker = None
        logger.warning("FlashRank reranker not available, reranking disabled", error=str(e))

    # Recover orphaned indexing jobs (RUNNING -> FAILED on startup)
    try:
        from app.repositories.indexing_job import SQLAlchemyIndexingJobRepository

        async with session_factory() as session:
            job_repo = SQLAlchemyIndexingJobRepository(session)
            orphaned_count = await job_repo.mark_orphaned_running_as_failed()
            await session.commit()
            if orphaned_count > 0:
                logger.warning("Recovered orphaned indexing jobs", count=orphaned_count)
    except Exception as e:
        logger.warning("Failed to recover orphaned jobs at startup", error=str(e))

    logger.info("Application started", app_name=settings.app_name, database_url=settings.database_url)

    yield

    # Cleanup
    await engine.dispose()
    logger.info("Application shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
    )

    # Exception handlers
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    # Request ID + logging middleware
    @app.middleware("http")
    async def logging_middleware(request: Request, call_next) -> Response:
        structlog.contextvars.clear_contextvars()
        request_id = str(uuid.uuid4())
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        response: Response = await call_next(request)

        # Attach request_id to response headers for client-side correlation
        response.headers["X-Request-ID"] = request_id

        structlog.contextvars.bind_contextvars(status_code=response.status_code)
        logger = structlog.get_logger()

        if response.status_code >= 500:
            logger.error("Server error")
        elif response.status_code >= 400:
            logger.warning("Client error")
        else:
            logger.info("Request completed")

        return response

    # Routers -- mounted under /api/v1
    app.include_router(api_v1_router, prefix="/api/v1")

    return app


app = create_app()
