from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


class ProviderConfigCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    provider_url: str = Field("", max_length=2048)
    provider_api_key: str = Field("", max_length=512)
    provider_model: str = Field("", max_length=255)
    embedding_model: str = Field("", max_length=255)

    @field_validator("provider_url")
    @classmethod
    def validate_provider_url(cls, v: str) -> str:
        if not v or v.strip() == "":
            return ""
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("provider_url must use http:// or https:// scheme")
        if not parsed.hostname:
            raise ValueError("provider_url must have a valid hostname")
        return v.rstrip("/")


class ProviderConfigUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    provider_url: str | None = Field(None, max_length=2048)
    provider_api_key: str | None = Field(None, max_length=512)
    provider_model: str | None = Field(None, max_length=255)
    embedding_model: str | None = Field(None, max_length=255)

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


class ProviderConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    provider_url: str
    provider_api_key: str
    provider_model: str
    embedding_model: str
    created_at: datetime
    updated_at: datetime

    @field_serializer("provider_api_key")
    @classmethod
    def mask_api_key(cls, v: str | None) -> str | None:
        if not v:
            return v
        if len(v) <= 8:
            return "***"
        return f"{v[:3]}...{v[-4:]}"


class ProviderConfigListResponse(BaseModel):
    items: list[ProviderConfigResponse]
