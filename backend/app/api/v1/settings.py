import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.dependencies import get_provider_config_repository, get_settings_service
from app.repositories.provider_config import ProviderConfigRepository
from app.schemas.settings import SettingsResponse, SettingsUpdate
from app.services.indexing import mark_documents_stale_after_settings_change
from app.services.settings import SettingsService
from app.services.speech.tts_factory import create_tts_provider, wrap_with_caching

logger = structlog.get_logger()

router = APIRouter(prefix="/settings", tags=["settings"])


def _swap_tts_provider(request: Request, provider_name: str) -> None:
    """Replace the runtime TTS provider on app.state.

    Closes the old provider's HTTP client if applicable, then
    creates and caches the new provider (or sets None for "none"/empty).
    """
    old_provider = getattr(request.app.state, "tts_provider", None)

    # Close old provider's httpx client if it has one
    if old_provider and hasattr(old_provider, "_client"):
        try:
            import asyncio
            asyncio.get_event_loop().create_task(old_provider._client.aclose())
        except Exception:
            pass
    # Also close inner provider's client if wrapped in caching
    if old_provider and hasattr(old_provider, "_inner"):
        inner = old_provider._inner
        if hasattr(inner, "_client"):
            try:
                import asyncio
                asyncio.get_event_loop().create_task(inner._client.aclose())
            except Exception:
                pass

    if not provider_name or provider_name == "none":
        request.app.state.tts_provider = None
        logger.info("TTS provider disabled")
        return

    env_settings = getattr(request.app.state, "settings", None)
    if env_settings is None:
        request.app.state.tts_provider = None
        return

    new_provider = create_tts_provider(provider_name, env_settings)
    if new_provider is not None:
        new_provider = wrap_with_caching(new_provider)
        logger.info("TTS provider swapped", provider=new_provider.provider_name)
    else:
        logger.warning("TTS provider swap failed", requested=provider_name)

    request.app.state.tts_provider = new_provider


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
    provider_repo: ProviderConfigRepository = Depends(get_provider_config_repository),
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
            if settings.provider_url and settings.provider_url.strip():
                await provider_service.configure(
                    base_url=settings.provider_url,
                    api_key=settings.provider_api_key,
                )
            else:
                await provider_service.close()

    # If TTS provider changed, swap the runtime provider
    if "tts_provider" in updates:
        _swap_tts_provider(request, settings.tts_provider)

    # If TTS voice changed, update the runtime default
    if "tts_voice_id" in updates:
        request.app.state.tts_default_voice_id = settings.tts_voice_id or ""

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

    # Sync provider field changes back to the active provider record
    provider_fields = {"provider_url", "provider_api_key", "provider_model", "embedding_model"}
    if settings.active_provider_id and provider_fields & updates.keys():
        sync_data = {k: v for k, v in updates.items() if k in provider_fields}
        await provider_repo.update(settings.active_provider_id, **sync_data)

    return SettingsResponse.model_validate(settings)


@router.put("/reset", response_model=SettingsResponse)
async def reset_settings(
    request: Request,
    service: SettingsService = Depends(get_settings_service),
) -> SettingsResponse:
    """Reset all settings to their default values."""
    settings = await service.reset_settings()

    # Reset TTS provider and voice
    _swap_tts_provider(request, settings.tts_provider)
    request.app.state.tts_default_voice_id = settings.tts_voice_id or ""

    # Reconfigure provider with reset defaults (only if URL is set)
    provider_service = getattr(request.app.state, "provider_service", None)
    if provider_service is not None:
        if settings.provider_url and settings.provider_url.strip():
            await provider_service.configure(
                base_url=settings.provider_url,
                api_key=settings.provider_api_key,
            )
        else:
            await provider_service.close()

    return SettingsResponse.model_validate(settings)
