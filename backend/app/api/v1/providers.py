from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.core.dependencies import get_provider_config_repository, get_settings_service
from app.core.errors import ConflictError, NotFoundError
from app.models.provider_config import ProviderConfig
from app.repositories.provider_config import ProviderConfigRepository
from app.schemas.provider_config import (
    ProviderConfigCreate,
    ProviderConfigListResponse,
    ProviderConfigResponse,
    ProviderConfigUpdate,
)
from app.schemas.settings import SettingsResponse
from app.services.indexing import mark_documents_stale_after_settings_change
from app.services.settings import SettingsService

logger = structlog.get_logger()

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=ProviderConfigListResponse)
async def list_providers(
    repo: ProviderConfigRepository = Depends(get_provider_config_repository),
) -> ProviderConfigListResponse:
    """List all saved provider configurations."""
    providers = await repo.list_all()
    return ProviderConfigListResponse(
        items=[ProviderConfigResponse.model_validate(p) for p in providers]
    )


@router.post("", status_code=201, response_model=ProviderConfigResponse)
async def create_provider(
    data: ProviderConfigCreate,
    repo: ProviderConfigRepository = Depends(get_provider_config_repository),
) -> ProviderConfigResponse:
    """Create a new provider configuration."""
    existing = await repo.get_by_name(data.name)
    if existing is not None:
        raise ConflictError("provider", f"A provider named '{data.name}' already exists.")

    provider = ProviderConfig(
        name=data.name,
        provider_url=data.provider_url,
        provider_api_key=data.provider_api_key,
        provider_model=data.provider_model,
        embedding_model=data.embedding_model,
    )
    provider = await repo.create(provider)
    logger.info("Provider config created", provider_id=str(provider.id), name=provider.name)
    return ProviderConfigResponse.model_validate(provider)


@router.put("/{provider_id}", response_model=ProviderConfigResponse)
async def update_provider(
    provider_id: UUID,
    data: ProviderConfigUpdate,
    repo: ProviderConfigRepository = Depends(get_provider_config_repository),
) -> ProviderConfigResponse:
    """Update an existing provider configuration."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        provider = await repo.get_by_id(provider_id)
        if provider is None:
            raise NotFoundError("provider", str(provider_id))
        return ProviderConfigResponse.model_validate(provider)

    # Check name uniqueness on rename
    if "name" in updates:
        existing = await repo.get_by_name(updates["name"])
        if existing is not None and existing.id != provider_id:
            raise ConflictError("provider", f"A provider named '{updates['name']}' already exists.")

    provider = await repo.update(provider_id, **updates)
    if provider is None:
        raise NotFoundError("provider", str(provider_id))

    return ProviderConfigResponse.model_validate(provider)


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: UUID,
    repo: ProviderConfigRepository = Depends(get_provider_config_repository),
    settings_service: SettingsService = Depends(get_settings_service),
) -> None:
    """Delete a provider configuration. If it was active, clears active_provider_id."""
    # Check if this provider is active before deleting
    settings = await settings_service.get_settings()
    was_active = settings.active_provider_id == provider_id

    deleted = await repo.delete(provider_id)
    if not deleted:
        raise NotFoundError("provider", str(provider_id))

    # Explicitly clear active_provider_id (can't rely on ON DELETE SET NULL with all SQLite configs)
    if was_active:
        settings.active_provider_id = None
        # Flush is handled by the session commit at request end

    logger.info("Provider config deleted", provider_id=str(provider_id))


@router.post("/{provider_id}/activate", response_model=SettingsResponse)
async def activate_provider(
    provider_id: UUID,
    request: Request,
    repo: ProviderConfigRepository = Depends(get_provider_config_repository),
    settings_service: SettingsService = Depends(get_settings_service),
    session: AsyncSession = Depends(get_db_session),
) -> SettingsResponse:
    """Switch to a saved provider. Copies its config into settings and reconfigures the runtime provider."""
    provider = await repo.get_by_id(provider_id)
    if provider is None:
        raise NotFoundError("provider", str(provider_id))

    # Capture old embedding model for stale detection
    old_settings = await settings_service.get_settings()
    old_embedding_model = old_settings.embedding_model

    # Copy provider config into settings
    settings = await settings_service.update_settings(
        provider_url=provider.provider_url,
        provider_api_key=provider.provider_api_key,
        provider_model=provider.provider_model,
        embedding_model=provider.embedding_model,
        active_provider_id=provider.id,
    )

    # Reconfigure the runtime ProviderService
    provider_service = getattr(request.app.state, "provider_service", None)
    if provider_service is not None:
        if provider.provider_url and provider.provider_url.strip():
            await provider_service.configure(
                base_url=provider.provider_url,
                api_key=provider.provider_api_key,
            )
        else:
            await provider_service.close()

    # Mark documents stale if embedding model changed
    await mark_documents_stale_after_settings_change(
        session,
        old_settings.chunk_size,
        old_settings.chunk_overlap,
        old_embedding_model,
        settings.chunk_size,
        settings.chunk_overlap,
        settings.embedding_model,
    )

    logger.info("Provider activated", provider_id=str(provider_id), name=provider.name)
    return SettingsResponse.model_validate(settings)
