import base64
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False


def encode_cursor(id: UUID) -> str:
    return base64.urlsafe_b64encode(str(id).encode()).decode()


def decode_cursor(cursor: str) -> UUID:
    return UUID(base64.urlsafe_b64decode(cursor.encode()).decode())
