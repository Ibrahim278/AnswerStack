import asyncio
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, UploadFile

from app.core.config import get_settings
from app.core.dependencies import (
    get_document_service,
    get_indexing_service,
    get_project_repository,
    get_project_service,
)
from app.models.document import DocumentStatus
from app.repositories.project import ProjectRepository
from app.schemas.document import DocumentResponse, DocumentUploadResult, RejectedFile
from app.schemas.pagination import PaginatedResponse
from app.services.document import DocumentService, FileData
from app.services.indexing import IndexingService
from app.services.project import ProjectService

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])


@router.post("", status_code=202, response_model=DocumentUploadResult)
async def upload_documents(
    project_id: UUID,
    files: list[UploadFile],
    background_tasks: BackgroundTasks,
    request: Request,
    service: DocumentService = Depends(get_document_service),
    project_service: ProjectService = Depends(get_project_service),
) -> DocumentUploadResult:
    """Upload one or more documents to a project.

    Returns 202 Accepted with upload results. Files are parsed in the background.
    Validates file type (.txt, .md, .pdf), size, and detects duplicates.
    """
    # Verify project exists (raises NotFoundError if missing)
    await project_service.get_project(project_id)

    # Read file data from UploadFile objects with streaming size check
    settings = get_settings()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    file_data_list: list[FileData] = []
    early_rejected: list[RejectedFile] = []
    for file in files:
        original_name = file.filename or "unnamed"
        content = b""
        too_large = False
        while chunk := await file.read(8192):
            content += chunk
            if len(content) > max_bytes:
                too_large = True
                break
        if too_large:
            early_rejected.append(
                RejectedFile(
                    filename=original_name,
                    reason=f"File exceeds {settings.max_upload_size_mb}MB limit.",
                    error_code="document.too_large",
                )
            )
            continue
        file_data_list.append(
            FileData(
                filename=original_name,
                content=content,
                content_type=file.content_type,
            )
        )

    result = await service.upload_documents(
        project_id,
        file_data_list,
        background_tasks,
        request.app.state.session_factory,
    )
    # Merge files rejected during streaming read with service-level rejections
    if early_rejected:
        result = DocumentUploadResult(
            uploaded=result.uploaded,
            rejected=early_rejected + result.rejected,
        )
    return result


@router.get("", response_model=PaginatedResponse[DocumentResponse])
async def list_documents(
    project_id: UUID,
    cursor: str | None = Query(None, description="Pagination cursor from previous response"),
    limit: int = Query(50, ge=1, le=100, description="Number of documents to return"),
    service: DocumentService = Depends(get_document_service),
) -> PaginatedResponse[DocumentResponse]:
    """List all documents in a project with cursor-based pagination."""
    return await service.list_documents(project_id, cursor=cursor, limit=limit)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    project_id: UUID,
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    """Get a single document by ID with full metadata."""
    document = await service.get_document(document_id)
    # Verify document belongs to the requested project
    if document.project_id != project_id:
        from app.core.errors import NotFoundError
        raise NotFoundError("document", str(document_id))
    return DocumentResponse.model_validate(document)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    project_id: UUID,
    document_id: UUID,
    request: Request,
    service: DocumentService = Depends(get_document_service),
    indexing_service: IndexingService = Depends(get_indexing_service),
    project_repo: ProjectRepository = Depends(get_project_repository),
) -> None:
    """Delete a document, its chunks, and its file from disk."""
    # Verify document belongs to the requested project
    document = await service.get_document(document_id)
    if document.project_id != project_id:
        from app.core.errors import NotFoundError
        raise NotFoundError("document", str(document_id))

    was_indexed = document.status == DocumentStatus.INDEXED
    await service.delete_document(document_id)

    if was_indexed:
        await asyncio.to_thread(
            request.app.state.vector_repo.delete_document_embeddings,
            f"project_{project_id}",
            str(document_id),
        )

    new_status = await indexing_service.compute_stale_status(project_id)
    await project_repo.update(project_id, index_status=new_status)
