"""Integration tests for provider configs API.

Covers CRUD operations, activation, sync-back, and edge cases.
"""


# --- List providers ---


async def test_list_providers_empty(async_client):
    """GET /api/v1/providers returns empty list initially."""
    response = await async_client.get("/api/v1/providers")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []


# --- Create provider ---


async def test_create_provider(async_client):
    """POST /api/v1/providers creates a provider and returns 201."""
    response = await async_client.post(
        "/api/v1/providers",
        json={
            "name": "OpenAI",
            "provider_url": "https://api.openai.com/v1",
            "provider_api_key": "sk-test-key-123456789",
            "provider_model": "gpt-4",
            "embedding_model": "text-embedding-3-small",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "OpenAI"
    assert data["provider_url"] == "https://api.openai.com/v1"
    assert data["provider_model"] == "gpt-4"
    assert data["embedding_model"] == "text-embedding-3-small"
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_provider_minimal(async_client):
    """POST /api/v1/providers with only name creates provider with empty defaults."""
    response = await async_client.post(
        "/api/v1/providers",
        json={"name": "Empty Provider"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Empty Provider"
    assert data["provider_url"] == ""
    assert data["provider_model"] == ""


async def test_create_provider_duplicate_name_returns_409(async_client):
    """POST /api/v1/providers with duplicate name returns 409."""
    await async_client.post("/api/v1/providers", json={"name": "Duplicate"})
    response = await async_client.post("/api/v1/providers", json={"name": "Duplicate"})
    assert response.status_code == 409


async def test_create_provider_empty_name_returns_422(async_client):
    """POST /api/v1/providers with empty name returns 422."""
    response = await async_client.post("/api/v1/providers", json={"name": ""})
    assert response.status_code == 422


async def test_create_provider_invalid_url_returns_422(async_client):
    """POST /api/v1/providers with invalid URL returns 422."""
    response = await async_client.post(
        "/api/v1/providers",
        json={"name": "Bad", "provider_url": "not-a-url"},
    )
    assert response.status_code == 422


# --- Get provider ---


async def test_get_provider(async_client):
    """GET /api/v1/providers/{id} returns the provider."""
    create_resp = await async_client.post(
        "/api/v1/providers",
        json={"name": "GetTest", "provider_url": "http://localhost:8080/v1"},
    )
    provider_id = create_resp.json()["id"]

    response = await async_client.get("/api/v1/providers")
    data = response.json()
    found = [p for p in data["items"] if p["id"] == provider_id]
    assert len(found) == 1
    assert found[0]["name"] == "GetTest"


async def test_get_nonexistent_provider_returns_404(async_client):
    """DELETE /api/v1/providers/{id} with bad ID returns 404."""
    response = await async_client.delete("/api/v1/providers/00000000-0000-0000-0000-000000000099")
    assert response.status_code == 404


# --- Update provider ---


async def test_update_provider_name(async_client):
    """PUT /api/v1/providers/{id} updates the name."""
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "OldName"}
    )
    provider_id = create_resp.json()["id"]

    response = await async_client.put(
        f"/api/v1/providers/{provider_id}", json={"name": "NewName"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "NewName"


async def test_update_provider_url(async_client):
    """PUT /api/v1/providers/{id} updates provider_url."""
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "UrlTest"}
    )
    provider_id = create_resp.json()["id"]

    response = await async_client.put(
        f"/api/v1/providers/{provider_id}",
        json={"provider_url": "http://newhost:5000/v1"},
    )
    assert response.status_code == 200
    assert response.json()["provider_url"] == "http://newhost:5000/v1"


async def test_update_provider_duplicate_name_returns_409(async_client):
    """PUT /api/v1/providers/{id} with duplicate name returns 409."""
    await async_client.post("/api/v1/providers", json={"name": "Name1"})
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "Name2"}
    )
    provider_id = create_resp.json()["id"]

    response = await async_client.put(
        f"/api/v1/providers/{provider_id}", json={"name": "Name1"}
    )
    assert response.status_code == 409


async def test_update_nonexistent_provider_returns_404(async_client):
    """PUT /api/v1/providers/{id} with bad ID returns 404."""
    response = await async_client.put(
        "/api/v1/providers/00000000-0000-0000-0000-000000000099",
        json={"name": "Nope"},
    )
    assert response.status_code == 404


# --- Delete provider ---


async def test_delete_provider(async_client):
    """DELETE /api/v1/providers/{id} removes the provider."""
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "ToDelete"}
    )
    provider_id = create_resp.json()["id"]

    response = await async_client.delete(f"/api/v1/providers/{provider_id}")
    assert response.status_code == 204

    # Verify it's gone
    list_resp = await async_client.get("/api/v1/providers")
    ids = [p["id"] for p in list_resp.json()["items"]]
    assert provider_id not in ids


async def test_delete_nonexistent_returns_404(async_client):
    """DELETE /api/v1/providers/{id} with bad ID returns 404."""
    response = await async_client.delete(
        "/api/v1/providers/00000000-0000-0000-0000-000000000099"
    )
    assert response.status_code == 404


# --- Activate provider ---


async def test_activate_provider_copies_config_to_settings(async_client):
    """POST /api/v1/providers/{id}/activate copies provider config into settings."""
    create_resp = await async_client.post(
        "/api/v1/providers",
        json={
            "name": "ActivateTest",
            "provider_url": "http://activate-host:9000/v1",
            "provider_api_key": "sk-activate-key",
            "provider_model": "test-model",
            "embedding_model": "test-embed",
        },
    )
    provider_id = create_resp.json()["id"]

    response = await async_client.post(f"/api/v1/providers/{provider_id}/activate")
    assert response.status_code == 200
    data = response.json()

    # Settings should now have the provider's config
    assert data["provider_url"] == "http://activate-host:9000/v1"
    assert data["provider_model"] == "test-model"
    assert data["embedding_model"] == "test-embed"
    assert data["active_provider_id"] == provider_id


async def test_activate_sets_active_provider_id_in_settings(async_client):
    """After activation, GET /settings shows the active_provider_id."""
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "ActiveIDTest"}
    )
    provider_id = create_resp.json()["id"]

    await async_client.post(f"/api/v1/providers/{provider_id}/activate")

    settings_resp = await async_client.get("/api/v1/settings")
    assert settings_resp.json()["active_provider_id"] == provider_id


async def test_activate_nonexistent_provider_returns_404(async_client):
    """POST /api/v1/providers/{id}/activate with bad ID returns 404."""
    response = await async_client.post(
        "/api/v1/providers/00000000-0000-0000-0000-000000000099/activate"
    )
    assert response.status_code == 404


async def test_switching_providers_loads_correct_config(async_client):
    """Switching between two providers loads the correct config each time."""
    # Create two providers
    resp1 = await async_client.post(
        "/api/v1/providers",
        json={
            "name": "Provider A",
            "provider_url": "http://host-a:8000/v1",
            "provider_model": "model-a",
        },
    )
    resp2 = await async_client.post(
        "/api/v1/providers",
        json={
            "name": "Provider B",
            "provider_url": "http://host-b:9000/v1",
            "provider_model": "model-b",
        },
    )
    id_a = resp1.json()["id"]
    id_b = resp2.json()["id"]

    # Activate A
    await async_client.post(f"/api/v1/providers/{id_a}/activate")
    settings = (await async_client.get("/api/v1/settings")).json()
    assert settings["provider_url"] == "http://host-a:8000/v1"
    assert settings["provider_model"] == "model-a"

    # Switch to B
    await async_client.post(f"/api/v1/providers/{id_b}/activate")
    settings = (await async_client.get("/api/v1/settings")).json()
    assert settings["provider_url"] == "http://host-b:9000/v1"
    assert settings["provider_model"] == "model-b"
    assert settings["active_provider_id"] == id_b


# --- Sync-back ---


async def test_settings_update_syncs_back_to_active_provider(async_client):
    """PUT /settings with provider fields syncs changes back to the active provider."""
    # Create and activate a provider
    create_resp = await async_client.post(
        "/api/v1/providers",
        json={
            "name": "SyncBackTest",
            "provider_url": "http://original:8000/v1",
            "provider_model": "original-model",
        },
    )
    provider_id = create_resp.json()["id"]
    await async_client.post(f"/api/v1/providers/{provider_id}/activate")

    # Update provider_url via settings
    await async_client.put(
        "/api/v1/settings",
        json={"provider_url": "http://updated:9000/v1"},
    )

    # Switch away and back - the provider should have the updated URL
    # Create a temporary second provider to switch to
    temp = await async_client.post(
        "/api/v1/providers", json={"name": "TempProvider"}
    )
    temp_id = temp.json()["id"]
    await async_client.post(f"/api/v1/providers/{temp_id}/activate")

    # Switch back
    activate_resp = await async_client.post(f"/api/v1/providers/{provider_id}/activate")
    data = activate_resp.json()
    assert data["provider_url"] == "http://updated:9000/v1"


async def test_settings_update_without_active_provider_does_not_error(async_client):
    """PUT /settings works normally when no active provider is set."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"provider_url": "http://standalone:8000/v1"},
    )
    assert response.status_code == 200
    assert response.json()["active_provider_id"] is None


# --- Edge cases ---


async def test_delete_active_provider_clears_active_id(async_client):
    """Deleting the active provider sets active_provider_id to null via ON DELETE SET NULL."""
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "DeleteActive"}
    )
    provider_id = create_resp.json()["id"]
    await async_client.post(f"/api/v1/providers/{provider_id}/activate")

    # Verify it's active
    settings = (await async_client.get("/api/v1/settings")).json()
    assert settings["active_provider_id"] == provider_id

    # Delete it
    await async_client.delete(f"/api/v1/providers/{provider_id}")

    # active_provider_id should be null, but provider config remains in settings
    settings = (await async_client.get("/api/v1/settings")).json()
    assert settings["active_provider_id"] is None


async def test_reset_settings_clears_active_provider_id(async_client):
    """PUT /settings/reset clears the active_provider_id."""
    create_resp = await async_client.post(
        "/api/v1/providers", json={"name": "ResetTest"}
    )
    provider_id = create_resp.json()["id"]
    await async_client.post(f"/api/v1/providers/{provider_id}/activate")

    response = await async_client.put("/api/v1/settings/reset")
    assert response.status_code == 200
    assert response.json()["active_provider_id"] is None


async def test_api_key_masked_in_provider_response(async_client):
    """Provider API key is masked in responses."""
    response = await async_client.post(
        "/api/v1/providers",
        json={"name": "MaskTest", "provider_api_key": "sk-super-secret-key-12345"},
    )
    data = response.json()
    assert "..." in data["provider_api_key"]
    assert "super" not in data["provider_api_key"]


async def test_list_providers_ordered_by_name(async_client):
    """GET /api/v1/providers returns providers ordered by name ascending."""
    await async_client.post("/api/v1/providers", json={"name": "Zebra"})
    await async_client.post("/api/v1/providers", json={"name": "Alpha"})
    await async_client.post("/api/v1/providers", json={"name": "Middle"})

    response = await async_client.get("/api/v1/providers")
    names = [p["name"] for p in response.json()["items"]]
    assert names == sorted(names)


async def test_settings_response_includes_active_provider_id(async_client):
    """GET /settings includes active_provider_id field."""
    response = await async_client.get("/api/v1/settings")
    data = response.json()
    assert "active_provider_id" in data
    assert data["active_provider_id"] is None
