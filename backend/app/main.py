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
