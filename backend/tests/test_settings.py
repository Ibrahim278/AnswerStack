"""Integration tests for settings API.

Covers SET-01 through SET-05 and PROV-01 (provider config via settings).
"""


# --- SET-01: Get and update settings ---


async def test_get_settings_returns_defaults(async_client):
    """SET-01: GET /api/v1/settings returns 200 with default values."""
    response = await async_client.get("/api/v1/settings")
    assert response.status_code == 200
    data = response.json()

    assert data["temperature"] == 0.7
    assert data["chunk_size"] == 2200
    assert data["chunk_overlap"] == 250
    assert data["top_k"] == 5
    assert data["similarity_threshold"] == 0.3
    assert data["reranker_enabled"] is True
    assert data["provider_url"] == ""
    assert data["provider_api_key"] == ""
    assert data["provider_model"] == ""
    assert data["embedding_model"] == ""
    assert data["provider_capabilities"] is None
    assert "updated_at" in data
    assert "id" in data


async def test_update_basic_settings(async_client):
    """SET-01: PUT /api/v1/settings with basic fields returns 200 with updated values."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"temperature": 0.5, "system_prompt": "Custom prompt"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["temperature"] == 0.5
    assert data["system_prompt"] == "Custom prompt"


# --- SET-02: Advanced settings ---


async def test_update_advanced_settings(async_client):
    """SET-02: PUT /api/v1/settings with advanced fields returns 200."""
    response = await async_client.put(
        "/api/v1/settings",
        json={
            "chunk_size": 2000,
            "chunk_overlap": 400,
            "top_k": 10,
            "reranker_enabled": False,
            "similarity_threshold": 0.5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["chunk_size"] == 2000
    assert data["chunk_overlap"] == 400
    assert data["top_k"] == 10
    assert data["reranker_enabled"] is False
    assert data["similarity_threshold"] == 0.5


# --- PROV-01: Provider configuration ---


async def test_update_provider_settings(async_client):
    """PROV-01: PUT /api/v1/settings with provider fields returns 200."""
    response = await async_client.put(
        "/api/v1/settings",
        json={
            "provider_url": "http://localhost:8080/v1",
            "provider_api_key": "sk-test",
            "provider_model": "gpt-4",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["provider_url"] == "http://localhost:8080/v1"
    # API key is masked in responses; "sk-test" (7 chars) becomes "***"
    assert data["provider_api_key"] == "***"
    assert data["provider_model"] == "gpt-4"


async def test_api_key_masking(async_client):
    """provider_api_key is masked in GET/PUT responses to protect secrets."""
    # Short key (<=8 chars) → "***"
    r = await async_client.put("/api/v1/settings", json={"provider_api_key": "sk-short"})
    assert r.status_code == 200
    assert r.json()["provider_api_key"] == "***"

    # Longer key (>8 chars) → "sk-...XXXX"
    r = await async_client.put("/api/v1/settings", json={"provider_api_key": "sk-abcdef1234"})
    assert r.status_code == 200
    assert r.json()["provider_api_key"] == "sk-...1234"

    # Empty key → remains empty
    r = await async_client.put("/api/v1/settings", json={"provider_api_key": ""})
    assert r.status_code == 200
    assert r.json()["provider_api_key"] == ""


async def test_provider_url_validation(async_client):
    """provider_url must use http/https scheme and have a valid hostname."""
    # Invalid scheme rejected
    r = await async_client.put("/api/v1/settings", json={"provider_url": "ftp://example.com"})
    assert r.status_code == 422

    # No scheme rejected
    r = await async_client.put("/api/v1/settings", json={"provider_url": "example.com/v1"})
    assert r.status_code == 422

    # Localhost is allowed (primary use-case)
    r = await async_client.put("/api/v1/settings", json={"provider_url": "http://localhost:1234/v1"})
    assert r.status_code == 200
    assert r.json()["provider_url"] == "http://localhost:1234/v1"

    # Trailing slash is stripped
    r = await async_client.put("/api/v1/settings", json={"provider_url": "http://localhost:1234/v1/"})
    assert r.status_code == 200
    assert r.json()["provider_url"] == "http://localhost:1234/v1"


# --- SET-03 / SET-05: Validation ---


async def test_validation_temperature_out_of_range(async_client):
    """SET-03/SET-05: Temperature > 2.0 returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"temperature": 5.0},
    )
    assert response.status_code == 422

    # Also test negative
    response2 = await async_client.put(
        "/api/v1/settings",
        json={"temperature": -1.0},
    )
    assert response2.status_code == 422


async def test_validation_chunk_size_too_small(async_client):
    """SET-03: chunk_size < 100 returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"chunk_size": 10},
    )
    assert response.status_code == 422


async def test_validation_chunk_overlap_exceeds_chunk_size(async_client):
    """SET-03: chunk_overlap >= chunk_size returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"chunk_size": 1000, "chunk_overlap": 1500},
    )
    assert response.status_code == 422


async def test_validation_top_k_zero(async_client):
    """SET-03: top_k must be >= 1, so 0 returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"top_k": 0},
    )
    assert response.status_code == 422


async def test_validation_similarity_threshold_negative(async_client):
    """SET-03: similarity_threshold < 0 returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"similarity_threshold": -0.1},
    )
    assert response.status_code == 422


# --- SET-04: Reset settings ---


async def test_reset_settings_restores_defaults(async_client):
    """SET-04: PUT custom values, then PUT /settings/reset restores defaults."""
    # First, get original defaults
    original = await async_client.get("/api/v1/settings")
    original_data = original.json()

    # Update with custom values
    await async_client.put(
        "/api/v1/settings",
        json={"temperature": 0.1, "chunk_size": 500, "top_k": 20},
    )

    # Verify custom values took effect
    updated = await async_client.get("/api/v1/settings")
    assert updated.json()["temperature"] == 0.1

    # Reset
    reset_response = await async_client.put("/api/v1/settings/reset")
    assert reset_response.status_code == 200
    reset_data = reset_response.json()

    assert reset_data["temperature"] == original_data["temperature"]
    assert reset_data["chunk_size"] == original_data["chunk_size"]
    assert reset_data["top_k"] == original_data["top_k"]
    assert reset_data["provider_url"] == original_data["provider_url"]
    assert reset_data["reranker_enabled"] == original_data["reranker_enabled"]


async def test_clearing_provider_url_disables_provider(async_client_with_provider):
    """Clearing provider_url should disable live provider access immediately."""
    update_response = await async_client_with_provider.put(
        "/api/v1/settings",
        json={"provider_url": ""},
    )
    assert update_response.status_code == 200
    assert update_response.json()["provider_url"] == ""

    models_response = await async_client_with_provider.get("/api/v1/provider/models")
    assert models_response.status_code == 503


async def test_reset_settings_disables_provider_when_defaults_are_empty(async_client_with_provider):
    """Reset should close the live provider client when defaults clear the URL."""
    reset_response = await async_client_with_provider.put("/api/v1/settings/reset")
    assert reset_response.status_code == 200
    assert reset_response.json()["provider_url"] == ""

    models_response = await async_client_with_provider.get("/api/v1/provider/models")
    assert models_response.status_code == 503


# --- SET-01 continued: Partial update and empty update ---


async def test_partial_update_preserves_other_fields(async_client):
    """SET-01: PUT with only temperature does not change other fields."""
    # Get current state
    before = await async_client.get("/api/v1/settings")
    before_data = before.json()

    # Update only temperature
    await async_client.put("/api/v1/settings", json={"temperature": 0.3})

    # Verify other fields unchanged
    after = await async_client.get("/api/v1/settings")
    after_data = after.json()
    assert after_data["temperature"] == 0.3
    assert after_data["chunk_size"] == before_data["chunk_size"]
    assert after_data["top_k"] == before_data["top_k"]
    assert after_data["provider_url"] == before_data["provider_url"]
    assert after_data["system_prompt"] == before_data["system_prompt"]


async def test_empty_update_returns_current(async_client):
    """SET-01: PUT with empty body {} returns 200 with current values unchanged."""
    before = await async_client.get("/api/v1/settings")
    before_data = before.json()

    response = await async_client.put("/api/v1/settings", json={})
    assert response.status_code == 200
    after_data = response.json()
    assert after_data["temperature"] == before_data["temperature"]
    assert after_data["chunk_size"] == before_data["chunk_size"]


# --- Reasoning effort settings ---


async def test_get_settings_includes_reasoning_effort(async_client):
    """GET /settings returns reasoning_effort field with empty default."""
    response = await async_client.get("/api/v1/settings")
    assert response.status_code == 200
    data = response.json()
    assert "reasoning_effort" in data
    assert data["reasoning_effort"] == ""


async def test_update_reasoning_effort_valid_values(async_client):
    """PUT /settings with valid reasoning_effort values persists them."""
    for value in ["low", "medium", "high"]:
        response = await async_client.put(
            "/api/v1/settings",
            json={"reasoning_effort": value},
        )
        assert response.status_code == 200
        assert response.json()["reasoning_effort"] == value

        # Verify it persists
        get_response = await async_client.get("/api/v1/settings")
        assert get_response.json()["reasoning_effort"] == value


async def test_update_reasoning_effort_empty_disables(async_client):
    """PUT /settings with empty reasoning_effort disables it."""
    # Set a value first
    await async_client.put("/api/v1/settings", json={"reasoning_effort": "high"})

    # Clear it
    response = await async_client.put(
        "/api/v1/settings",
        json={"reasoning_effort": ""},
    )
    assert response.status_code == 200
    assert response.json()["reasoning_effort"] == ""


async def test_update_reasoning_effort_invalid_value_rejected(async_client):
    """PUT /settings with invalid reasoning_effort returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"reasoning_effort": "maximum"},
    )
    assert response.status_code == 422


async def test_reset_settings_clears_reasoning_effort(async_client):
    """PUT /settings/reset resets reasoning_effort to empty default."""
    await async_client.put("/api/v1/settings", json={"reasoning_effort": "high"})

    response = await async_client.put("/api/v1/settings/reset")
    assert response.status_code == 200
    assert response.json()["reasoning_effort"] == ""


async def test_partial_update_preserves_reasoning_effort(async_client):
    """Updating other fields does not change reasoning_effort."""
    await async_client.put("/api/v1/settings", json={"reasoning_effort": "medium"})

    # Update temperature only
    response = await async_client.put("/api/v1/settings", json={"temperature": 0.8})
    assert response.status_code == 200
    assert response.json()["reasoning_effort"] == "medium"


# --- TTS voice settings ---


async def test_get_settings_includes_tts_fields(async_client):
    """GET /settings returns tts_provider and tts_voice_id fields with empty defaults."""
    response = await async_client.get("/api/v1/settings")
    assert response.status_code == 200
    data = response.json()
    assert "tts_provider" in data
    assert data["tts_provider"] == ""
    assert "tts_voice_id" in data
    assert data["tts_voice_id"] == ""


async def test_update_tts_provider(async_client):
    """PUT /settings with tts_provider persists the selection."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"tts_provider": "piper"},
    )
    assert response.status_code == 200
    assert response.json()["tts_provider"] == "piper"

    # Verify it persists
    get_response = await async_client.get("/api/v1/settings")
    assert get_response.json()["tts_provider"] == "piper"


async def test_reset_settings_clears_tts_provider(async_client):
    """PUT /settings/reset resets tts_provider to empty default."""
    await async_client.put("/api/v1/settings", json={"tts_provider": "kokoro"})

    response = await async_client.put("/api/v1/settings/reset")
    assert response.status_code == 200
    assert response.json()["tts_provider"] == ""


async def test_update_tts_voice_id(async_client):
    """PUT /settings with tts_voice_id persists the selection."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"tts_voice_id": "af_bella"},
    )
    assert response.status_code == 200
    assert response.json()["tts_voice_id"] == "af_bella"

    # Verify it persists
    get_response = await async_client.get("/api/v1/settings")
    assert get_response.json()["tts_voice_id"] == "af_bella"


async def test_update_tts_voice_id_syncs_to_app_state(async_client):
    """PUT /settings with tts_voice_id updates app.state.tts_default_voice_id."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"tts_voice_id": "en_US-lessac-medium"},
    )
    assert response.status_code == 200

    # The app fixture gives us access to the app state
    from httpx import ASGITransport
    transport = async_client._transport
    if isinstance(transport, ASGITransport):
        app = transport.app
        assert getattr(app.state, "tts_default_voice_id", None) == "en_US-lessac-medium"


async def test_reset_settings_clears_tts_voice_id(async_client):
    """PUT /settings/reset resets tts_voice_id to empty default."""
    # Set a voice first
    await async_client.put("/api/v1/settings", json={"tts_voice_id": "af_bella"})

    # Reset
    response = await async_client.put("/api/v1/settings/reset")
    assert response.status_code == 200
    assert response.json()["tts_voice_id"] == ""


async def test_tts_voice_id_validation_max_length(async_client):
    """tts_voice_id exceeding 255 chars returns 422."""
    response = await async_client.put(
        "/api/v1/settings",
        json={"tts_voice_id": "x" * 256},
    )
    assert response.status_code == 422


async def test_partial_update_preserves_tts_voice_id(async_client):
    """Updating other fields does not change tts_voice_id."""
    await async_client.put("/api/v1/settings", json={"tts_voice_id": "af_sky"})

    # Update temperature only
    response = await async_client.put("/api/v1/settings", json={"temperature": 0.8})
    assert response.status_code == 200
    assert response.json()["tts_voice_id"] == "af_sky"
