from pydantic import BaseModel


class CapabilityResult(BaseModel):
    status: str
    message: str | None = None
    details: dict | None = None


class ConnectionTestResult(BaseModel):
    auth: CapabilityResult
    chat: CapabilityResult
    embedding: CapabilityResult
    provider_capabilities: dict | None = None


class ModelInfo(BaseModel):
    id: str
    owned_by: str


class ModelListResponse(BaseModel):
    models: list[ModelInfo]
    cached: bool = False
    warning: str | None = None
