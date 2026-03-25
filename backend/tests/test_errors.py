async def test_not_found_error_structure(async_client):
    """ERR-01: 404 errors return structured payload with error_code, message, retryable, suggested_action."""
    response = await async_client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    data = response.json()
    assert "error_code" in data
    assert data["error_code"] == "project.not_found"
    assert "message" in data
    assert "retryable" in data
    assert data["retryable"] is False
    assert "suggested_action" in data
    assert "request_id" in data


async def test_validation_error_structure(async_client):
    """ERR-01: Validation errors return structured payload."""
    response = await async_client.post("/api/v1/projects", json={})
    assert response.status_code == 422
    data = response.json()
    assert "error_code" in data
    assert data["error_code"].startswith("validation.")
    assert "message" in data
    assert "retryable" in data
    assert data["retryable"] is False
    assert "suggested_action" in data


async def test_request_id_in_error_response(async_client):
    """OPS-02/ERR-01: Error responses include request_id from middleware."""
    response = await async_client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000")
    data = response.json()
    assert data.get("request_id") is not None
    # request_id should also be in the header
    assert "x-request-id" in response.headers
    # They should match
    assert data["request_id"] == response.headers["x-request-id"]


async def test_request_id_header_on_success(async_client):
    """OPS-02: All responses (including success) include X-Request-ID header."""
    response = await async_client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert "x-request-id" in response.headers
    # Verify it's a valid UUID format (36 chars with dashes)
    request_id = response.headers["x-request-id"]
    assert len(request_id) == 36
