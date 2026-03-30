"""Unit tests for RetrievalService two-stage RAG pipeline.

Covers RETR-01 (two-stage retrieval) and CHAT-08 (no-context handling).
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from flashrank import RerankRequest

from app.services.retrieval import RetrievalService, RetrievedChunk


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# RETR-01: Two-stage retrieval (embed -> search -> rerank -> filter)
# ---------------------------------------------------------------------------


async def test_two_stage_retrieval(
    mock_vector_repo, mock_embedding_service, mock_ranker, vector_results
):
    """RETR-01: Full two-stage pipeline: embed query, vector search, rerank, filter."""
    mock_vector_repo.query = MagicMock(return_value=vector_results)

    service = RetrievalService(mock_vector_repo, mock_embedding_service, mock_ranker)
    project_id = uuid4()

    results = await service.retrieve(
        project_id=project_id,
        query="What is the capital of France?",
        embedding_model="text-embedding-test",
        top_k=5,
        initial_k=20,
        similarity_threshold=0.3,
        reranker_enabled=True,
    )

    # Verify embed_single was called
    mock_embedding_service.embed_single.assert_called_once_with(
        "What is the capital of France?", "text-embedding-test"
    )

    # Verify vector_repo.query was called with n_results=20
    mock_vector_repo.query.assert_called_once()
    call_kwargs = mock_vector_repo.query.call_args
    assert call_kwargs[1]["n_results"] == 20 or call_kwargs[0][2] == 20

    # Verify ranker.rerank was called
    assert mock_ranker.rerank.called

    # Verify results are RetrievedChunk instances
    assert isinstance(results, list)
    assert all(isinstance(c, RetrievedChunk) for c in results)
    assert len(results) <= 5


# ---------------------------------------------------------------------------
# Retrieval without reranker (fallback path)
# ---------------------------------------------------------------------------


async def test_retrieval_without_reranker(
    mock_vector_repo, mock_embedding_service, vector_results
):
    """Fallback path: no reranker, use cosine distance conversion."""
    mock_vector_repo.query = MagicMock(return_value=vector_results)

    service = RetrievalService(mock_vector_repo, mock_embedding_service, ranker=None)
    project_id = uuid4()

    results = await service.retrieve(
        project_id=project_id,
        query="What is France?",
        embedding_model="text-embedding-test",
        top_k=5,
        similarity_threshold=0.3,
        reranker_enabled=False,
    )

    # Results use cosine distance conversion (1 - distance)
    assert len(results) >= 1
    for chunk in results:
        assert isinstance(chunk, RetrievedChunk)
        # Similarity should be 1 - distance, all >= threshold
        assert chunk.relevance_score >= 0.3

    # Check sorted descending by score
    if len(results) > 1:
        scores = [c.relevance_score for c in results]
        assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# CHAT-08: No results returns empty list
# ---------------------------------------------------------------------------


async def test_retrieval_no_results_returns_empty(
    mock_vector_repo, mock_embedding_service, mock_ranker
):
    """CHAT-08: Empty vector results return empty list."""
    mock_vector_repo.query = MagicMock(return_value={
        "ids": [],
        "documents": [],
        "metadatas": [],
        "distances": [],
    })

    service = RetrievalService(mock_vector_repo, mock_embedding_service, mock_ranker)
    project_id = uuid4()

    results = await service.retrieve(
        project_id=project_id,
        query="Nonexistent topic",
        embedding_model="text-embedding-test",
    )

    assert results == []


# ---------------------------------------------------------------------------
# CHAT-08: All results below threshold returns empty
# ---------------------------------------------------------------------------


async def test_retrieval_all_below_threshold(
    mock_vector_repo, mock_embedding_service,
):
    """CHAT-08: All results below similarity threshold returns empty list.

    The similarity threshold (1.0 - cosine_distance) is the only hard quality
    gate. When no vectors pass, the result is empty regardless of reranker.
    """
    # Vector results with high distances → low similarity (all below 0.3)
    low_quality_results = {
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
        "distances": [0.8, 0.9, 0.95],  # similarities: 0.2, 0.1, 0.05
    }
    mock_vector_repo.query = MagicMock(return_value=low_quality_results)

    ranker = MagicMock()
    service = RetrievalService(mock_vector_repo, mock_embedding_service, ranker)
    project_id = uuid4()

    results = await service.retrieve(
        project_id=project_id,
        query="Something irrelevant",
        embedding_model="text-embedding-test",
        similarity_threshold=0.3,
        reranker_enabled=True,
    )

    assert results == []
    # Reranker should never be called — vectors filtered before reranking
    ranker.rerank.assert_not_called()


# ---------------------------------------------------------------------------
# build_source_context
# ---------------------------------------------------------------------------


async def test_build_source_context():
    """build_source_context formats chunks with numbered source headers."""
    chunks = [
        RetrievedChunk(
            chunk_id="c1",
            document_name="geography.txt",
            chunk_text="Paris is the capital of France.",
            page_number=1,
            relevance_score=0.9,
        ),
        RetrievedChunk(
            chunk_id="c2",
            document_name="landmarks.txt",
            chunk_text="The Eiffel Tower is iconic.",
            page_number=None,
            relevance_score=0.8,
        ),
    ]

    context = RetrievalService.build_source_context(chunks)

    assert "[Source 1: geography.txt, page 1]" in context
    assert "Paris is the capital of France." in context
    assert "[Source 2: landmarks.txt]" in context
    assert "The Eiffel Tower is iconic." in context
    # page info omitted for None
    assert "page None" not in context


async def test_build_source_context_empty():
    """build_source_context returns empty string for no chunks."""
    assert RetrievalService.build_source_context([]) == ""
