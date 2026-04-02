"""Vector storage: ABC and ChromaDB implementation.

All methods use collection_name: str (not project_id: UUID) to keep
the core library domain-agnostic. The web app maps project IDs to
collection names when calling these methods.

All methods are synchronous -- the service layer calls them via
asyncio.to_thread() when needed.
"""

from abc import ABC, abstractmethod

import chromadb
import structlog

logger = structlog.get_logger()


class VectorRepository(ABC):
    """Port for vector storage operations.

    All methods are synchronous -- the service layer calls them
    via ``asyncio.to_thread()`` when needed.
    """

    @abstractmethod
    def create_collection(self, collection_name: str) -> None:
        """Create (or get) a collection with the given name."""
        ...

    @abstractmethod
    def delete_collection(self, collection_name: str) -> None:
        """Delete a collection. Idempotent."""
        ...

    @abstractmethod
    def delete_document_embeddings(self, collection_name: str, document_id: str) -> None:
        """Delete all embeddings for a single document. Idempotent."""
        ...

    @abstractmethod
    def upsert_embeddings(
        self,
        collection_name: str,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict],
    ) -> None:
        """Upsert embeddings into the named collection."""
        ...

    @abstractmethod
    def collection_exists(self, collection_name: str) -> bool:
        """Check whether a collection exists."""
        ...

    @abstractmethod
    def collection_count(self, collection_name: str) -> int:
        """Return the number of embeddings in a collection."""
        ...

    @abstractmethod
    def list_chunk_ids(self, collection_name: str) -> list[str]:
        """Return all stored chunk ids for a collection."""
        ...

    @abstractmethod
    def query(
        self,
        collection_name: str,
        query_embedding: list[float],
        n_results: int = 20,
    ) -> dict:
        """Query collection by embedding similarity.

        Returns dict with keys: ids, documents, metadatas, distances (all lists, row-major).
        """
        ...

    @abstractmethod
    def query_random_chunks(self, collection_name: str, n: int = 10) -> list[str]:
        """Get N random chunk texts from a collection for prompt generation."""
        ...


class ChromaDBVectorRepository(VectorRepository):
    """Concrete VectorRepository backed by ChromaDB PersistentClient."""

    def __init__(self, path: str) -> None:
        self._client = chromadb.PersistentClient(path=path)
        logger.info("ChromaDB initialized", path=path)

    def _validate_collection_name(self, collection_name: str) -> None:
        """Validate that collection_name is a non-empty string."""
        if not collection_name:
            raise ValueError("collection_name must be a non-empty string")

    def create_collection(self, collection_name: str) -> None:
        self._validate_collection_name(collection_name)
        self._client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def delete_collection(self, collection_name: str) -> None:
        self._validate_collection_name(collection_name)
        try:
            self._client.delete_collection(name=collection_name)
        except (ValueError, chromadb.errors.NotFoundError):
            # Collection doesn't exist -- idempotent delete
            pass

    def delete_document_embeddings(self, collection_name: str, document_id: str) -> None:
        self._validate_collection_name(collection_name)
        try:
            collection = self._client.get_collection(name=collection_name)
        except (ValueError, chromadb.errors.NotFoundError, Exception):
            return

        try:
            collection.delete(where={"document_id": document_id})
        except Exception:
            logger.warning(
                "Failed to delete document embeddings",
                collection_name=collection_name,
                document_id=document_id,
            )

    def upsert_embeddings(
        self,
        collection_name: str,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict],
    ) -> None:
        self._validate_collection_name(collection_name)
        collection = self._client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )

    def collection_exists(self, collection_name: str) -> bool:
        self._validate_collection_name(collection_name)
        try:
            self._client.get_collection(name=collection_name)
            return True
        except (ValueError, Exception):
            return False

    def collection_count(self, collection_name: str) -> int:
        self._validate_collection_name(collection_name)
        try:
            collection = self._client.get_collection(name=collection_name)
            return collection.count()
        except Exception:
            return 0

    def list_chunk_ids(self, collection_name: str) -> list[str]:
        self._validate_collection_name(collection_name)
        try:
            collection = self._client.get_collection(name=collection_name)
        except Exception:
            return []

        ids: list[str] = []
        offset = 0
        page_size = 1000

        while True:
            results = collection.get(limit=page_size, offset=offset, include=[])
            batch_ids = results.get("ids", []) or []
            if not batch_ids:
                break
            ids.extend(batch_ids)
            if len(batch_ids) < page_size:
                break
            offset += len(batch_ids)

        return ids

    def query(
        self,
        collection_name: str,
        query_embedding: list[float],
        n_results: int = 20,
    ) -> dict:
        self._validate_collection_name(collection_name)
        collection = self._client.get_collection(name=collection_name)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )
        # ChromaDB returns column-major: results["ids"][0], etc.
        return {
            "ids": results["ids"][0] if results["ids"] else [],
            "documents": results["documents"][0] if results["documents"] else [],
            "metadatas": results["metadatas"][0] if results["metadatas"] else [],
            "distances": results["distances"][0] if results["distances"] else [],
        }

    def query_random_chunks(self, collection_name: str, n: int = 10) -> list[str]:
        """Get N random chunk texts from a collection for prompt generation."""
        self._validate_collection_name(collection_name)
        try:
            collection = self._client.get_collection(collection_name)
            # ChromaDB peek returns random documents
            results = collection.peek(limit=n)
            return results.get("documents", []) or []
        except Exception:
            return []
