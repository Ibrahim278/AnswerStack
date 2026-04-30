from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    filename: str
    original_filename: str
    file_type: str
    file_size: int
    checksum: str
    status: str
    chunk_count: int
    error_detail: dict | None
    created_at: datetime
    updated_at: datetime


class RejectedFile(BaseModel):
    filename: str
    reason: str
    error_code: str


class DocumentUploadResult(BaseModel):
    uploaded: list[DocumentResponse]
    rejected: list[RejectedFile]
