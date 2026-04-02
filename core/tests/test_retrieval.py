"""Tests for RetrievalService two-stage RAG pipeline.

Uses collection_name: str (not project_id: UUID) matching the core API.
Covers empty results, similarity threshold filtering, reranker collapse,
build_source_context formatting, and edge cases.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from answerstack.retrieval import RetrievalService, RetrievedChunk


# ---------------------------------------------------------------------------
# Two-stage retrieval: embed -> search -> rerank -> filter
# ---------------------------------------------------------------------------


async def test_two_stage_retrieval(
    mock_vector_repo, mock_embedding_service, mock_ranker, vector_results
):
    """Full two-stage pipeline: embed query, vector search, rerank, filter."""
    mock_vector_repo.query = MagicMock(return_value=vector_results)

    service = RetrievalService(mock_vector_repo, mock_embedding_service, mock_ranker)

    results = await service.retrieve(
        collection_name="test-collection",
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

    results = await service.retrieve(
        collection_name="test-collection",
        query="What is France?",
        embedding_model="text-embedding-test",
        top_k=5,
        similarity_threshold=0.3,
        reranker_enabled=False,
    )

    assert len(results) >= 1
    for chunk in results:
        assert isinstance(chunk, RetrievedChunk)
        assert chunk.relevance_score >= 0.3

    # Check sorted descending by score
    if len(results) > 1:
        scores = [c.relevance_score for c in results]
        assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# Empty results returns empty list
# ---------------------------------------------------------------------------


async def test_retrieval_no_results_returns_empty(
    mock_vector_repo, mock_embedding_service, mock_ranker
):
    """Empty vector results return empty list."""
    mock_vector_repo.query = MagicMock(return_value={
        "ids": [],
        "documents": [],
        "metadatas": [],
        "distances": [],
    })

    service = RetrievalService(mock_vector_repo, mock_embedding_service, mock_ranker)

    results = await service.retrieve(
        collection_name="test-collection",
        query="Nonexistent topic",
        embedding_model="text-embedding-test",
    )

    assert results == []


# ---------------------------------------------------------------------------
# All results below threshold returns empty
# ---------------------------------------------------------------------------


async def test_retrieval_all_below_threshold(
    mock_vector_repo, mock_embedding_service,
):
    """All results below similarity threshold returns empty list."""
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

    results = await service.retrieve(
        collection_name="test-collection",
        query="Something irrelevant",
        embedding_model="text-embedding-test",
        similarity_threshold=0.3,
        reranker_enabled=True,
    )

    assert results == []
    # Reranker should never be called -- vectors filtered before reranking
    ranker.rerank.assert_not_called()


# ---------------------------------------------------------------------------
# Reranker collapse detection falls back to vector-ranked
# ---------------------------------------------------------------------------


async def test_reranker_collapse_falls_back(
    mock_vector_repo, mock_embedding_service, vector_results
):
    """When reranker scores are uniformly near-zero, fall back to vector order."""
    mock_vector_repo.query = MagicMock(return_value=vector_results)

    collapsed_ranker = MagicMock()
    collapsed_ranker.rerank = MagicMock(side_effect=lambda request: [
        {**p, "score": 0.001} for p in request.passages[:5]
    ])

    service = RetrievalService(mock_vector_repo, mock_embedding_service, collapsed_ranker)

    results = await service.retrieve(
        collection_name="test-collection",
        query="What is France?",
        embedding_model="text-embedding-test",
        top_k=5,
        similarity_threshold=0.3,
        reranker_enabled=True,
    )

    # Should still get results (via vector-ranked fallback)
    assert len(results) >= 1
    # Results should use vector similarity scores (1 - distance)
    for chunk in results:
        assert chunk.relevance_score >= 0.3


# ---------------------------------------------------------------------------
# Retrieval uses collection_name not project_id
# ---------------------------------------------------------------------------


async def test_retrieval_uses_collection_name(
    mock_vector_repo, mock_embedding_service, vector_results
):
    """Verify retrieve() passes collection_name to vector_repo.query."""
    mock_vector_repo.query = MagicMock(return_value=vector_results)

    service = RetrievalService(mock_vector_repo, mock_embedding_service, ranker=None)

    await service.retrieve(
        collection_name="my-custom-collection",
        query="test query",
        embedding_model="model",
        reranker_enabled=False,
    )

    # First positional arg to query should be the collection_name
    call_args = mock_vector_repo.query.call_args
    assert call_args[0][0] == "my-custom-collection"


# ---------------------------------------------------------------------------
# build_source_context
# ---------------------------------------------------------------------------


class TestBuildSourceContext:
    def test_formats_sources_with_page_numbers(self):
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

    def test_empty_chunks_returns_empty_string(self):
        """build_source_context returns empty string for no chunks."""
        assert RetrievalService.build_source_context([]) == ""

    def test_single_chunk(self):
        """build_source_context works with a single chunk."""
        chunks = [
            RetrievedChunk(
                chunk_id="c1",
                document_name="doc.txt",
                chunk_text="Some text.",
                page_number=5,
                relevance_score=0.9,
            ),
        ]
        context = RetrievalService.build_source_context(chunks)
        assert "[Source 1: doc.txt, page 5]" in context
        assert "Some text." in context

    def test_page_number_none_omits_page(self):
        """When page_number is None, the 'page X' part is omitted."""
        chunks = [
            RetrievedChunk(
                chunk_id="c1",
                document_name="doc.md",
                chunk_text="Content.",
                page_number=None,
                relevance_score=0.8,
            ),
        ]
        context = RetrievalService.build_source_context(chunks)
        assert "[Source 1: doc.md]" in context
        assert "page" not in context

    def test_multiple_chunks_separated_by_double_newline(self):
        """Multiple source blocks are separated by double newlines."""
        chunks = [
            RetrievedChunk(chunk_id="c1", document_name="a.txt", chunk_text="A", page_number=1, relevance_score=0.9),
            RetrievedChunk(chunk_id="c2", document_name="b.txt", chunk_text="B", page_number=2, relevance_score=0.8),
        ]
        context = RetrievalService.build_source_context(chunks)
        assert "\n\n" in context
        blocks = context.split("\n\n")
        assert len(blocks) == 2
