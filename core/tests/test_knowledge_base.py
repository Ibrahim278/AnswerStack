"""Unit tests for KnowledgeBase ingest facade."""

import asyncio

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from answerstack.config import RAGConfig
from answerstack.errors import ParsingError
from answerstack.knowledge_base import KnowledgeBase


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _make_kb(sample_config, mock_provider=None, mock_embedding=None):
    """Create a KnowledgeBase with mocked provider and embedding services."""
    with patch("answerstack.knowledge_base.ProviderService") as MockProvider, \
         patch("answerstack.knowledge_base.OpenAIEmbeddingService") as MockEmbedding:

        if mock_provider is None:
            mock_provider_inst = MockProvider.return_value
            mock_provider_inst.configure = AsyncMock()
            mock_provider_inst.is_configured = True
        else:
            MockProvider.return_value = mock_provider

        if mock_embedding is None:
            mock_embed_inst = MockEmbedding.return_value
            mock_embed_inst.embed_texts = AsyncMock(
                side_effect=lambda texts, model: [[0.1] * 384] * len(texts)
            )
        else:
            MockEmbedding.return_value = mock_embedding

        kb = KnowledgeBase(sample_config)
        return kb, MockProvider, MockEmbedding


# --------------------------------------------------------------------------- #
# Collection management
# --------------------------------------------------------------------------- #

async def test_create_and_delete_collection(sample_config, tmp_chromadb_dir):
    """Create and delete a collection using real ChromaDB."""
    with patch("answerstack.knowledge_base.ProviderService"), \
         patch("answerstack.knowledge_base.OpenAIEmbeddingService"):
        kb = KnowledgeBase(sample_config)

    # Should not raise
    kb.create_collection("test_collection")
    # Idempotent create
    kb.create_collection("test_collection")
    # Delete
    kb.delete_collection("test_collection")
    # Idempotent delete
    kb.delete_collection("test_collection")


# --------------------------------------------------------------------------- #
# add_document: happy path
# --------------------------------------------------------------------------- #

async def test_add_document_txt(sample_config):
    """Ingest a plain text document and verify chunk count."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    chunk_count = await kb.add_document(
        content=b"The capital of France is Paris. It is known for the Eiffel Tower.",
        filename="france.txt",
        collection_name="test",
    )
    assert chunk_count > 0


async def test_add_document_markdown(sample_config):
    """Ingest a markdown document."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    chunk_count = await kb.add_document(
        content=b"# Heading\n\nSome markdown content with **bold** text.",
        filename="readme.md",
        collection_name="test",
    )
    assert chunk_count > 0


# --------------------------------------------------------------------------- #
# add_document: custom IDs and metadata
# --------------------------------------------------------------------------- #

async def test_add_document_with_custom_chunk_ids(sample_config):
    """Custom chunk_ids are passed through to the vector repo."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    # Spy on the vector repo's upsert
    original_upsert = kb._vector_repo.upsert_embeddings
    upsert_calls = []

    def spy_upsert(collection_name, ids, embeddings, documents, metadatas):
        upsert_calls.append({
            "ids": ids,
            "metadatas": metadatas,
        })
        return original_upsert(collection_name, ids, embeddings, documents, metadatas)

    kb._vector_repo.upsert_embeddings = spy_upsert

    custom_ids = ["custom-id-1"]
    chunk_count = await kb.add_document(
        content=b"Short document.",
        filename="short.txt",
        collection_name="test",
        chunk_ids=custom_ids,
    )

    assert chunk_count > 0
    assert len(upsert_calls) == 1
    assert upsert_calls[0]["ids"] == custom_ids


async def test_add_document_with_custom_metadatas(sample_config):
    """Custom metadatas are passed through to the vector repo."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    original_upsert = kb._vector_repo.upsert_embeddings
    upsert_calls = []

    def spy_upsert(collection_name, ids, embeddings, documents, metadatas):
        upsert_calls.append({"metadatas": metadatas})
        return original_upsert(collection_name, ids, embeddings, documents, metadatas)

    kb._vector_repo.upsert_embeddings = spy_upsert

    custom_meta = [{"document_name": "custom.txt", "page_number": 42}]
    chunk_count = await kb.add_document(
        content=b"Short document.",
        filename="short.txt",
        collection_name="test",
        metadatas=custom_meta,
    )

    assert chunk_count > 0
    assert len(upsert_calls) == 1
    assert upsert_calls[0]["metadatas"] == custom_meta


# --------------------------------------------------------------------------- #
# add_document: edge cases and errors
# --------------------------------------------------------------------------- #

async def test_add_document_empty_content(sample_config):
    """Empty content produces 0 chunks."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    chunk_count = await kb.add_document(
        content=b"",
        filename="empty.txt",
        collection_name="test",
    )
    assert chunk_count == 0


async def test_add_document_whitespace_only_content(sample_config):
    """Whitespace-only content produces 0 chunks."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    chunk_count = await kb.add_document(
        content=b"   \n\n  \t  ",
        filename="whitespace.txt",
        collection_name="test",
    )
    assert chunk_count == 0


async def test_add_document_unsupported_extension(sample_config):
    """Unsupported file extension raises ParsingError."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    with pytest.raises(ParsingError, match="Failed to parse"):
        await kb.add_document(
            content=b"some data",
            filename="file.xyz",
            collection_name="test",
        )


async def test_add_document_no_extension(sample_config):
    """File without extension raises ParsingError."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    with pytest.raises(ParsingError, match="Failed to parse"):
        await kb.add_document(
            content=b"some data",
            filename="noextension",
            collection_name="test",
        )


# --------------------------------------------------------------------------- #
# Default collection name
# --------------------------------------------------------------------------- #

async def test_default_collection_name(sample_config):
    """add_document() without collection_name uses 'default'."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("default")

    chunk_count = await kb.add_document(
        content=b"Test content for default collection.",
        filename="test.txt",
    )
    assert chunk_count > 0


# --------------------------------------------------------------------------- #
# Sync wrapper
# --------------------------------------------------------------------------- #

def test_add_document_sync_from_sync_context(sample_config):
    """add_document_sync() works from a non-async context."""
    kb, _, _ = _make_kb(sample_config)
    kb.create_collection("test")

    chunk_count = kb.add_document_sync(
        content=b"Sync test content.",
        filename="sync.txt",
        collection_name="test",
    )
    assert chunk_count > 0


async def test_add_document_sync_from_async_context_raises(sample_config):
    """add_document_sync() raises RuntimeError from async context."""
    kb, _, _ = _make_kb(sample_config)

    with pytest.raises(RuntimeError, match="Cannot call add_document_sync\\(\\) from async context"):
        kb.add_document_sync(
            content=b"Should fail",
            filename="test.txt",
            collection_name="test",
        )


# --------------------------------------------------------------------------- #
# Provider lazy initialization
# --------------------------------------------------------------------------- #

async def test_ensure_provider_called_once(sample_config):
    """Provider is configured only once even with multiple add_document calls."""
    mock_provider = MagicMock()
    mock_provider.configure = AsyncMock()
    mock_provider.is_configured = True

    mock_embedding = AsyncMock()
    mock_embedding.embed_texts = AsyncMock(
        side_effect=lambda texts, model: [[0.1] * 384] * len(texts)
    )

    kb, _, _ = _make_kb(sample_config, mock_provider=mock_provider, mock_embedding=mock_embedding)
    kb.create_collection("test")

    await kb.add_document(content=b"First doc.", filename="first.txt", collection_name="test")
    await kb.add_document(content=b"Second doc.", filename="second.txt", collection_name="test")

    # configure should be called exactly once due to lazy init
    assert mock_provider.configure.call_count == 1
