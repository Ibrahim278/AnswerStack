from fastapi import APIRouter, Depends, Request

from app.core.dependencies import get_settings_service
from app.core.errors import ProviderError
from app.schemas.provider import CapabilityResult, ConnectionTestResult, ModelInfo, ModelListResponse
from app.services.provider import ProviderService
from app.services.settings import SettingsService

router = APIRouter(prefix="/provider", tags=["provider"])


def _get_provider_service(request: Request) -> ProviderService:
    """Get the singleton ProviderService from app state."""
    provider_service = getattr(request.app.state, "provider_service", None)
    if provider_service is None:
        raise ProviderError("Provider service not initialized.")
    return provider_service


@router.post("/test-connection", response_model=ConnectionTestResult)
async def test_connection(
    request: Request,
    service: SettingsService = Depends(get_settings_service),
) -> ConnectionTestResult:
    """Test provider connectivity with per-capability pass/fail results."""
    provider_service = _get_provider_service(request)

    if not provider_service.is_configured:
        raise ProviderError("Provider not configured. Set provider URL and API key in settings first.")

    settings = await service.get_settings()

    result = await provider_service.test_connection(
        chat_model=settings.provider_model,
        embedding_model=settings.embedding_model,
    )

    # Store discovered capabilities in settings
    if result.get("provider_capabilities") is not None:
        await service.update_settings(provider_capabilities=result["provider_capabilities"])

    return ConnectionTestResult(
        auth=CapabilityResult(**result["auth"]),
        chat=CapabilityResult(**result["chat"]),
        embedding=CapabilityResult(**result["embedding"]),
        provider_capabilities=result.get("provider_capabilities"),
    )


@router.get("/models", response_model=ModelListResponse)
async def list_models(
    request: Request,
) -> ModelListResponse:
    """List available models from the configured provider."""
    provider_service = _get_provider_service(request)

    if not provider_service.is_configured:
        raise ProviderError("Provider not configured. Set provider URL and API key in settings first.")

    models, cached = await provider_service.list_models()

    warning = None
    if len(models) == 0:
        warning = "No models found. The provider may not support model listing."

    return ModelListResponse(
        models=[ModelInfo(**m) for m in models],
        cached=cached,
        warning=warning,
    )
