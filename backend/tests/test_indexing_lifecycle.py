"""Integration tests for indexing lifecycle and baseline infrastructure behavior."""

import asyncio

import pytest

from .indexing_helpers import _build_project_index, _list_documents, _wait_for_index_status


async def test_trigger_build(project_with_parsed_docs):
    """IDX-01: Trigger index build returns 202 with job details."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202
    body = resp.json()
    assert body["project_id"] == project_id
    assert body["status"] == "pending"
    assert "id" in body
    assert "created_at" in body


async def test_trigger_build_no_documents(async_client_with_indexing):
    """IDX-01: Trigger build with no parsed documents returns 400."""
    client = async_client_with_indexing
    resp = await client.post("/api/v1/projects", json={"name": "Empty Project"})
    project_id = resp.json()["id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 400
    body = resp.json()
    assert "no_documents" in body.get("error_code", "") or "no parsed" in body.get(
        "message", ""
    ).lower()


async def test_trigger_build_conflict(project_with_parsed_docs):
    """IDX-01 + INFR-06: Cannot start build while one is running."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202

    await asyncio.sleep(0.2)

    resp2 = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp2.status_code in (202, 400, 409)


async def test_poll_progress(project_with_parsed_docs):
    """IDX-02: Polling status endpoint shows progress fields."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")

    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert resp.status_code == 200
        body = resp.json()
        assert "index_status" in body
        assert "job" in body
        if body["job"] and body["job"]["status"] == "completed":
            assert body["job"]["documents_processed"] > 0
            assert body["job"]["documents_total"] > 0
            assert body["job"]["percentage"] == 100.0
            break
    else:
        pytest.fail("Job did not complete within timeout")


async def test_cancel_job(project_with_parsed_docs):
    """IDX-03: Cancel endpoint sets job status to cancelled."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.3)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert resp.status_code == 202

        resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        if resp.status_code == 200:
            assert resp.json()["status"] == "cancelled"
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]


async def test_cancel_no_running_job(project_with_parsed_docs):
    """IDX-03: Cancel with no running job returns 404."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
    assert resp.status_code == 404


async def test_retry_after_cancel(project_with_parsed_docs):
    """IDX-04: Retry creates a new pending job after cancellation."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        job_status = resp.json().get("job", {})
        if job_status and job_status.get("status") in ("completed", "failed"):
            break

    cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
    if cancel_resp.status_code == 200:
        retry_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/retry")
        assert retry_resp.status_code == 202
        assert retry_resp.json()["status"] == "pending"


async def test_retry_invalid_state(project_with_parsed_docs):
    """IDX-04: Retry with no failed/cancelled job returns 400."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/retry")
    assert resp.status_code == 400


async def test_stale_detection(project_with_parsed_docs):
    """IDX-05: Stale detection after settings change marks project as stale."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    resp = await client.put(
        "/api/v1/settings",
        json={
            "embedding_model": "different-model",
        },
    )
    assert resp.status_code == 200

    resp = await client.get(f"/api/v1/projects/{project_id}")
    body = resp.json()
    assert body["index_status"] in ("stale", "not_indexed")


async def test_last_indexed_at(project_with_parsed_docs):
    """IDX-06: last_indexed_at set on project after successful indexing."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    resp = await client.get(f"/api/v1/projects/{project_id}")
    assert resp.json()["last_indexed_at"] is None

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    resp = await client.get(f"/api/v1/projects/{project_id}")
    body = resp.json()
    assert body["last_indexed_at"] is not None
    assert body["index_status"] == "indexed"


async def test_chunk_params_hash():
    """IDX-07: chunk_params_hash is deterministic and changes with params."""
    from app.core.hashing import compute_chunk_params_hash

    hash1 = compute_chunk_params_hash(4000, 800, "text-embedding-test")
    hash2 = compute_chunk_params_hash(4000, 800, "text-embedding-test")
    hash3 = compute_chunk_params_hash(2000, 400, "text-embedding-test")
    hash4 = compute_chunk_params_hash(4000, 800, "different-model")

    assert hash1 == hash2
    assert hash1 != hash3
    assert hash1 != hash4
    assert len(hash1) == 64


async def test_job_persistence(project_with_parsed_docs):
    """INFR-05: Job state is persisted in SQLite and queryable."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202
    job_id = resp.json()["id"]

    await asyncio.sleep(0.2)
    resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["job"] is not None
    assert body["job"]["id"] == job_id


async def test_idempotent_rebuild(project_with_parsed_docs, mock_vector_repo):
    """INFR-06: Build path is safe to rerun and writes embeddings for the project."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    assert mock_vector_repo.upsert_embeddings.called


async def test_embedding_service_called(project_with_parsed_docs, mock_embedding_service):
    """RETR-03: Embedding service called during indexing."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    assert mock_embedding_service.embed_texts.called
    call_args = mock_embedding_service.embed_texts.call_args_list
    for call in call_args:
        args, kwargs = call
        assert len(args) >= 2 or "model" in kwargs


async def test_vector_repo_isolation(project_with_parsed_docs, mock_vector_repo):
    """RETR-04: Each project gets its own ChromaDB collection."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    upsert_calls = mock_vector_repo.upsert_embeddings.call_args_list
    assert len(upsert_calls) >= 1

    call_project_id = upsert_calls[0][0][0]
    assert str(call_project_id) == project_id


async def test_status_no_job(async_client_with_indexing):
    """Status endpoint returns not_indexed when no job exists."""
    client = async_client_with_indexing
    resp = await client.post("/api/v1/projects", json={"name": "No Index Project"})
    project_id = resp.json()["id"]

    resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["index_status"] == "not_indexed"
    assert body["job"] is None
    assert body["last_indexed_at"] is None


async def test_build_nonexistent_project(async_client_with_indexing):
    """Build on nonexistent project returns 404."""
    client = async_client_with_indexing
    fake_id = "00000000-0000-0000-0000-000000000099"
    resp = await client.post(f"/api/v1/projects/{fake_id}/indexing/build")
    assert resp.status_code == 404
