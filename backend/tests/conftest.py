import asyncio
import os
import tempfile
from collections.abc import AsyncGenerator
from uuid import UUID

import pymupdf
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.main import create_app
from app.models.base import Base


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_engine():
    """Create an in-memory async SQLite engine for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def async_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create an async session for direct repository/service testing."""
    session_factory = async_sessionmaker(async_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest.fixture
async def async_client(async_engine) -> AsyncGenerator[AsyncClient, None]:
    """Create an httpx AsyncClient with a test app using in-memory DB.

    Uses a temporary directory for document storage to prevent
    filesystem pollution in the repo's data/ directory during tests.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Clear settings cache so fresh settings pick up env overrides
        get_settings.cache_clear()

        # Point document storage to temp directory
        os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

        app = create_app()

        # Override the session factory to use in-memory engine
        session_factory = async_sessionmaker(async_engine, expire_on_commit=False)
        app.state.engine = async_engine
        app.state.session_factory = session_factory

        # Also override settings on app.state so background tasks use temp dir
        app.state.settings = get_settings()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        # Cleanup env var and settings cache
        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)


@pytest.fixture
async def project_id(async_client) -> UUID:
    """Create a test project and return its ID."""
    resp = await async_client.post("/api/v1/projects", json={"name": "Test Project"})
    assert resp.status_code == 201
    return UUID(resp.json()["id"])


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    """Create a minimal valid PDF for testing."""
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "This is a test PDF document.\n\n"
        "It has some content for testing parsing and chunking.",
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
