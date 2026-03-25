import structlog
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.schemas.error import ErrorResponse


class AppError(Exception):
    def __init__(
        self,
        error_code: str,
        message: str,
        status_code: int = 400,
        retryable: bool = False,
        suggested_action: str = "Check the request and try again.",
    ):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.suggested_action = suggested_action


class NotFoundError(AppError):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            error_code=f"{resource}.not_found",
            message=f"{resource.title()} with id '{resource_id}' not found.",
            status_code=404,
            retryable=False,
            suggested_action=f"Verify the {resource} ID and try again.",
        )


class ValidationError(AppError):
    def __init__(self, field: str, message: str):
        super().__init__(
            error_code=f"validation.{field}",
            message=message,
            status_code=422,
            retryable=False,
            suggested_action="Fix the validation error and retry.",
        )


class ConflictError(AppError):
    def __init__(self, resource: str, message: str):
        super().__init__(
            error_code=f"{resource}.conflict",
            message=message,
            status_code=409,
            retryable=False,
            suggested_action="Resolve the conflict and try again.",
        )


def _get_request_id() -> str | None:
    try:
        ctx = structlog.contextvars.get_contextvars()
        return ctx.get("request_id")
    except Exception:
        return None


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error_code=exc.error_code,
            message=exc.message,
            retryable=exc.retryable,
            suggested_action=exc.suggested_action,
            request_id=_get_request_id(),
        ).model_dump(),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first_error = errors[0] if errors else {}
    field = ".".join(str(loc) for loc in first_error.get("loc", ["unknown"]))
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            error_code=f"validation.{field}",
            message=first_error.get("msg", "Validation error"),
            retryable=False,
            suggested_action="Check the request body and fix the validation error.",
            request_id=_get_request_id(),
        ).model_dump(),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger = structlog.get_logger()
    logger.exception("Unhandled exception", exc_type=type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error_code="server.internal_error",
            message="An unexpected error occurred.",
            retryable=True,
            suggested_action="Try again later. If the problem persists, check the server logs.",
            request_id=_get_request_id(),
        ).model_dump(),
    )
