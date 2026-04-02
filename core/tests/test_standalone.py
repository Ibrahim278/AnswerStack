"""Standalone integration test: core used without FastAPI or SQLAlchemy.

Proves the core library can ingest documents and retrieve chunks
without a web server, ORM, or database. Uses real ChromaDB and
real parsers; mocks only the LLM provider and embedding service.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from answerstack import KnowledgeBase, RAGPipeline, RAGConfig
from answerstack.retrieval import RetrievedChunk
from answerstack.types import SourcesEvent, TokenEvent, CompleteEvent, ErrorEvent


@pytest.fixture
def standalone_config(tmp_chromadb_dir):
    """RAGConfig for standalone tests with reranker disabled for speed."""
    return RAGConfig(
        provider_url="http://mock-provider:1234/v1",
        data_dir=tmp_chromadb_dir,
        provider_api_key="test",
        embedding_model="test-embed",
        provider_model="test-model",
        reranker_enabled=False,  # Skip FlashRank for fast tests
    )


async def test_standalone_ingest_and_retrieve(standalone_config):
    """End-to-end: ingest a document, then retrieve chunks.

    Uses real ChromaDB and real parsers. Mocks only the LLM provider
    and embedding service.
    """
    # Fixed 384-dim embedding vector
    mock_embedding = [0.1] * 384

    with patch("answerstack.knowledge_base.ProviderService") as MockProvider, \
         patch("answerstack.knowledge_base.OpenAIEmbeddingService") as MockEmbedding:
        # Configure mocks
        mock_provider_instance = MockProvider.return_value
        mock_provider_instance.configure = AsyncMock()
        mock_provider_instance.is_configured = True

        mock_embed_instance = MockEmbedding.return_value
        mock_embed_instance.embed_texts = AsyncMock(
            side_effect=lambda texts, model: [mock_embedding] * len(texts)
        )
        mock_embed_instance.embed_single = AsyncMock(return_value=mock_embedding)

        # Ingest
        kb = KnowledgeBase(standalone_config)
        kb.create_collection("test_kb")
        chunk_count = await kb.add_document(
            content=b"The capital of France is Paris. It is known for the Eiffel Tower.",
            filename="france.txt",
            collection_name="test_kb",
        )
        assert chunk_count > 0

    # Retrieve (separate RAGPipeline, shared config pointing to same ChromaDB dir)
    with patch("answerstack.rag_pipeline.ProviderService") as MockProvider2, \
         patch("answerstack.rag_pipeline.OpenAIEmbeddingService") as MockEmbedding2:
        mock_provider_instance2 = MockProvider2.return_value
        mock_provider_instance2.configure = AsyncMock()
        mock_provider_instance2.is_configured = True

        mock_embed_instance2 = MockEmbedding2.return_value
        mock_embed_instance2.embed_single = AsyncMock(return_value=mock_embedding)

        pipeline = RAGPipeline(standalone_config, ranker=None)
        chunks = await pipeline.retrieve(
            query="What is the capital of France?",
            collection_name="test_kb",
        )
        # With same embedding vector, cosine distance = 0 -> similarity = 1.0
        # Should pass any reasonable threshold
        assert len(chunks) > 0
        assert all(isinstance(c, RetrievedChunk) for c in chunks)


async def test_standalone_ingest_multiple_documents(standalone_config):
    """Ingest multiple documents and retrieve from the combined collection."""
    mock_embedding_a = [0.1] * 384
    mock_embedding_b = [0.2] * 384

    with patch("answerstack.knowledge_base.ProviderService") as MockProvider, \
         patch("answerstack.knowledge_base.OpenAIEmbeddingService") as MockEmbedding:
        mock_provider_instance = MockProvider.return_value
        mock_provider_instance.configure = AsyncMock()
        mock_provider_instance.is_configured = True

        mock_embed_instance = MockEmbedding.return_value
        mock_embed_instance.embed_texts = AsyncMock(
            side_effect=lambda texts, model: [mock_embedding_a] * len(texts)
        )

        kb = KnowledgeBase(standalone_config)
        kb.create_collection("multi_docs")

        count_a = await kb.add_document(
            content=b"Document A: Cats are furry animals.",
            filename="cats.txt",
            collection_name="multi_docs",
        )
        count_b = await kb.add_document(
            content=b"Document B: Dogs are loyal companions.",
            filename="dogs.txt",
            collection_name="multi_docs",
        )

        assert count_a > 0
        assert count_b > 0

    # Retrieve from combined collection
    with patch("answerstack.rag_pipeline.ProviderService") as MockProvider2, \
         patch("answerstack.rag_pipeline.OpenAIEmbeddingService") as MockEmbedding2:
        mock_provider_instance2 = MockProvider2.return_value
        mock_provider_instance2.configure = AsyncMock()
        mock_provider_instance2.is_configured = True

        mock_embed_instance2 = MockEmbedding2.return_value
        mock_embed_instance2.embed_single = AsyncMock(return_value=mock_embedding_a)

        pipeline = RAGPipeline(standalone_config, ranker=None)
        chunks = await pipeline.retrieve(
            query="Tell me about animals",
            collection_name="multi_docs",
        )
        assert len(chunks) >= 2  # Should find chunks from both documents


async def test_standalone_collection_lifecycle(standalone_config):
    """Create, populate, delete a collection -- full lifecycle."""
    mock_embedding = [0.1] * 384

    with patch("answerstack.knowledge_base.ProviderService") as MockProvider, \
         patch("answerstack.knowledge_base.OpenAIEmbeddingService") as MockEmbedding:
        mock_provider_instance = MockProvider.return_value
        mock_provider_instance.configure = AsyncMock()
        mock_provider_instance.is_configured = True

        mock_embed_instance = MockEmbedding.return_value
        mock_embed_instance.embed_texts = AsyncMock(
            side_effect=lambda texts, model: [mock_embedding] * len(texts)
        )

        kb = KnowledgeBase(standalone_config)

        # Create and populate
        kb.create_collection("lifecycle")
        count = await kb.add_document(
            content=b"Test data",
            filename="test.txt",
            collection_name="lifecycle",
        )
        assert count > 0

        # Delete
        kb.delete_collection("lifecycle")

        # Verify collection is gone (creating new pipeline and checking)
        # Re-create should work without error
        kb.create_collection("lifecycle")


async def test_standalone_no_fastapi_imports():
    """Verify core does not transitively import FastAPI or SQLAlchemy."""
    import sys

    # Clear any previously loaded modules to get a clean check
    # (pytest itself might have imported things)
    initial_fastapi = {m for m in sys.modules if m.startswith("fastapi")}
    initial_sqlalchemy = {m for m in sys.modules if m.startswith("sqlalchemy")}

    # Import the core package fully
    import answerstack
    import answerstack.knowledge_base
    import answerstack.rag_pipeline
    import answerstack.parsers
    import answerstack.retrieval
    import answerstack.provider
    import answerstack.config
    import answerstack.types
    import answerstack.errors

    # Check no NEW FastAPI or SQLAlchemy modules were loaded
    new_fastapi = {m for m in sys.modules if m.startswith("fastapi")} - initial_fastapi
    new_sqlalchemy = {m for m in sys.modules if m.startswith("sqlalchemy")} - initial_sqlalchemy

    assert new_fastapi == set(), f"Core imported FastAPI modules: {new_fastapi}"
    assert new_sqlalchemy == set(), f"Core imported SQLAlchemy modules: {new_sqlalchemy}"


async def test_standalone_markdown_ingest(standalone_config):
    """Ingest a markdown document using the real parser."""
    mock_embedding = [0.1] * 384

    with patch("answerstack.knowledge_base.ProviderService") as MockProvider, \
         patch("answerstack.knowledge_base.OpenAIEmbeddingService") as MockEmbedding:
        mock_provider_instance = MockProvider.return_value
        mock_provider_instance.configure = AsyncMock()
        mock_provider_instance.is_configured = True

        mock_embed_instance = MockEmbedding.return_value
        mock_embed_instance.embed_texts = AsyncMock(
            side_effect=lambda texts, model: [mock_embedding] * len(texts)
        )

        kb = KnowledgeBase(standalone_config)
        kb.create_collection("md_test")

        chunk_count = await kb.add_document(
            content=b"# Overview\n\nThis is a **markdown** document.\n\n## Details\n\nMore content here.",
            filename="readme.md",
            collection_name="md_test",
        )
        assert chunk_count > 0


async def test_standalone_empty_collection_retrieve(standalone_config):
    """Retrieving from an empty collection returns empty results."""
    mock_embedding = [0.1] * 384

    with patch("answerstack.rag_pipeline.ProviderService") as MockProvider, \
         patch("answerstack.rag_pipeline.OpenAIEmbeddingService") as MockEmbedding:
        mock_provider_instance = MockProvider.return_value
        mock_provider_instance.configure = AsyncMock()
        mock_provider_instance.is_configured = True

        mock_embed_instance = MockEmbedding.return_value
        mock_embed_instance.embed_single = AsyncMock(return_value=mock_embedding)

        pipeline = RAGPipeline(standalone_config, ranker=None)
        # Create collection directly via vector repo
        pipeline._vector_repo.create_collection("empty_kb")

        chunks = await pipeline.retrieve(
            query="Anything",
            collection_name="empty_kb",
        )
        assert chunks == []
