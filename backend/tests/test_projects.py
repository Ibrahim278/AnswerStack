from uuid import UUID


# --- PROJ-01: Create project ---


async def test_create_project(async_client):
    """PROJ-01: User can create a project with name and optional description."""
    response = await async_client.post(
        "/api/v1/projects",
        json={"name": "My Research", "description": "A research project"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Research"
    assert data["description"] == "A research project"
    assert "id" in data
    # Verify UUID format
    UUID(data["id"])
    assert data["is_active"] is False
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_project_without_description(async_client):
    """PROJ-01: Description is optional."""
    response = await async_client.post(
        "/api/v1/projects",
        json={"name": "Minimal Project"},
    )
    assert response.status_code == 201
    assert response.json()["description"] is None


async def test_create_project_empty_name_rejected(async_client):
    """PROJ-01: Name must not be empty."""
    response = await async_client.post(
        "/api/v1/projects",
        json={"name": ""},
    )
    assert response.status_code == 422
    error = response.json()
    assert "error_code" in error
    assert error["error_code"].startswith("validation.")


async def test_create_project_name_too_long_rejected(async_client):
    """PROJ-01: Name must not exceed 255 chars."""
    response = await async_client.post(
        "/api/v1/projects",
        json={"name": "x" * 256},
    )
    assert response.status_code == 422


# --- PROJ-02: List projects with pagination ---


async def test_list_projects_empty(async_client):
    """PROJ-02: Empty list when no projects exist."""
    response = await async_client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["has_more"] is False
    assert data["next_cursor"] is None


async def test_list_projects_with_data(async_client):
    """PROJ-02: Returns projects ordered by most recent first."""
    # Create two projects
    await async_client.post("/api/v1/projects", json={"name": "First"})
    await async_client.post("/api/v1/projects", json={"name": "Second"})

    response = await async_client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    # Most recent first
    assert data["items"][0]["name"] == "Second"
    assert data["items"][1]["name"] == "First"


async def test_list_projects_pagination(async_client):
    """PROJ-02: Cursor-based pagination with has_more and next_cursor."""
    # Create 3 projects
    for i in range(3):
        await async_client.post("/api/v1/projects", json={"name": f"Project {i}"})

    # Request with limit=2
    response = await async_client.get("/api/v1/projects?limit=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["has_more"] is True
    assert data["next_cursor"] is not None

    # Use cursor for next page
    response2 = await async_client.get(f"/api/v1/projects?cursor={data['next_cursor']}&limit=2")
    assert response2.status_code == 200
    data2 = response2.json()
    assert len(data2["items"]) == 1
    assert data2["has_more"] is False


# --- PROJ-03: Delete project ---


async def test_delete_project(async_client):
    """PROJ-03: User can delete a project."""
    create_resp = await async_client.post("/api/v1/projects", json={"name": "To Delete"})
    project_id = create_resp.json()["id"]

    delete_resp = await async_client.delete(f"/api/v1/projects/{project_id}")
    assert delete_resp.status_code == 204

    # Confirm deleted
    get_resp = await async_client.get(f"/api/v1/projects/{project_id}")
    assert get_resp.status_code == 404


async def test_delete_nonexistent_project(async_client):
    """PROJ-03: Deleting nonexistent project returns 404."""
    response = await async_client.delete("/api/v1/projects/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["error_code"] == "project.not_found"


# --- PROJ-04: Active project ---


async def test_activate_project(async_client):
    """PROJ-04: User can select an active project."""
    create_resp = await async_client.post("/api/v1/projects", json={"name": "Active One"})
    project_id = create_resp.json()["id"]

    activate_resp = await async_client.post(f"/api/v1/projects/{project_id}/activate")
    assert activate_resp.status_code == 200
    assert activate_resp.json()["is_active"] is True


async def test_only_one_active_project(async_client):
    """PROJ-04: Only one project can be active at a time."""
    resp1 = await async_client.post("/api/v1/projects", json={"name": "Project A"})
    resp2 = await async_client.post("/api/v1/projects", json={"name": "Project B"})
    id_a = resp1.json()["id"]
    id_b = resp2.json()["id"]

    # Activate A
    await async_client.post(f"/api/v1/projects/{id_a}/activate")
    # Activate B (should deactivate A)
    await async_client.post(f"/api/v1/projects/{id_b}/activate")

    # Check A is no longer active
    get_a = await async_client.get(f"/api/v1/projects/{id_a}")
    assert get_a.json()["is_active"] is False

    # Check B is active
    get_b = await async_client.get(f"/api/v1/projects/{id_b}")
    assert get_b.json()["is_active"] is True


# --- PROJ-05: Edit project ---


async def test_update_project_name(async_client):
    """PROJ-05: User can edit project name."""
    create_resp = await async_client.post("/api/v1/projects", json={"name": "Original"})
    project_id = create_resp.json()["id"]

    update_resp = await async_client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Renamed"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Renamed"


async def test_update_project_description(async_client):
    """PROJ-05: User can edit project description."""
    create_resp = await async_client.post(
        "/api/v1/projects",
        json={"name": "Desc Test", "description": "Old"},
    )
    project_id = create_resp.json()["id"]

    update_resp = await async_client.patch(
        f"/api/v1/projects/{project_id}",
        json={"description": "New description"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["description"] == "New description"
    assert update_resp.json()["name"] == "Desc Test"  # Name unchanged


async def test_update_nonexistent_project(async_client):
    """PROJ-05: Updating nonexistent project returns 404."""
    response = await async_client.patch(
        "/api/v1/projects/00000000-0000-0000-0000-000000000000",
        json={"name": "Ghost"},
    )
    assert response.status_code == 404


# --- INFR-04: API versioning ---


async def test_api_v1_prefix(async_client):
    """INFR-04: All endpoints are under /api/v1."""
    response = await async_client.get("/api/v1/projects")
    assert response.status_code == 200

    # Verify endpoints are NOT accessible without prefix
    response_no_prefix = await async_client.get("/projects")
    assert response_no_prefix.status_code == 404
