import asyncio
import os
import tempfile
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock
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


@pytest.fixture
def mock_openai_client():
    """Mock AsyncOpenAI client for provider tests."""
    client = AsyncMock()

    # Mock models.list()
    mock_model = MagicMock()
    mock_model.id = "test-model-1"
    mock_model.owned_by = "test-owner"
    mock_model_2 = MagicMock()
    mock_model_2.id = "text-embedding-test"
    mock_model_2.owned_by = "test-owner"
    mock_models_response = MagicMock()
    mock_models_response.data = [mock_model, mock_model_2]
    client.models.list = AsyncMock(return_value=mock_models_response)

    # Mock chat.completions.create()
    mock_choice = MagicMock()
    mock_choice.message.content = "test response"
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    client.chat.completions.create = AsyncMock(return_value=mock_completion)

    # Mock embeddings.create()
    mock_embedding_data = MagicMock()
    mock_embedding_data.embedding = [0.1] * 384
    mock_embed_response = MagicMock()
    mock_embed_response.data = [mock_embedding_data]
    client.embeddings.create = AsyncMock(return_value=mock_embed_response)

    # Mock with_options to return self (for test timeouts)
    client.with_options = MagicMock(return_value=client)

    return client


@pytest.fixture
async def async_client_with_provider(async_engine, mock_openai_client) -> AsyncGenerator[AsyncClient, None]:
    """Create an httpx AsyncClient with a mocked provider service."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        get_settings.cache_clear()
        os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

        app = create_app()
        session_factory = async_sessionmaker(async_engine, expire_on_commit=False)
        app.state.engine = async_engine
        app.state.session_factory = session_factory
        app.state.settings = get_settings()

        # Configure provider service with mock client
        from app.services.provider import ProviderService

        provider_service = ProviderService()
        provider_service._client = mock_openai_client
        provider_service._current_base_url = "http://mock-provider:1234/v1"
        provider_service._current_api_key = "mock-key"
        app.state.provider_service = provider_service

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)
