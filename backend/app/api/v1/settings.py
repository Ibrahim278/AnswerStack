from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.dependencies import get_settings_service
from app.schemas.settings import SettingsResponse, SettingsUpdate
from app.services.indexing import mark_documents_stale_after_settings_change
from app.services.settings import SettingsService

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings(
    service: SettingsService = Depends(get_settings_service),
) -> SettingsResponse:
    """Get all current settings including provider config, basic, and advanced fields."""
    settings = await service.get_settings()
    return SettingsResponse.model_validate(settings)


@router.put("", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    request: Request,
    service: SettingsService = Depends(get_settings_service),
    session: AsyncSession = Depends(get_db_session),
) -> SettingsResponse:
    """Update settings with partial data. Only provided fields are changed."""
    updates = body.model_dump(exclude_unset=True)

    if not updates:
        settings = await service.get_settings()
        return SettingsResponse.model_validate(settings)

    # Capture old indexing params before update for stale detection
    old_settings = await service.get_settings()
    old_chunk_size = old_settings.chunk_size
    old_chunk_overlap = old_settings.chunk_overlap
    old_embedding_model = old_settings.embedding_model

    settings = await service.update_settings(**updates)

    # If provider config changed, reconfigure the provider client
    if "provider_url" in updates or "provider_api_key" in updates:
        provider_service = getattr(request.app.state, "provider_service", None)
        if provider_service is not None:
            provider_service.configure(
                base_url=settings.provider_url,
                api_key=settings.provider_api_key,
            )

    # If indexing params changed, mark indexed documents as stale
    await mark_documents_stale_after_settings_change(
        session,
        old_chunk_size,
        old_chunk_overlap,
        old_embedding_model,
        settings.chunk_size,
        settings.chunk_overlap,
        settings.embedding_model,
    )

    return SettingsResponse.model_validate(settings)


@router.put("/reset", response_model=SettingsResponse)
async def reset_settings(
    request: Request,
    service: SettingsService = Depends(get_settings_service),
) -> SettingsResponse:
    """Reset all settings to their default values."""
    settings = await service.reset_settings()

    # Reconfigure provider with reset defaults
    provider_service = getattr(request.app.state, "provider_service", None)
    if provider_service is not None:
        provider_service.configure(
            base_url=settings.provider_url,
            api_key=settings.provider_api_key,
        )

    return SettingsResponse.model_validate(settings)
