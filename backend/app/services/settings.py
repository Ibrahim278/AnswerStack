from app.models.settings import Settings as SettingsModel
from app.repositories.settings import SettingsRepository


class SettingsService:
    def __init__(self, repo: SettingsRepository):
        self._repo = repo

    async def get_settings(self) -> SettingsModel:
        return await self._repo.get()

    async def update_settings(self, **kwargs) -> SettingsModel:
        filtered = {k: v for k, v in kwargs.items() if v is not None}
        if not filtered:
            return await self._repo.get()
        return await self._repo.update(**filtered)

    async def reset_settings(self) -> SettingsModel:
        return await self._repo.reset()
