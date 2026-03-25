from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, UploadFile

from app.core.dependencies import get_document_service, get_project_service
from app.schemas.document import DocumentResponse, DocumentUploadResult
from app.schemas.pagination import PaginatedResponse
from app.services.document import DocumentService, FileData
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

    # Read file data from UploadFile objects
    file_data_list = []
    for file in files:
        content = await file.read()
        file_data_list.append(
            FileData(
                filename=file.filename or "unnamed",
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
    service: DocumentService = Depends(get_document_service),
) -> None:
    """Delete a document, its chunks, and its file from disk."""
    # Verify document belongs to the requested project
    document = await service.get_document(document_id)
    if document.project_id != project_id:
        from app.core.errors import NotFoundError
        raise NotFoundError("document", str(document_id))
    await service.delete_document(document_id)
