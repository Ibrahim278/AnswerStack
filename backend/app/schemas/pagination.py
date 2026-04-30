import base64
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel

from app.core.errors import ValidationError

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False


def encode_cursor(id: UUID) -> str:
    return base64.urlsafe_b64encode(str(id).encode()).decode()


def decode_cursor(cursor: str) -> UUID:
    try:
        return UUID(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception:
        raise ValidationError("cursor", "Invalid pagination cursor")
