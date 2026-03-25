from abc import abstractmethod
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.indexing_job import IndexingJob, IndexingJobStatus
from app.repositories.base import Repository


class IndexingJobRepository(Repository[IndexingJob]):
    @abstractmethod
    async def get_latest_by_project(self, project_id: UUID) -> IndexingJob | None:
        """Return the most recent job for a project."""
        ...

    @abstractmethod
    async def get_running_by_project(self, project_id: UUID) -> IndexingJob | None:
        """Return the currently running job for a project, if any."""
        ...

    @abstractmethod
    async def update_status(
        self,
        job_id: UUID,
        status: IndexingJobStatus,
        error_detail: dict | None = None,
    ) -> IndexingJob | None:
        """Update job status and optionally set error_detail."""
        ...

    @abstractmethod
    async def update_progress(
        self,
        job_id: UUID,
        documents_processed: int,
        documents_total: int,
        current_document_id: UUID | None,
    ) -> IndexingJob | None:
        """Update job progress counters and percentage."""
        ...

    @abstractmethod
    async def mark_orphaned_running_as_failed(self) -> int:
        """Mark all RUNNING jobs as FAILED (startup recovery)."""
        ...


class SQLAlchemyIndexingJobRepository(IndexingJobRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_id(self, id: UUID) -> IndexingJob | None:
        result = await self._session.execute(
            select(IndexingJob).where(IndexingJob.id == id)
        )
        return result.scalar_one_or_none()

    async def create(self, entity: IndexingJob) -> IndexingJob:
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def delete(self, id: UUID) -> bool:
        job = await self.get_by_id(id)
        if job is None:
            return False
        await self._session.delete(job)
        await self._session.flush()
        return True

    async def get_latest_by_project(self, project_id: UUID) -> IndexingJob | None:
        result = await self._session.execute(
            select(IndexingJob)
            .where(IndexingJob.project_id == project_id)
            .order_by(IndexingJob.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_running_by_project(self, project_id: UUID) -> IndexingJob | None:
        result = await self._session.execute(
            select(IndexingJob)
            .where(
                IndexingJob.project_id == project_id,
                IndexingJob.status == IndexingJobStatus.RUNNING,
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def update_status(
        self,
        job_id: UUID,
        status: IndexingJobStatus,
        error_detail: dict | None = None,
    ) -> IndexingJob | None:
        job = await self.get_by_id(job_id)
        if job is None:
            return None

        job.status = status
        if error_detail is not None:
            job.error_detail = error_detail

        if status in (
            IndexingJobStatus.COMPLETED,
            IndexingJobStatus.FAILED,
            IndexingJobStatus.CANCELLED,
        ):
            job.completed_at = datetime.now(timezone.utc)

        if status == IndexingJobStatus.RUNNING and job.started_at is None:
            job.started_at = datetime.now(timezone.utc)

        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def update_progress(
        self,
        job_id: UUID,
        documents_processed: int,
        documents_total: int,
        current_document_id: UUID | None,
    ) -> IndexingJob | None:
        job = await self.get_by_id(job_id)
        if job is None:
            return None

        job.documents_processed = documents_processed
        job.documents_total = documents_total
        job.current_document_id = current_document_id
        job.percentage = (
            (documents_processed / documents_total * 100)
            if documents_total > 0
            else 0.0
        )

        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def mark_orphaned_running_as_failed(self) -> int:
        now = datetime.now(timezone.utc)
        result = await self._session.execute(
            update(IndexingJob)
            .where(IndexingJob.status == IndexingJobStatus.RUNNING)
            .values(
                status=IndexingJobStatus.FAILED,
                error_detail={
                    "stage": "startup_recovery",
                    "message": "Job interrupted by server restart",
                },
                completed_at=now,
            )
        )
        return result.rowcount
