from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


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
    reasoning_effort: str
    max_completion_tokens: int | None
    tts_provider: str
    tts_voice_id: str
    active_provider_id: UUID | None
    provider_capabilities: dict | None
    updated_at: datetime

    @field_serializer("provider_api_key")
    @classmethod
    def mask_api_key(cls, v: str | None) -> str | None:
        if not v:
            return v
        if len(v) <= 8:
            return "***"
        return f"{v[:3]}...{v[-4:]}"


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
    reasoning_effort: str | None = Field(None, max_length=20)
    max_completion_tokens: int | None = Field(None, ge=1, le=131072)
    tts_provider: str | None = Field(None, max_length=50)
    tts_voice_id: str | None = Field(None, max_length=255)

    @field_validator("reasoning_effort")
    @classmethod
    def validate_reasoning_effort(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"", "none", "minimal", "low", "medium", "high", "xhigh"}
        if v not in allowed:
            raise ValueError(f"reasoning_effort must be one of: {', '.join(sorted(allowed - {''}))} (or empty for provider default)")
        return v

    @field_validator("provider_url")
    @classmethod
    def validate_provider_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v.strip() == "":
            return ""
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("provider_url must use http:// or https:// scheme")
        if not parsed.hostname:
            raise ValueError("provider_url must have a valid hostname")
        return v.rstrip("/")

    @model_validator(mode="after")
    def validate_chunk_overlap(self) -> "SettingsUpdate":
        if self.chunk_overlap is not None and self.chunk_size is not None:
            if self.chunk_overlap >= self.chunk_size:
                raise ValueError("chunk_overlap must be less than chunk_size")
        return self
