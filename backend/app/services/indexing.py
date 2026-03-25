"""Indexing service: job lifecycle, background runner, and stale detection."""

import asyncio
import traceback
from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.hashing import compute_chunk_params_hash
from app.models.document import Document, DocumentStatus
from app.models.indexing_job import IndexingJob, IndexingJobStatus
from app.models.project import Project
from app.repositories.document import DocumentRepository
from app.repositories.indexing_job import IndexingJobRepository
from app.repositories.project import ProjectRepository
from app.repositories.settings import SettingsRepository
from app.repositories.vector import VectorRepository
from app.services.embedding import EmbeddingService

logger = structlog.get_logger()

# Document statuses eligible for (re-)indexing
_INDEXABLE_STATUSES = (
    DocumentStatus.PARSED,
    DocumentStatus.INDEXED,
    DocumentStatus.STALE,
    DocumentStatus.REINDEX_REQUIRED,
)


class IndexingService:
    """Orchestrates indexing job lifecycle without touching SQLAlchemy directly."""

    def __init__(
        self,
        job_repo: IndexingJobRepository,
        document_repo: DocumentRepository,
        project_repo: ProjectRepository,
        settings_repo: SettingsRepository,
    ):
        self._job_repo = job_repo
        self._document_repo = document_repo
        self._project_repo = project_repo
        self._settings_repo = settings_repo

    async def trigger_build(self, project_id: UUID) -> IndexingJob:
        """Create a new indexing job for the project.

        Raises NotFoundError if project doesn't exist, ConflictError if a
        job is already running, AppError if there are no parsed documents.
        """
        project = await self._project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundError("project", str(project_id))

        running = await self._job_repo.get_running_by_project(project_id)
        if running is not None:
            raise ConflictError(
                "indexing",
                "An indexing job is already running for this project.",
            )

        documents = await self._get_indexable_documents(project_id)
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
        """Cancel the currently running job for a project.

        The background runner performs cooperative cancellation checks.
        """
        running = await self._job_repo.get_running_by_project(project_id)
        if running is None:
            raise NotFoundError("indexing_job", str(project_id))

        updated = await self._job_repo.update_status(
            running.id, IndexingJobStatus.CANCELLED
        )

        project = await self._project_repo.get_by_id(project_id)
        new_status = "stale" if project and project.last_indexed_at else "not_indexed"
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

        documents = await self._get_indexable_documents(project_id)
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
        settings = await self._settings_repo.get()
        current_hash = compute_chunk_params_hash(
            settings.chunk_size, settings.chunk_overlap, settings.embedding_model
        )

        project = await self._project_repo.get_by_id(project_id)
        if project is None or project.last_indexed_at is None:
            return "not_indexed"

        documents = await self._document_repo.list_by_project(project_id, None, 10000)
        stale_statuses = (
            DocumentStatus.PARSED,
            DocumentStatus.STALE,
            DocumentStatus.REINDEX_REQUIRED,
            DocumentStatus.UPLOADED,
        )
        for doc in documents:
            if doc.status in stale_statuses:
                return "stale"
            if doc.chunk_params_hash and doc.chunk_params_hash != current_hash:
                return "stale"

        return "indexed"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_indexable_documents(self, project_id: UUID) -> list:
        """Return documents eligible for indexing."""
        all_docs = await self._document_repo.list_by_project(project_id, None, 10000)
        return [d for d in all_docs if d.status in _INDEXABLE_STATUSES]


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

            # Mark job as running
            await job_repo.update_status(job_id, IndexingJobStatus.RUNNING)
            await session.commit()

            # Read current settings
            settings = await settings_repo.get()
            embedding_model = settings.embedding_model
            current_chunk_params_hash = compute_chunk_params_hash(
                settings.chunk_size, settings.chunk_overlap, embedding_model
            )

            # Gather indexable documents
            all_docs = await doc_repo.list_by_project(project_id, None, 10000)
            documents = [d for d in all_docs if d.status in _INDEXABLE_STATUSES]
            total_docs = len(documents)

            # Full rebuild: delete and re-create collection
            await asyncio.to_thread(vector_repo.delete_collection, project_id)
            await asyncio.to_thread(vector_repo.create_collection, project_id)

            for i, doc in enumerate(documents):
                # Cooperative cancellation check
                refreshed_job = await job_repo.get_by_id(job_id)
                if refreshed_job and refreshed_job.status == IndexingJobStatus.CANCELLED:
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
                if not chunks:
                    # No chunks — mark as indexed with 0 embeddings
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

                # Embed
                embeddings = await embedding_service.embed_texts(texts, embedding_model)

                # Upsert into vector store
                await asyncio.to_thread(
                    vector_repo.upsert_embeddings,
                    project_id,
                    chunk_ids,
                    embeddings,
                    texts,
                    metadatas,
                )

                # Update document metadata
                doc.status = DocumentStatus.INDEXED
                doc.embedding_model_version = embedding_model
                doc.chunk_params_hash = current_chunk_params_hash
                await session.flush()

                # Update job progress
                await job_repo.update_progress(job_id, i + 1, total_docs, doc.id)
                await session.commit()

            # Mark job completed
            await job_repo.update_status(job_id, IndexingJobStatus.COMPLETED)
            await project_repo.update(
                project_id,
                last_indexed_at=datetime.now(timezone.utc),
                index_status="indexed",
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
                from app.repositories.indexing_job import SQLAlchemyIndexingJobRepository as ErrJobRepo
                from app.repositories.project import SQLAlchemyProjectRepository as ErrProjRepo

                err_job_repo = ErrJobRepo(err_session)
                err_proj_repo = ErrProjRepo(err_session)

                await err_job_repo.update_status(
                    job_id,
                    IndexingJobStatus.FAILED,
                    error_detail={
                        "stage": "indexing",
                        "message": str(e),
                        "traceback_summary": traceback.format_exc()[-500:],
                    },
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
