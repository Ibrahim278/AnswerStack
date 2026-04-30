"""KnowledgeBase facade: parse, chunk, embed, and store documents.

Composes internal core modules (parsers, chunking, embedding, vector storage)
into a single ergonomic entry point for document ingestion.
"""

from __future__ import annotations

import asyncio
import uuid as uuid_mod

import structlog

from answerstack.chunking.splitter import RecursiveTextSplitter
from answerstack.config import RAGConfig
from answerstack.embedding import OpenAIEmbeddingService
from answerstack.errors import ParsingError
from answerstack.parsers import get_parser_for_extension
from answerstack.provider import ProviderService
from answerstack.vector import ChromaDBVectorRepository

logger = structlog.get_logger()


class KnowledgeBase:
    """Ingest facade: parse, chunk, embed, and store documents.

    Usage:
        kb = KnowledgeBase(config)
        kb.create_collection("my_kb")
        await kb.add_document(content=pdf_bytes, filename="report.pdf", collection_name="my_kb")
    """

    def __init__(self, config: RAGConfig) -> None:
        self._config = config
        self._vector_repo = ChromaDBVectorRepository(path=config.data_dir)
        self._provider = ProviderService()
        self._embedding = OpenAIEmbeddingService(self._provider)
        self._splitter = RecursiveTextSplitter(
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap,
        )
        self._initialized = False

    async def _ensure_provider(self) -> None:
        """Lazy-configure provider on first use."""
        if not self._initialized:
            await self._provider.configure(
                base_url=self._config.provider_url,
                api_key=self._config.provider_api_key,
            )
            self._initialized = True

    def create_collection(self, name: str = "default") -> None:
        """Create a collection. Idempotent."""
        self._vector_repo.create_collection(name)

    def delete_collection(self, name: str = "default") -> None:
        """Delete a collection. Idempotent."""
        self._vector_repo.delete_collection(name)

    async def add_document(
        self,
        content: bytes,
        filename: str,
        collection_name: str = "default",
        chunk_ids: list[str] | None = None,
        metadatas: list[dict] | None = None,
    ) -> int:
        """Full ingest pipeline: parse -> chunk -> embed -> upsert.

        Args:
            content: Raw file bytes.
            filename: Original filename (used for parser dispatch and metadata).
            collection_name: Target collection. Defaults to "default".
            chunk_ids: Optional external chunk IDs. Auto-generated if not provided.
            metadatas: Optional per-chunk metadata dicts. Auto-generated if not provided.

        Returns:
            Number of chunks ingested.

        Raises:
            ParsingError: If document parsing fails.
            answerstack.errors.ProviderError: If embedding fails.
        """
        await self._ensure_provider()

        # Parse
        ext = "." + filename.rsplit(".", 1)[-1] if "." in filename else ""
        try:
            parser = get_parser_for_extension(ext)
            result = parser.parse(content, filename)
        except Exception as e:
            raise ParsingError(f"Failed to parse {filename}: {e}") from e

        # Chunk
        chunks = self._splitter.split(result.text)
        if not chunks:
            logger.info("No chunks produced", filename=filename)
            return 0

        # Embed
        embeddings = await self._embedding.embed_texts(
            chunks, self._config.embedding_model
        )

        # Generate chunk IDs if not provided
        if chunk_ids is None:
            chunk_ids = [str(uuid_mod.uuid4()) for _ in chunks]

        # Generate default metadata if not provided
        if metadatas is None:
            metadatas = [{"document_name": filename} for _ in chunks]

        # Upsert
        self._vector_repo.upsert_embeddings(
            collection_name, chunk_ids, embeddings, chunks, metadatas
        )

        logger.info(
            "Document ingested",
            filename=filename,
            collection=collection_name,
            chunks=len(chunks),
        )
        return len(chunks)

    def add_document_sync(
        self,
        content: bytes,
        filename: str,
        collection_name: str = "default",
        chunk_ids: list[str] | None = None,
        metadatas: list[dict] | None = None,
    ) -> int:
        """Sync convenience wrapper. Do NOT call from async context.

        Raises RuntimeError if called from within a running event loop.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None:
            raise RuntimeError(
                "Cannot call add_document_sync() from async context. "
                "Use 'await add_document()' instead."
            )
        return asyncio.run(
            self.add_document(content, filename, collection_name, chunk_ids, metadatas)
        )
