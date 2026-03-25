import traceback
from pathlib import Path
from typing import Any, NamedTuple
from uuid import UUID

import structlog

from app.chunking.splitter import RecursiveTextSplitter
from app.core.config import Settings
from app.core.errors import NotFoundError
from app.core.security import compute_bytes_hash, sanitize_filename, validate_storage_path
from app.models.document import Chunk, Document, DocumentStatus
from app.parsers import get_parser_for_extension
from app.repositories.document import DocumentRepository
from app.schemas.document import DocumentResponse, DocumentUploadResult, RejectedFile
from app.schemas.pagination import PaginatedResponse, encode_cursor

logger = structlog.get_logger()

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


class FileData(NamedTuple):
    """Pre-read file data passed from the API layer to the service."""

    filename: str
    content: bytes
    content_type: str | None


class DocumentService:
    def __init__(self, repo: DocumentRepository, settings: Settings):
        self._repo = repo
        self._settings = settings

    async def upload_documents(
        self,
        project_id: UUID,
        files: list[FileData],
        background_tasks: Any,
        session_factory: Any,
    ) -> DocumentUploadResult:
        """Upload multiple documents with validation, dedup, and background parsing."""
        uploaded_docs: list[Document] = []
        rejected_files: list[RejectedFile] = []

        for file_data in files:
            original_filename = file_data.filename
            content = file_data.content

            # Extract extension
            ext = Path(original_filename).suffix.lower()

            # Validate file extension
            if ext not in ALLOWED_EXTENSIONS:
                rejected_files.append(
                    RejectedFile(
                        filename=original_filename,
                        reason="Only .txt, .md, and .pdf files are supported.",
                        error_code="document.invalid_type",
                    )
                )
                continue

            # Validate file size
            max_bytes = self._settings.max_upload_size_mb * 1024 * 1024
            if len(content) > max_bytes:
                rejected_files.append(
                    RejectedFile(
                        filename=original_filename,
                        reason=f"File exceeds {self._settings.max_upload_size_mb}MB limit.",
                        error_code="document.too_large",
                    )
                )
                continue

            # Compute checksum
            checksum = compute_bytes_hash(content)

            # Sanitize filename
            sanitized = sanitize_filename(original_filename)

            # Check for duplicates
            duplicate = await self._repo.find_duplicate(project_id, sanitized, checksum)
            if duplicate is not None:
                rejected_files.append(
                    RejectedFile(
                        filename=original_filename,
                        reason="A document with the same filename and content already exists in this project.",
                        error_code="document.duplicate",
                    )
                )
                continue

            # Construct and validate storage path
            base_dir = Path(self._settings.document_storage_path)
            storage_path = base_dir / str(project_id) / sanitized
            if not validate_storage_path(base_dir, storage_path):
                rejected_files.append(
                    RejectedFile(
                        filename=original_filename,
                        reason="Invalid file path detected.",
                        error_code="document.path_traversal",
                    )
                )
                continue

            # Write file to disk
            storage_path.parent.mkdir(parents=True, exist_ok=True)
            storage_path.write_bytes(content)

            # Create document entity
            document = Document(
                project_id=project_id,
                filename=sanitized,
                original_filename=original_filename,
                file_type=ext[1:],  # Remove leading dot
                file_size=len(content),
                checksum=checksum,
                status=DocumentStatus.UPLOADED,
            )

            # Save via repository
            document = await self._repo.create(document)

            # Schedule background parsing
            background_tasks.add_task(
                _parse_document_background,
                session_factory,
                document.id,
                storage_path,
                self._settings,
            )

            uploaded_docs.append(document)

        return DocumentUploadResult(
            uploaded=[DocumentResponse.model_validate(d) for d in uploaded_docs],
            rejected=rejected_files,
        )

    async def list_documents(
        self,
        project_id: UUID,
        cursor: str | None = None,
        limit: int = 50,
    ) -> PaginatedResponse[DocumentResponse]:
        """List documents for a project with cursor-based pagination."""
        # Clamp limit
        limit = max(1, min(limit, 100))
        documents = await self._repo.list_by_project(project_id, cursor, limit)

        has_more = len(documents) > limit
        if has_more:
            documents = documents[:limit]

        items = [DocumentResponse.model_validate(d) for d in documents]
        next_cursor = encode_cursor(documents[-1].id) if has_more and documents else None

        return PaginatedResponse(
            items=items,
            next_cursor=next_cursor,
            has_more=has_more,
        )

    async def get_document(self, document_id: UUID) -> Document:
        """Get a single document by ID."""
        document = await self._repo.get_by_id(document_id)
        if document is None:
            raise NotFoundError("document", str(document_id))
        return document

    async def delete_document(self, document_id: UUID) -> None:
        """Delete a document, its chunks, and its file from disk."""
        # Get document first to access file path info
        document = await self._repo.get_by_id(document_id)
        if document is None:
            raise NotFoundError("document", str(document_id))

        # Delete from DB (handles record + chunks)
        await self._repo.delete(document_id)

        # Attempt to delete file from disk
        file_path = (
            Path(self._settings.document_storage_path)
            / str(document.project_id)
            / document.filename
        )
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError:
            logger.warning(
                "Failed to delete document file from disk",
                file_path=str(file_path),
                document_id=str(document_id),
            )


async def _parse_document_background(
    session_factory: Any,
    document_id: UUID,
    file_path: Path,
    settings: Settings,
) -> None:
    """Background task that parses a document, creates chunks, and updates status.

    Creates its own database session via session_factory -- does NOT use the
    request-scoped session.
    """
    # Import here to avoid circular imports
    from app.repositories.document import SQLAlchemyDocumentRepository

    log = structlog.get_logger()

    try:
        async with session_factory() as session:
            repo = SQLAlchemyDocumentRepository(session)

            # Get document
            document = await repo.get_by_id(document_id)
            if document is None:
                log.warning("Document not found for background parsing", document_id=str(document_id))
                return

            # Update status to PARSING
            await repo.update_status(document_id, DocumentStatus.PARSING)
            await session.commit()

            # Read file from disk
            content = file_path.read_bytes()

            # Get parser and parse
            parser = get_parser_for_extension(file_path.suffix)
            result = parser.parse(content, file_path.name)

            # Split into chunks
            splitter = RecursiveTextSplitter(
                chunk_size=settings.chunk_size,
                chunk_overlap=settings.chunk_overlap,
            )
            chunks_text = splitter.split(result.text)

            # Create Chunk entities
            chunk_entities = []
            for i, text in enumerate(chunks_text):
                chunk = Chunk(
                    document_id=document_id,
                    content=text,
                    position=i,
                    char_count=len(text),
                    page_number=None,  # Page attribution from ParseResult metadata if available
                )
                chunk_entities.append(chunk)

            # Add all chunks to session
            session.add_all(chunk_entities)

            # Update document status
            await repo.update_status(
                document_id,
                DocumentStatus.PARSED,
                chunk_count=len(chunks_text),
            )

            await session.commit()

            log.info(
                "Document parsed successfully",
                document_id=str(document_id),
                chunk_count=len(chunks_text),
            )

    except Exception as e:
        log.error(
            "Document parsing failed",
            document_id=str(document_id),
            error=str(e),
        )
        # Update status to FAILED in a new session
        try:
            async with session_factory() as session:
                repo = SQLAlchemyDocumentRepository(session)
                await repo.update_status(
                    document_id,
                    DocumentStatus.FAILED,
                    error_detail={
                        "stage": "parsing",
                        "message": str(e),
                        "traceback_summary": traceback.format_exc()[-500:],
                    },
                )
                await session.commit()
        except Exception as inner_e:
            log.error(
                "Failed to update document status to FAILED",
                document_id=str(document_id),
                error=str(inner_e),
            )
