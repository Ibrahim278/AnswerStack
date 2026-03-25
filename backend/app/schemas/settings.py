from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider_url: str
    provider_api_key: str
    provider_model: str
    embedding_model: str
    temperature: float
    system_prompt: str
    chunk_size: int
    chunk_overlap: int
    top_k: int
    similarity_threshold: float
    reranker_enabled: bool
    provider_capabilities: dict | None
    updated_at: datetime


class SettingsUpdate(BaseModel):
    provider_url: str | None = Field(None, max_length=2048)
    provider_api_key: str | None = Field(None, max_length=512)
    provider_model: str | None = Field(None, max_length=255)
    embedding_model: str | None = Field(None, max_length=255)
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    system_prompt: str | None = Field(None, max_length=10000)
    chunk_size: int | None = Field(None, ge=100, le=32000)
    chunk_overlap: int | None = Field(None, ge=0, le=16000)
    top_k: int | None = Field(None, ge=1, le=50)
    similarity_threshold: float | None = Field(None, ge=0.0, le=1.0)
    reranker_enabled: bool | None = None

    @model_validator(mode="after")
    def validate_chunk_overlap(self) -> "SettingsUpdate":
        if self.chunk_overlap is not None and self.chunk_size is not None:
            if self.chunk_overlap >= self.chunk_size:
                raise ValueError("chunk_overlap must be less than chunk_size")
        return self
