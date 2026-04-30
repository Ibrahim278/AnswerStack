async def test_liveness(async_client):
    """OPS-01: Liveness endpoint returns 200 with status=alive."""
    response = await async_client.get("/api/v1/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


async def test_readiness(async_client):
    """OPS-01: Readiness endpoint checks DB and returns ready/connected."""
    response = await async_client.get("/api/v1/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"
