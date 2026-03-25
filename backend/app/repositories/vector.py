from abc import ABC, abstractmethod
from uuid import UUID

import chromadb
import structlog

logger = structlog.get_logger()


class VectorRepository(ABC):
    """Port for vector storage operations.

    All methods are synchronous — the service layer calls them
    via ``asyncio.to_thread()`` when needed.
    """

    @abstractmethod
    def create_collection(self, project_id: UUID) -> None:
        """Create (or get) a collection for the given project."""
        ...

    @abstractmethod
    def delete_collection(self, project_id: UUID) -> None:
        """Delete the collection for a project. Idempotent."""
        ...

    @abstractmethod
    def upsert_embeddings(
        self,
        project_id: UUID,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict],
    ) -> None:
        """Upsert embeddings into the project's collection."""
        ...

    @abstractmethod
    def collection_exists(self, project_id: UUID) -> bool:
        """Check whether a collection exists for the project."""
        ...

    @abstractmethod
    def collection_count(self, project_id: UUID) -> int:
        """Return the number of embeddings in the project's collection."""
        ...


class ChromaDBVectorRepository(VectorRepository):
    """Concrete VectorRepository backed by ChromaDB PersistentClient."""

    def __init__(self, path: str) -> None:
        self._client = chromadb.PersistentClient(path=path)
        logger.info("ChromaDB initialized", path=path)

    def _collection_name(self, project_id: UUID) -> str:
        return f"project_{project_id}"

    def create_collection(self, project_id: UUID) -> None:
        self._client.get_or_create_collection(
            name=self._collection_name(project_id),
            metadata={"hnsw:space": "cosine"},
        )

    def delete_collection(self, project_id: UUID) -> None:
        try:
            self._client.delete_collection(
                name=self._collection_name(project_id),
            )
        except ValueError:
            # Collection doesn't exist — idempotent delete
            pass

    def upsert_embeddings(
        self,
        project_id: UUID,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict],
    ) -> None:
        collection = self._client.get_or_create_collection(
            name=self._collection_name(project_id),
            metadata={"hnsw:space": "cosine"},
        )
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )

    def collection_exists(self, project_id: UUID) -> bool:
        try:
            self._client.get_collection(
                name=self._collection_name(project_id),
            )
            return True
        except (ValueError, Exception):
            return False

    def collection_count(self, project_id: UUID) -> int:
        try:
            collection = self._client.get_collection(
                name=self._collection_name(project_id),
            )
            return collection.count()
        except Exception:
            return 0
