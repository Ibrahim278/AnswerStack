"""Shared test fixtures for core/answerstack tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_provider_service():
    """Mock ProviderService for unit tests."""
    provider = MagicMock()
    provider.is_configured = True
    provider._client = AsyncMock()
    return provider


@pytest.fixture
def mock_vector_repo():
    """Mock VectorRepository for unit tests."""
    repo = MagicMock()
    repo.create_collection = MagicMock()
    repo.delete_collection = MagicMock()
    repo.query = MagicMock(return_value={
        "ids": [], "documents": [], "metadatas": [], "distances": []
    })
    return repo


@pytest.fixture
def mock_embedding_service():
    """Mock EmbeddingService for unit tests."""
    service = AsyncMock()
    service.embed_single = AsyncMock(return_value=[0.1] * 384)
    service.embed_texts = AsyncMock(return_value=[[0.1] * 384])
    return service


@pytest.fixture
def mock_ranker():
    """Mock FlashRank Ranker for retrieval tests."""
    ranker = MagicMock()

    def mock_rerank(request):
        # Return passages with scores, sorted descending
        return [
            {**p, "score": 0.9 - i * 0.1}
            for i, p in enumerate(request.passages[:5])
        ]

    ranker.rerank = MagicMock(side_effect=mock_rerank)
    return ranker


@pytest.fixture
def vector_results():
    """Standard vector query results for testing."""
    return {
        "ids": ["chunk-1", "chunk-2", "chunk-3"],
        "documents": [
            "Paris is the capital of France.",
            "France is a country in Western Europe.",
            "The Eiffel Tower is located in Paris.",
        ],
        "metadatas": [
            {"document_name": "geography.txt", "document_id": "doc-1", "chunk_index": 0, "page_number": 1},
            {"document_name": "geography.txt", "document_id": "doc-1", "chunk_index": 1, "page_number": 2},
            {"document_name": "landmarks.txt", "document_id": "doc-2", "chunk_index": 0},
        ],
        "distances": [0.1, 0.3, 0.5],
    }
