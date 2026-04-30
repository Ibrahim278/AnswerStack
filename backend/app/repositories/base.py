from abc import ABC, abstractmethod
from typing import Generic, TypeVar
from uuid import UUID

T = TypeVar("T")


class Repository(ABC, Generic[T]):
    @abstractmethod
    async def get_by_id(self, id: UUID) -> T | None: ...

    @abstractmethod
    async def create(self, entity: T) -> T: ...

    @abstractmethod
    async def delete(self, id: UUID) -> bool: ...
