from fastapi import APIRouter, Depends, Request

from app.core.dependencies import get_settings_service
from app.schemas.settings import SettingsResponse, SettingsUpdate
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
) -> SettingsResponse:
    """Update settings with partial data. Only provided fields are changed."""
    updates = body.model_dump(exclude_unset=True)

    if not updates:
        settings = await service.get_settings()
        return SettingsResponse.model_validate(settings)

    settings = await service.update_settings(**updates)

    # If provider config changed, reconfigure the provider client
    if "provider_url" in updates or "provider_api_key" in updates:
        provider_service = getattr(request.app.state, "provider_service", None)
        if provider_service is not None:
            provider_service.configure(
                base_url=settings.provider_url,
                api_key=settings.provider_api_key,
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
