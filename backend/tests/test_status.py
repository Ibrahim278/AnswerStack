"""Integration tests for the GET /api/v1/status endpoint."""

from uuid import UUID


# --- Basic status without project_id ---


async def test_status_no_project_id(async_client):
    """GET /api/v1/status without project_id returns status with no project field."""
    response = await async_client.get("/api/v1/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "provider" in data
    assert "health" in data
    assert data["project"] is None


async def test_status_misconfigured_when_no_provider(async_client):
    """With default settings (no provider URL), status is 'misconfigured'."""
    response = await async_client.get("/api/v1/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "misconfigured"
    assert data["provider"]["configured"] is False


async def test_status_response_shape(async_client):
    """Verify all response fields match the SystemStatusResponse schema."""
    response = await async_client.get("/api/v1/status")
    assert response.status_code == 200
    data = response.json()

    # Top-level
    assert isinstance(data["status"], str)

    # Provider
    provider = data["provider"]
    assert isinstance(provider["configured"], bool)
    assert isinstance(provider["connected"], bool)
    assert "last_error" in provider  # can be None or string

    # Health
    health = data["health"]
    assert isinstance(health["database"], bool)
    assert isinstance(health["vector_store"], bool)


# --- Status with project_id ---


async def test_status_with_project_id(async_client):
    """GET /api/v1/status?project_id={id} includes project field."""
    # Create a project first
    resp = await async_client.post(
        "/api/v1/projects", json={"name": "Status Test Project"}
    )
    assert resp.status_code == 201
    project_id = resp.json()["id"]

    response = await async_client.get(f"/api/v1/status?project_id={project_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["project"] is not None

    project = data["project"]
    assert "index_status" in project
    assert "documents_total" in project
    assert "documents_stale" in project
    assert isinstance(project["documents_total"], int)
    assert isinstance(project["documents_stale"], int)


async def test_status_no_documents(async_client):
    """With no documents uploaded, project shows zero documents."""
    resp = await async_client.post(
        "/api/v1/projects", json={"name": "Empty Project"}
    )
    assert resp.status_code == 201
    project_id = resp.json()["id"]

    response = await async_client.get(f"/api/v1/status?project_id={project_id}")
    assert response.status_code == 200
    data = response.json()

    # Since provider is not configured, overall status is misconfigured
    # regardless of project documents
    assert data["status"] == "misconfigured"

    # But project section should still show 0 documents
    assert data["project"] is not None
    assert data["project"]["documents_total"] == 0


async def test_status_invalid_project_id(async_client):
    """GET /api/v1/status?project_id=not-a-uuid returns 422."""
    response = await async_client.get("/api/v1/status?project_id=not-a-uuid")
    assert response.status_code == 422


# --- Status with configured provider ---


async def test_status_degraded_without_vector_store(async_client_with_provider):
    """With provider configured but no vector store, status is 'degraded'."""
    resp = await async_client_with_provider.put(
        "/api/v1/settings",
        json={"provider_url": "http://mock-provider:1234/v1"},
    )
    assert resp.status_code == 200

    response = await async_client_with_provider.get("/api/v1/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "degraded"
    assert data["provider"]["configured"] is True
    assert data["provider"]["connected"] is True
    assert data["health"]["vector_store"] is False


async def test_status_ready_with_full_stack(async_client_with_indexing):
    """With provider and vector store configured, status is 'ready'."""
    resp = await async_client_with_indexing.put(
        "/api/v1/settings",
        json={"provider_url": "http://mock-provider:1234/v1"},
    )
    assert resp.status_code == 200

    response = await async_client_with_indexing.get("/api/v1/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["provider"]["configured"] is True
    assert data["provider"]["connected"] is True
    assert data["health"]["database"] is True
    assert data["health"]["vector_store"] is True
