"""Indexing service: job lifecycle, background runner, and stale detection."""

import asyncio
import traceback
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.hashing import compute_chunk_params_hash

from answerstack.chunking.splitter import RecursiveTextSplitter
from answerstack.embedding import EmbeddingService
from answerstack.parsers import get_parser_for_extension
from answerstack.vector import VectorRepository
from app.models.document import Chunk, Document, DocumentStatus
from app.models.indexing_job import IndexingJob, IndexingJobStatus
from app.models.project import Project
from app.repositories.document import ChunkRepository, DocumentRepository
from app.repositories.indexing_job import IndexingJobRepository
from app.repositories.project import ProjectRepository
from app.repositories.settings import SettingsRepository

logger = structlog.get_logger()

# Document statuses eligible for (re-)indexing
_INDEXABLE_STATUSES = (
    DocumentStatus.PARSED,
    DocumentStatus.INDEXED,
    DocumentStatus.STALE,
    DocumentStatus.REINDEX_REQUIRED,
)
_INCREMENTAL_INDEXABLE_STATUSES = (
    DocumentStatus.PARSED,
    DocumentStatus.STALE,
)


def _document_hash_mismatch(doc: Document, current_hash: str) -> bool:
    return bool(doc.chunk_params_hash and doc.chunk_params_hash != current_hash)


def _document_requires_rechunk(doc: Document, current_hash: str) -> bool:
    if not doc.chunks:
        return True
    if doc.chunk_params_hash is None:
        return False
    return doc.chunk_params_hash != current_hash


def _settings_change_requires_full_rebuild(
    documents: list[Document],
    current_hash: str,
) -> bool:
    for doc in documents:
        if doc.status == DocumentStatus.REINDEX_REQUIRED:
            return True
        if _document_hash_mismatch(doc, current_hash):
            return True
    return False


def _select_documents_for_run(
    documents: list[Document],
    *,
    full_rebuild: bool,
) -> list[Document]:
    allowed_statuses = (
        _INDEXABLE_STATUSES if full_rebuild else _INCREMENTAL_INDEXABLE_STATUSES
    )
    return [doc for doc in documents if doc.status in allowed_statuses]


def _get_indexed_documents(documents: list[Document]) -> list[Document]:
    return [doc for doc in documents if doc.status == DocumentStatus.INDEXED]


def _get_chunk_ids(documents: list[Document]) -> set[str]:
    return {str(chunk.id) for doc in documents for chunk in doc.chunks}


async def _vector_index_missing_or_out_of_sync(
    vector_repo: VectorRepository,
    project_id: UUID,
    indexed_documents: list[Document],
    *,
    collection_exists: bool | None = None,
    collection_count: int | None = None,
) -> bool:
    if not indexed_documents:
        return False

    collection_name = f"project_{project_id}"

    if collection_exists is None:
        collection_exists = await asyncio.to_thread(vector_repo.collection_exists, collection_name)
    if not collection_exists:
        return True

    if collection_count is None:
        collection_count = await asyncio.to_thread(vector_repo.collection_count, collection_name)
    if collection_count == 0:
        return True

    expected_chunk_ids = _get_chunk_ids(indexed_documents)
    if collection_count != len(expected_chunk_ids):
        return True

    vector_chunk_ids = set(await asyncio.to_thread(vector_repo.list_chunk_ids, collection_name))
    return vector_chunk_ids != expected_chunk_ids


async def _compute_project_index_status(
    doc_repo: DocumentRepository,
    project_repo: ProjectRepository,
    settings_repo: SettingsRepository,
    project_id: UUID,
) -> str:
    settings = await settings_repo.get()
    current_hash = compute_chunk_params_hash(
        settings.chunk_size, settings.chunk_overlap, settings.embedding_model
    )

    project = await project_repo.get_by_id(project_id)
    if project is None:
        return "not_indexed"

    documents = await _get_all_project_documents(doc_repo, project_id)
    if not documents:
        return "not_indexed"

    stale_statuses = (
        DocumentStatus.PARSED,
        DocumentStatus.STALE,
        DocumentStatus.REINDEX_REQUIRED,
        DocumentStatus.UPLOADED,
        DocumentStatus.PARSING,
        DocumentStatus.INDEXING,
    )
    has_indexed_document = False
    for doc in documents:
        if doc.status in stale_statuses:
            return "stale"
        if doc.chunk_params_hash and doc.chunk_params_hash != current_hash:
            return "stale"
        if doc.status == DocumentStatus.INDEXED:
            has_indexed_document = True

    return "indexed" if has_indexed_document else "not_indexed"


async def _cleanup_cancelled_run(
    *,
    session: AsyncSession,
    doc_repo: DocumentRepository,
    project_repo: ProjectRepository,
    settings_repo: SettingsRepository,
    vector_repo: VectorRepository,
    project_id: UUID,
    had_previous_index: bool,
    full_rebuild: bool,
    settings_changed_rebuild: bool,
    collection_rebuilt: bool,
    current_document_id: UUID | None,
) -> None:
    """Clean up partial state left behind by a cancelled indexing run."""
    collection_name = f"project_{project_id}"
    if full_rebuild and collection_rebuilt:
        await asyncio.to_thread(vector_repo.delete_collection, collection_name)

    if full_rebuild:
        fallback_status = (
            DocumentStatus.REINDEX_REQUIRED
            if settings_changed_rebuild and had_previous_index
            else (DocumentStatus.STALE if had_previous_index else DocumentStatus.PARSED)
        )
        await doc_repo.bulk_update_project_statuses(
            project_id,
            (DocumentStatus.INDEXING, DocumentStatus.INDEXED),
            fallback_status,
        )
    else:
        if current_document_id is not None:
            await asyncio.to_thread(
                vector_repo.delete_document_embeddings,
                collection_name,
                str(current_document_id),
            )
        fallback_status = (
            DocumentStatus.STALE if had_previous_index else DocumentStatus.PARSED
        )
        await doc_repo.bulk_update_project_statuses(
            project_id,
            (DocumentStatus.INDEXING,),
            fallback_status,
        )

    next_index_status = await _compute_project_index_status(
        doc_repo,
        project_repo,
        settings_repo,
        project_id,
    )
    await project_repo.update(project_id, index_status=next_index_status)
    await session.commit()


async def _cancel_requested(
    job_repo: IndexingJobRepository,
    job_id: UUID,
) -> bool:
    refreshed_job = await job_repo.get_by_id(job_id)
    return bool(refreshed_job and refreshed_job.status == IndexingJobStatus.CANCELLED)


class IndexingService:
    """Orchestrates indexing job lifecycle without touching SQLAlchemy directly."""

    def __init__(
        self,
        job_repo: IndexingJobRepository,
        document_repo: DocumentRepository,
        project_repo: ProjectRepository,
        settings_repo: SettingsRepository,
        vector_repo: VectorRepository,
    ):
        self._job_repo = job_repo
        self._document_repo = document_repo
        self._project_repo = project_repo
        self._settings_repo = settings_repo
        self._vector_repo = vector_repo

    async def trigger_build(self, project_id: UUID) -> IndexingJob:
        """Create a new indexing job for the project.

        Raises NotFoundError if project doesn't exist, ConflictError if a
        job is already running, AppError if there are no parsed documents.
        """
        project = await self._project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundError("project", str(project_id))

        active = await self._job_repo.get_active_by_project(project_id)
        if active is not None:
            raise ConflictError(
                "indexing",
                "An indexing job is already active (pending or running) for this project.",
            )

        documents = await self._get_documents_for_job(project_id)
        if not documents:
            raise AppError(
                error_code="indexing.no_documents",
                message="No parsed documents available for indexing.",
                status_code=400,
            )

        job = IndexingJob(
            project_id=project_id,
            status=IndexingJobStatus.PENDING,
            documents_total=len(documents),
        )
        job = await self._job_repo.create(job)

        await self._project_repo.update(project_id, index_status="indexing")
        return job

    async def get_latest_job(self, project_id: UUID) -> IndexingJob | None:
        """Return the most recent indexing job for a project."""
        return await self._job_repo.get_latest_by_project(project_id)

    async def get_indexing_status(self, project_id: UUID) -> dict:
        """Return a dict with index_status, job, and last_indexed_at."""
        project = await self._project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundError("project", str(project_id))

        job = await self._job_repo.get_latest_by_project(project_id)
        return {
            "index_status": project.index_status,
            "job": job,
            "last_indexed_at": project.last_indexed_at,
        }

    async def cancel_job(self, project_id: UUID) -> IndexingJob:
        """Cancel the currently active (PENDING or RUNNING) job for a project.

        PENDING jobs are cancelled immediately. RUNNING jobs are marked
        CANCELLED and the background runner performs cooperative cancellation.
        """
        active = await self._job_repo.get_active_by_project(project_id)
        if active is None:
            raise NotFoundError("indexing_job", str(project_id))

        updated = await self._job_repo.update_status(
            active.id, IndexingJobStatus.CANCELLED
        )

        project = await self._project_repo.get_by_id(project_id)
        had_previous_index = bool(project and project.last_indexed_at)
        full_rebuild = await self._settings_change_requires_full_rebuild(project_id)
        fallback_status = (
            DocumentStatus.REINDEX_REQUIRED
            if full_rebuild and had_previous_index
            else (DocumentStatus.STALE if had_previous_index else DocumentStatus.PARSED)
        )
        from_statuses = (
            (DocumentStatus.INDEXING, DocumentStatus.INDEXED)
            if full_rebuild
            and (active.documents_processed > 0 or active.current_document_id is not None)
            else (DocumentStatus.INDEXING,)
        )
        await self._document_repo.bulk_update_project_statuses(
            project_id,
            from_statuses,
            fallback_status,
        )
        new_status = await _compute_project_index_status(
            self._document_repo,
            self._project_repo,
            self._settings_repo,
            project_id,
        )
        await self._project_repo.update(project_id, index_status=new_status)

        return updated  # type: ignore[return-value]

    async def retry_job(self, project_id: UUID) -> IndexingJob:
        """Create a new job to retry after a failed or cancelled one."""
        latest = await self._job_repo.get_latest_by_project(project_id)
        if latest is None or latest.status not in (
            IndexingJobStatus.FAILED,
            IndexingJobStatus.CANCELLED,
        ):
            raise AppError(
                error_code="indexing.invalid_state",
                message="Can only retry failed or cancelled jobs.",
                status_code=400,
            )

        documents = await self._get_documents_for_job(project_id)
        if not documents:
            raise AppError(
                error_code="indexing.no_documents",
                message="No parsed documents available for indexing.",
                status_code=400,
            )

        job = IndexingJob(
            project_id=project_id,
            status=IndexingJobStatus.PENDING,
            documents_total=len(documents),
        )
        job = await self._job_repo.create(job)

        await self._project_repo.update(project_id, index_status="indexing")
        return job

    async def compute_stale_status(self, project_id: UUID) -> str:
        """Compute whether the project's index is current, stale, or absent."""
        return await _compute_project_index_status(
            self._document_repo,
            self._project_repo,
            self._settings_repo,
            project_id,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_indexable_documents(self, project_id: UUID) -> list:
        """Return documents eligible for indexing."""
        return await _get_all_project_documents(
            self._document_repo, project_id, statuses=_INDEXABLE_STATUSES
        )

    async def _settings_change_requires_full_rebuild(self, project_id: UUID) -> bool:
        settings = await self._settings_repo.get()
        current_hash = compute_chunk_params_hash(
            settings.chunk_size, settings.chunk_overlap, settings.embedding_model
        )
        documents = await _get_all_project_documents(self._document_repo, project_id)
        return _settings_change_requires_full_rebuild(documents, current_hash)

    async def _get_documents_for_job(self, project_id: UUID) -> list[Document]:
        settings = await self._settings_repo.get()
        current_hash = compute_chunk_params_hash(
            settings.chunk_size, settings.chunk_overlap, settings.embedding_model
        )
        documents = await _get_all_project_documents(self._document_repo, project_id)
        full_rebuild = _settings_change_requires_full_rebuild(documents, current_hash)
        selected = _select_documents_for_run(documents, full_rebuild=full_rebuild)
        if selected:
            return selected

        indexed_documents = _get_indexed_documents(documents)
        if not indexed_documents:
            return []

        collection_name = f"project_{project_id}"
        collection_exists = await asyncio.to_thread(
            self._vector_repo.collection_exists,
            collection_name,
        )
        collection_count = (
            await asyncio.to_thread(self._vector_repo.collection_count, collection_name)
            if collection_exists
            else 0
        )
        if await _vector_index_missing_or_out_of_sync(
            self._vector_repo,
            project_id,
            indexed_documents,
            collection_exists=collection_exists,
            collection_count=collection_count,
        ):
            return indexed_documents

        return []


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


async def _get_all_project_documents(
    doc_repo: DocumentRepository,
    project_id: UUID,
    statuses: tuple | None = None,
) -> list:
    """Fetch all documents for a project using pagination, avoiding the
    10,000-row hard limit in a single query.

    If *statuses* is provided only documents whose status is in that
    tuple are returned; otherwise all documents are returned.
    """
    all_docs: list = []
    cursor: str | None = None
    page_size = 500

    while True:
        # list_by_project internally fetches limit+1 rows to detect has_more.
        # Pass page_size so the repo queries page_size+1 rows.
        page = await doc_repo.list_by_project(project_id, cursor, page_size)
        has_more = len(page) > page_size
        items = page[:page_size] if has_more else page
        if statuses is not None:
            all_docs.extend(d for d in items if d.status in statuses)
        else:
            all_docs.extend(items)
        if not has_more or not items:
            break
        # Derive next cursor from the last item in this page.
        from app.schemas.pagination import encode_cursor

        cursor = encode_cursor(items[-1].id)

    return all_docs


async def _reparse_document(
    session: AsyncSession,
    doc: Document,
    chunk_size: int,
    chunk_overlap: int,
) -> list[Chunk]:
    """Re-parse a document from disk and create new chunks.

    Used during indexing when chunks are missing (e.g. after settings change).
    """
    from app.core.config import Settings as AppSettings

    app_settings = AppSettings()
    base_dir = Path(app_settings.document_storage_path)
    file_path = base_dir / str(doc.project_id) / str(doc.id) / doc.filename

    # Try with dashes in UUID if plain hex path doesn't exist
    if not file_path.exists():
        import uuid as _uuid
        pid_str = str(_uuid.UUID(str(doc.project_id)))
        did_str = str(_uuid.UUID(str(doc.id)))
        file_path = base_dir / pid_str / did_str / doc.filename

    if not file_path.exists():
        logger.warning("Document file not found", path=str(file_path), doc_id=str(doc.id))
        return []

    loop = asyncio.get_running_loop()
    content = await loop.run_in_executor(None, file_path.read_bytes)

    parser = get_parser_for_extension(file_path.suffix)
    result = await loop.run_in_executor(None, parser.parse, content, doc.filename)

    splitter = RecursiveTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks_text = await loop.run_in_executor(None, splitter.split, result.text)

    chunk_repo = ChunkRepository(session)
    await chunk_repo.delete_by_document(doc.id)

    chunk_entities = []
    for i, text in enumerate(chunks_text):
        chunk = Chunk(
            document_id=doc.id,
            content=text,
            position=i,
            char_count=len(text),
            page_number=None,
        )
        chunk_entities.append(chunk)
        session.add(chunk)

    doc.chunk_count = len(chunk_entities)
    await session.flush()
    logger.info("Re-parsed document", doc_id=str(doc.id), chunks=len(chunk_entities))
    return chunk_entities


async def recover_orphaned_indexing_state(
    session_factory: async_sessionmaker,
) -> dict[str, int]:
    """Recover interrupted indexing state during startup or an equivalent restart path."""
    from datetime import datetime as _dt, timezone as _tz

    from sqlalchemy import select, update as sa_upd

    from app.models.document import Document as _Document
    from app.models.indexing_job import IndexingJob as _IndexingJob
    from app.repositories.document import SQLAlchemyDocumentRepository
    from app.repositories.indexing_job import SQLAlchemyIndexingJobRepository
    from app.repositories.project import SQLAlchemyProjectRepository
    from app.repositories.settings import SQLAlchemySettingsRepository

    async with session_factory() as session:
        job_repo = SQLAlchemyIndexingJobRepository(session)
        doc_repo = SQLAlchemyDocumentRepository(session)
        project_repo = SQLAlchemyProjectRepository(session)
        settings_repo = SQLAlchemySettingsRepository(session)

        orphaned_project_ids = set(
            (
                await session.execute(
                    select(_IndexingJob.project_id).where(
                        _IndexingJob.status.in_(
                            [IndexingJobStatus.RUNNING, IndexingJobStatus.PENDING]
                        )
                    )
                )
            ).scalars()
        )
        orphaned_project_ids.update(
            (
                await session.execute(
                    select(_Document.project_id).where(
                        _Document.status == DocumentStatus.INDEXING
                    )
                )
            ).scalars()
        )

        orphaned_count = await job_repo.mark_orphaned_running_as_failed()

        pending_result = await session.execute(
            sa_upd(_IndexingJob)
            .where(_IndexingJob.status == IndexingJobStatus.PENDING)
            .values(
                status=IndexingJobStatus.FAILED,
                error_detail={
                    "stage": "startup_recovery",
                    "message": "Job interrupted by server restart (was pending)",
                },
                completed_at=_dt.now(_tz.utc),
            )
        )
        orphaned_count += pending_result.rowcount

        reset_result = await session.execute(
            sa_upd(_Document)
            .where(_Document.status == DocumentStatus.INDEXING)
            .values(status=DocumentStatus.PARSED)
        )
        stuck_docs = reset_result.rowcount

        recomputed_projects = 0
        for project_id in orphaned_project_ids:
            next_status = await _compute_project_index_status(
                doc_repo,
                project_repo,
                settings_repo,
                project_id,
            )
            project = await project_repo.update(project_id, index_status=next_status)
            if project is not None:
                recomputed_projects += 1

        await session.commit()
        return {
            "orphaned_jobs": orphaned_count,
            "reset_documents": stuck_docs,
            "recomputed_projects": recomputed_projects,
        }


# ------------------------------------------------------------------
# Background job runner (module-level async function)
# ------------------------------------------------------------------


async def run_indexing_job(
    session_factory: async_sessionmaker,
    job_id: UUID,
    project_id: UUID,
    vector_repo: VectorRepository,
    embedding_service: EmbeddingService,
) -> None:
    """Execute the indexing pipeline in the background.

    Creates its own DB session via *session_factory* so it is independent
    of the HTTP request lifecycle.
    """
    from app.repositories.document import SQLAlchemyDocumentRepository
    from app.repositories.indexing_job import SQLAlchemyIndexingJobRepository
    from app.repositories.project import SQLAlchemyProjectRepository
    from app.repositories.settings import SQLAlchemySettingsRepository

    log = structlog.get_logger()

    try:
        async with session_factory() as session:
            job_repo = SQLAlchemyIndexingJobRepository(session)
            doc_repo = SQLAlchemyDocumentRepository(session)
            project_repo = SQLAlchemyProjectRepository(session)
            settings_repo = SQLAlchemySettingsRepository(session)
            project = await project_repo.get_by_id(project_id)
            had_previous_index = bool(project and project.last_indexed_at)
            collection_rebuilt = False

            # Mark job as running
            await job_repo.update_status(job_id, IndexingJobStatus.RUNNING)
            await session.commit()

            # Read current settings
            settings = await settings_repo.get()
            embedding_model = settings.embedding_model
            current_chunk_params_hash = compute_chunk_params_hash(
                settings.chunk_size, settings.chunk_overlap, embedding_model
            )

            all_documents = await _get_all_project_documents(doc_repo, project_id)
            settings_changed_rebuild = _settings_change_requires_full_rebuild(
                all_documents,
                current_chunk_params_hash,
            )
            indexed_documents = _get_indexed_documents(all_documents)
            has_indexed_documents = bool(indexed_documents)
            collection_name = f"project_{project_id}"
            collection_exists = await asyncio.to_thread(
                vector_repo.collection_exists, collection_name
            )
            collection_count = (
                await asyncio.to_thread(vector_repo.collection_count, collection_name)
                if collection_exists
                else 0
            )
            vector_drift_rebuild = has_indexed_documents and await _vector_index_missing_or_out_of_sync(
                vector_repo,
                project_id,
                indexed_documents,
                collection_exists=collection_exists,
                collection_count=collection_count,
            )
            full_rebuild = settings_changed_rebuild or vector_drift_rebuild
            collection_rebuilt = full_rebuild
            documents = _select_documents_for_run(
                all_documents,
                full_rebuild=full_rebuild,
            )
            total_docs = len(documents)

            # Check for cancellation BEFORE destroying the existing collection
            if await _cancel_requested(job_repo, job_id):
                log.info(
                    "Indexing job cancelled before collection rebuild",
                    job_id=str(job_id),
                )
                return

            if full_rebuild:
                await asyncio.to_thread(vector_repo.delete_collection, collection_name)
                await asyncio.to_thread(vector_repo.create_collection, collection_name)
            elif not collection_exists:
                await asyncio.to_thread(vector_repo.create_collection, collection_name)

            for i, doc in enumerate(documents):
                # Cooperative cancellation check
                if await _cancel_requested(job_repo, job_id):
                    await _cleanup_cancelled_run(
                        session=session,
                        doc_repo=doc_repo,
                        project_repo=project_repo,
                        settings_repo=settings_repo,
                        vector_repo=vector_repo,
                        project_id=project_id,
                        had_previous_index=had_previous_index,
                        full_rebuild=full_rebuild,
                        settings_changed_rebuild=settings_changed_rebuild,
                        collection_rebuilt=collection_rebuilt,
                        current_document_id=None,
                    )
                    log.info(
                        "Indexing job cancelled cooperatively",
                        job_id=str(job_id),
                        documents_processed=i,
                    )
                    return

                # Mark document as INDEXING
                await doc_repo.update_status(doc.id, DocumentStatus.INDEXING)
                await session.commit()

                # Get chunks via the eager-loaded relationship
                chunks = doc.chunks
                if _document_requires_rechunk(doc, current_chunk_params_hash):
                    log.info(
                        "Refreshing document chunks",
                        doc_id=str(doc.id),
                        filename=doc.filename,
                    )
                    chunks = await _reparse_document(
                        session, doc, settings.chunk_size, settings.chunk_overlap
                    )
                    if not chunks:
                        log.warning("Re-parse produced no chunks", doc_id=str(doc.id))
                        if await _cancel_requested(job_repo, job_id):
                            await _cleanup_cancelled_run(
                                session=session,
                                doc_repo=doc_repo,
                                project_repo=project_repo,
                                settings_repo=settings_repo,
                                vector_repo=vector_repo,
                                project_id=project_id,
                                had_previous_index=had_previous_index,
                                full_rebuild=full_rebuild,
                                settings_changed_rebuild=settings_changed_rebuild,
                                collection_rebuilt=collection_rebuilt,
                                current_document_id=doc.id,
                            )
                            log.info(
                                "Indexing job cancelled after re-parse",
                                job_id=str(job_id),
                                documents_processed=i,
                            )
                            return
                        await doc_repo.update_status(doc.id, DocumentStatus.INDEXED)
                        await job_repo.update_progress(job_id, i + 1, total_docs, doc.id)
                        await session.commit()
                        continue

                texts = [chunk.content for chunk in chunks]
                chunk_ids = [str(chunk.id) for chunk in chunks]
                metadatas = [
                    {
                        "project_id": str(project_id),
                        "document_id": str(doc.id),
                        "chunk_index": chunk.position,
                        "document_name": doc.filename,
                    }
                    for chunk in chunks
                ]

                if not collection_rebuilt:
                    await asyncio.to_thread(
                        vector_repo.delete_document_embeddings,
                        collection_name,
                        str(doc.id),
                    )

                # Embed
                embeddings = await embedding_service.embed_texts(texts, embedding_model)
                if await _cancel_requested(job_repo, job_id):
                    await _cleanup_cancelled_run(
                        session=session,
                        doc_repo=doc_repo,
                        project_repo=project_repo,
                        settings_repo=settings_repo,
                        vector_repo=vector_repo,
                        project_id=project_id,
                        had_previous_index=had_previous_index,
                        full_rebuild=full_rebuild,
                        settings_changed_rebuild=settings_changed_rebuild,
                        collection_rebuilt=collection_rebuilt,
                        current_document_id=doc.id,
                    )
                    log.info(
                        "Indexing job cancelled after embedding",
                        job_id=str(job_id),
                        documents_processed=i,
                    )
                    return

                # Upsert into vector store
                await asyncio.to_thread(
                    vector_repo.upsert_embeddings,
                    collection_name,
                    chunk_ids,
                    embeddings,
                    texts,
                    metadatas,
                )
                if await _cancel_requested(job_repo, job_id):
                    await _cleanup_cancelled_run(
                        session=session,
                        doc_repo=doc_repo,
                        project_repo=project_repo,
                        settings_repo=settings_repo,
                        vector_repo=vector_repo,
                        project_id=project_id,
                        had_previous_index=had_previous_index,
                        full_rebuild=full_rebuild,
                        settings_changed_rebuild=settings_changed_rebuild,
                        collection_rebuilt=collection_rebuilt,
                        current_document_id=doc.id,
                    )
                    log.info(
                        "Indexing job cancelled after vector upsert",
                        job_id=str(job_id),
                        documents_processed=i,
                    )
                    return

                # Update document metadata
                doc.status = DocumentStatus.INDEXED
                doc.embedding_model_version = embedding_model
                doc.chunk_params_hash = current_chunk_params_hash
                await session.flush()

                # Update job progress
                await job_repo.update_progress(job_id, i + 1, total_docs, doc.id)
                await session.commit()

            # Re-check settings to detect if they changed during the run.
            # If the hash differs, the freshly built index is already stale.
            session.expire_all()
            current_settings = await settings_repo.get()
            final_hash = compute_chunk_params_hash(
                current_settings.chunk_size,
                current_settings.chunk_overlap,
                current_settings.embedding_model,
            )
            final_index_status = await _compute_project_index_status(
                doc_repo,
                project_repo,
                settings_repo,
                project_id,
            )
            if final_hash != current_chunk_params_hash:
                final_index_status = "stale"

            # Mark job completed
            completed_at = datetime.now(timezone.utc)
            await job_repo.update_status(job_id, IndexingJobStatus.COMPLETED)
            await session.execute(
                update(Project)
                .where(Project.id == project_id)
                .values(
                    last_indexed_at=completed_at,
                    index_status=final_index_status,
                    updated_at=completed_at,
                )
            )
            await session.commit()

            log.info(
                "Indexing job completed",
                job_id=str(job_id),
                project_id=str(project_id),
                documents=total_docs,
            )

    except Exception as e:
        log.error(
            "Indexing job failed",
            job_id=str(job_id),
            project_id=str(project_id),
            error=str(e),
        )
        # Update job status to FAILED in a fresh session
        try:
            async with session_factory() as err_session:
                from app.repositories.document import SQLAlchemyDocumentRepository as ErrDocRepo
                from app.repositories.indexing_job import SQLAlchemyIndexingJobRepository as ErrJobRepo
                from app.repositories.project import SQLAlchemyProjectRepository as ErrProjRepo

                err_job_repo = ErrJobRepo(err_session)
                err_proj_repo = ErrProjRepo(err_session)
                err_doc_repo = ErrDocRepo(err_session)

                await err_job_repo.update_status(
                    job_id,
                    IndexingJobStatus.FAILED,
                    error_detail={
                        "stage": "indexing",
                        "message": str(e),
                        "traceback_summary": traceback.format_exc()[-500:],
                    },
                )

                # Reset any documents stuck in INDEXING so they are
                # eligible for the next retry attempt.
                reset_count = await err_doc_repo.reset_indexing_documents(project_id)
                if reset_count > 0:
                    log.info(
                        "Reset stuck INDEXING documents after job failure",
                        job_id=str(job_id),
                        project_id=str(project_id),
                        reset_count=reset_count,
                    )

                project = await err_proj_repo.get_by_id(project_id)
                new_status = (
                    "stale" if project and project.last_indexed_at else "not_indexed"
                )
                await err_proj_repo.update(project_id, index_status=new_status)
                await err_session.commit()
        except Exception as inner_e:
            log.error(
                "Failed to record indexing failure",
                job_id=str(job_id),
                error=str(inner_e),
            )


# ------------------------------------------------------------------
# Stale detection utility for settings changes
# ------------------------------------------------------------------


async def mark_documents_stale_after_settings_change(
    session: AsyncSession,
    old_chunk_size: int,
    old_chunk_overlap: int,
    old_embedding_model: str,
    new_chunk_size: int,
    new_chunk_overlap: int,
    new_embedding_model: str,
) -> int:
    """Mark indexed documents as REINDEX_REQUIRED when indexing params change.

    Returns the number of affected documents.
    """
    if (
        old_chunk_size == new_chunk_size
        and old_chunk_overlap == new_chunk_overlap
        and old_embedding_model == new_embedding_model
    ):
        return 0

    # Mark indexed documents as needing reindex
    result = await session.execute(
        update(Document)
        .where(Document.status == DocumentStatus.INDEXED)
        .values(status=DocumentStatus.REINDEX_REQUIRED)
    )
    affected = result.rowcount

    # Mark indexed projects as stale
    await session.execute(
        update(Project)
        .where(Project.index_status == "indexed")
        .values(index_status="stale")
    )

    if affected > 0:
        logger.info(
            "Documents marked stale after settings change",
            affected_documents=affected,
        )

    return affected
