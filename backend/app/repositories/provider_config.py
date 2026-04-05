from abc import abstractmethod
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider_config import ProviderConfig
from app.repositories.base import Repository


class ProviderConfigRepository(Repository[ProviderConfig]):
    @abstractmethod
    async def list_all(self) -> list[ProviderConfig]: ...

    @abstractmethod
    async def get_by_name(self, name: str) -> ProviderConfig | None: ...

    @abstractmethod
    async def update(self, id: UUID, **kwargs) -> ProviderConfig | None: ...


class SQLAlchemyProviderConfigRepository(ProviderConfigRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_id(self, id: UUID) -> ProviderConfig | None:
        result = await self._session.execute(
            select(ProviderConfig).where(ProviderConfig.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> ProviderConfig | None:
        result = await self._session.execute(
            select(ProviderConfig).where(ProviderConfig.name == name)
        )
        return result.scalar_one_or_none()

    async def create(self, entity: ProviderConfig) -> ProviderConfig:
        self._session.add(entity)
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    async def delete(self, id: UUID) -> bool:
        provider = await self.get_by_id(id)
        if provider is None:
            return False
        await self._session.delete(provider)
        await self._session.flush()
        return True

    async def list_all(self) -> list[ProviderConfig]:
        result = await self._session.execute(
            select(ProviderConfig).order_by(ProviderConfig.name.asc())
        )
        return list(result.scalars().all())

    async def update(self, id: UUID, **kwargs) -> ProviderConfig | None:
        provider = await self.get_by_id(id)
        if provider is None:
            return None
        for key, value in kwargs.items():
            if hasattr(provider, key):
                setattr(provider, key, value)
        provider.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(provider)
        return provider
