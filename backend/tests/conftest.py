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


# ---------------------------------------------------------------------------
# Indexing-specific fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_vector_repo():
    """Mock VectorRepository for indexing tests (avoids real ChromaDB)."""
    repo = MagicMock()
    repo.create_collection = MagicMock()
    repo.delete_collection = MagicMock()
    repo.upsert_embeddings = MagicMock()
    repo.collection_exists = MagicMock(return_value=True)
    repo.collection_count = MagicMock(return_value=0)
    return repo


@pytest.fixture
def mock_embedding_service():
    """Mock EmbeddingService that returns deterministic embeddings."""
    service = AsyncMock()
    # Return 384-dimension vectors (matching test embedding model)
    service.embed_texts = AsyncMock(
        side_effect=lambda texts, model: [[0.1] * 384 for _ in texts]
    )
    service.embed_single = AsyncMock(return_value=[0.1] * 384)
    return service


@pytest.fixture
async def async_client_with_indexing(
    async_engine, mock_openai_client, mock_vector_repo, mock_embedding_service
) -> AsyncGenerator[AsyncClient, None]:
    """Create an httpx AsyncClient with mocked provider, vector repo, and embedding service."""
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

        # Add indexing infrastructure
        app.state.vector_repo = mock_vector_repo
        app.state.embedding_service = mock_embedding_service

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        # Allow background tasks (indexing jobs, parsing) to drain before
        # the engine fixture tears down and drops tables.
        await asyncio.sleep(0.5)

        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)


@pytest.fixture
async def project_with_parsed_docs(async_client_with_indexing) -> dict:
    """Create a project with parsed documents ready for indexing."""
    client = async_client_with_indexing

    # Create project
    resp = await client.post("/api/v1/projects", json={"name": "Indexing Test Project"})
    assert resp.status_code == 201
    project_id = resp.json()["id"]

    # Configure settings with embedding model
    resp = await client.put(
        "/api/v1/settings",
        json={
            "embedding_model": "text-embedding-test",
            "chunk_size": 4000,
            "chunk_overlap": 800,
        },
    )
    assert resp.status_code == 200

    # Upload text files
    files = [
        (
            "files",
            (
                "test1.txt",
                b"This is test document one with enough content for chunking. " * 10,
                "text/plain",
            ),
        ),
        (
            "files",
            (
                "test2.txt",
                b"This is test document two with different content for testing. " * 10,
                "text/plain",
            ),
        ),
    ]
    resp = await client.post(f"/api/v1/projects/{project_id}/documents", files=files)
    assert resp.status_code == 202

    # Wait for background parsing to complete (poll pattern from Phase 2 tests)
    for _ in range(20):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/documents")
        docs = resp.json()["items"]
        if all(d["status"] == "parsed" for d in docs):
            break

    return {"project_id": project_id, "client": client}
