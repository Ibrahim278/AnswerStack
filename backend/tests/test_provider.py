"""Integration tests for provider API.

Covers PROV-01 through PROV-05 (provider configuration, connection testing,
model listing, capability detection, graceful degradation).
"""

from unittest.mock import AsyncMock, MagicMock

import openai


# --- PROV-03: List models ---


async def test_list_models_success(async_client_with_provider):
    """PROV-03: GET /api/v1/provider/models returns 200 with model list."""
    response = await async_client_with_provider.get("/api/v1/provider/models")
    assert response.status_code == 200
    data = response.json()
    assert len(data["models"]) == 2
    model_ids = [m["id"] for m in data["models"]]
    assert "test-model-1" in model_ids
    assert "text-embedding-test" in model_ids
    assert data["warning"] is None


async def test_list_models_not_configured(async_client):
    """PROV-05: GET /api/v1/provider/models returns 503 when provider not configured."""
    response = await async_client.get("/api/v1/provider/models")
    assert response.status_code == 503
    data = response.json()
    assert "error_code" in data
    assert data["error_code"] == "provider.unavailable"


async def test_list_models_empty(async_client_with_provider, mock_openai_client):
    """PROV-03: GET /api/v1/provider/models returns 200 with warning when empty."""
    # Override mock to return empty model list
    empty_response = MagicMock()
    empty_response.data = []
    mock_openai_client.models.list = AsyncMock(return_value=empty_response)
    # Clear cache to force re-fetch
    from app.services.provider import ProviderService

    # The provider_service on the client's app state needs its cache cleared
    # Access the app via the client's transport
    response = await async_client_with_provider.get("/api/v1/provider/models")
    assert response.status_code == 200
    data = response.json()
    assert data["models"] == []
    assert data["warning"] is not None
    assert "No models found" in data["warning"]


# --- PROV-02/PROV-04: Connection testing ---


async def test_connection_success_all_pass(async_client_with_provider):
    """PROV-02/PROV-04: POST /api/v1/provider/test-connection returns all pass."""
    # First, configure settings with model names that match our mocks
    await async_client_with_provider.put(
        "/api/v1/settings",
        json={"provider_model": "test-model-1", "embedding_model": "text-embedding-test"},
    )

    response = await async_client_with_provider.post("/api/v1/provider/test-connection")
    assert response.status_code == 200
    data = response.json()
    assert data["auth"]["status"] == "pass"
    assert data["chat"]["status"] == "pass"
    assert data["embedding"]["status"] == "pass"
    assert data["provider_capabilities"] is not None


async def test_connection_auth_failure(async_client_with_provider, mock_openai_client):
    """PROV-02: Auth failure returns auth=fail, chat=skip, embedding=skip."""
    # Make models.list raise AuthenticationError
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.headers = {}
    mock_openai_client.models.list = AsyncMock(
        side_effect=openai.AuthenticationError(
            message="bad key",
            response=mock_response,
            body=None,
        )
    )

    response = await async_client_with_provider.post("/api/v1/provider/test-connection")
    assert response.status_code == 200
    data = response.json()
    assert data["auth"]["status"] == "fail"
    assert data["chat"]["status"] == "skip"
    assert data["embedding"]["status"] == "skip"


async def test_connection_not_configured(async_client):
    """PROV-05: POST /api/v1/provider/test-connection returns 503 when not configured."""
    response = await async_client.post("/api/v1/provider/test-connection")
    assert response.status_code == 503


async def test_connection_stores_capabilities(async_client_with_provider):
    """PROV-04: POST test-connection stores provider_capabilities in settings."""
    # Set models so connection test exercises all phases
    await async_client_with_provider.put(
        "/api/v1/settings",
        json={"provider_model": "test-model-1", "embedding_model": "text-embedding-test"},
    )

    # Run test-connection
    await async_client_with_provider.post("/api/v1/provider/test-connection")

    # Verify capabilities stored in settings
    settings_resp = await async_client_with_provider.get("/api/v1/settings")
    assert settings_resp.status_code == 200
    caps = settings_resp.json()["provider_capabilities"]
    assert caps is not None
    assert "supports_streaming" in caps


async def test_connection_embedding_dimensions_probed(async_client_with_provider):
    """PROV-04: POST test-connection reports embedding dimensions in result."""
    await async_client_with_provider.put(
        "/api/v1/settings",
        json={"provider_model": "test-model-1", "embedding_model": "text-embedding-test"},
    )

    response = await async_client_with_provider.post("/api/v1/provider/test-connection")
    assert response.status_code == 200
    data = response.json()

    # Embedding should have dimensions in details
    assert data["embedding"]["status"] == "pass"
    assert data["embedding"]["details"]["dimensions"] == 384

    # Capabilities should have embedding_dimensions
    assert data["provider_capabilities"]["embedding_dimensions"] == 384


# --- PROV-05: Graceful startup ---


async def test_graceful_startup_no_provider(async_client):
    """PROV-05: App starts without error when no provider URL set."""
    # The async_client fixture creates an app without provider config.
    # Simply verify the app is responsive.
    response = await async_client.get("/api/v1/settings")
    assert response.status_code == 200
