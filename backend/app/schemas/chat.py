from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=10000)
    session_id: UUID | None = None


class ChatSessionCreate(BaseModel):
    title: str | None = Field(None, max_length=255)


class ChatSessionRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    role: str
    content: str
    sources_json: list | dict | None
    created_at: datetime


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailResponse(ChatSessionResponse):
    messages: list[ChatMessageResponse]


class SourceItem(BaseModel):
    document_name: str
    chunk_text: str
    page_number: int | None
    relevance_score: float
