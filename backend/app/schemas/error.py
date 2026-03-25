from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error_code: str  # Dot-namespaced, e.g. "project.not_found"
    message: str  # Human-readable message
    retryable: bool  # Can the client retry this request?
    suggested_action: str  # What should the user do?
    request_id: str | None = None  # Correlation ID from middleware
