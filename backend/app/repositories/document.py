from abc import abstractmethod
from uuid import UUID

from sqlalchemy import delete as sa_delete, func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.models.document import Chunk, Document, DocumentStatus
from app.repositories.base import Repository
from app.schemas.pagination import decode_cursor


class DocumentRepository(Repository[Document]):
    @abstractmethod
    async def list_by_project(
        self, project_id: UUID, cursor: str | None, limit: int
    ) -> list[Document]: ...

    @abstractmethod
    async def find_duplicate(
        self, project_id: UUID, filename: str, checksum: str
    ) -> Document | None: ...

    @abstractmethod
    async def update_status(
        self,
        document_id: UUID,
        status: DocumentStatus,
        error_detail: dict | None = None,
        chunk_count: int | None = None,
    ) -> Document | None: ...

    @abstractmethod
    async def reset_indexing_documents(self, project_id: UUID) -> int:
        """Reset documents stuck in INDEXING status back to PARSED.

        Returns the number of affected documents.
        """
        ...


class SQLAlchemyDocumentRepository(DocumentRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_id(self, id: UUID) -> Document | None:
        result = await self._session.execute(
            select(Document).where(Document.id == id)
        )
        return result.scalar_one_or_none()

    async def create(self, entity: Document) -> Document:
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def delete(self, id: UUID) -> bool:
        document = await self.get_by_id(id)
        if document is None:
            return False
        # Explicit bulk delete of chunks to avoid async lazy-loading issues
        await self._session.execute(
            sa_delete(Chunk).where(Chunk.document_id == id)
        )
        await self._session.delete(document)
        await self._session.flush()
        return True

    async def list_by_project(
        self, project_id: UUID, cursor: str | None, limit: int
    ) -> list[Document]:
        query = select(Document).where(
            Document.project_id == project_id
        ).order_by(Document.created_at.desc(), Document.id.desc())

        if cursor:
            cursor_id = decode_cursor(cursor)
            # Validate cursor belongs to this project to prevent cross-project leakage
            cursor_row = await self._session.execute(
                select(Document).where(
                    Document.id == cursor_id,
                    Document.project_id == project_id,
                )
            )
            cursor_row = cursor_row.scalar_one_or_none()
            if cursor_row is None:
                raise ValidationError("cursor", "Invalid or expired pagination cursor.")
            query = query.where(
                (Document.created_at < cursor_row.created_at)
                | (
                    (Document.created_at == cursor_row.created_at)
                    & (Document.id < cursor_id)
                )
            )

        query = query.limit(limit + 1)  # Fetch one extra for has_more detection
        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def find_duplicate(
        self, project_id: UUID, filename: str, checksum: str
    ) -> Document | None:
        result = await self._session.execute(
            select(Document).where(
                Document.project_id == project_id,
                Document.filename == filename,
                Document.checksum == checksum,
            )
        )
        return result.scalar_one_or_none()

    async def update_status(
        self,
        document_id: UUID,
        status: DocumentStatus,
        error_detail: dict | None = None,
        chunk_count: int | None = None,
    ) -> Document | None:
        document = await self.get_by_id(document_id)
        if document is None:
            return None
        document.status = status
        if error_detail is not None:
            document.error_detail = error_detail
        if chunk_count is not None:
            document.chunk_count = chunk_count
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def reset_indexing_documents(self, project_id: UUID) -> int:
        """Reset documents stuck in INDEXING status back to PARSED.

        Called during job failure recovery so that a subsequent retry
        can pick up these documents again.
        """
        result = await self._session.execute(
            sa_update(Document)
            .where(
                Document.project_id == project_id,
                Document.status == DocumentStatus.INDEXING,
            )
            .values(status=DocumentStatus.PARSED)
        )
        return result.rowcount


class ChunkRepository:
    """Simple repository for chunk operations.

    Chunks are always managed through their parent Document, so no full
    Repository ABC is needed.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    async def create_bulk(self, chunks: list[Chunk]) -> None:
        self._session.add_all(chunks)
        await self._session.flush()

    async def delete_by_document(self, document_id: UUID) -> int:
        result = await self._session.execute(
            sa_delete(Chunk).where(Chunk.document_id == document_id)
        )
        return result.rowcount

    async def count_by_document(self, document_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(Chunk).where(
                Chunk.document_id == document_id
            )
        )
        return result.scalar_one()
