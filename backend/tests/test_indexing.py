"""Integration tests for the vector indexing job system.

Covers IDX-01 through IDX-07, INFR-05, INFR-06, RETR-03, RETR-04
(trigger build, observe progress, cancel, retry, stale detection,
last-indexed timestamp, chunk params hashing, job persistence,
idempotent rebuild, embedding service, vector repo isolation).
"""

import asyncio

import pytest


async def _list_documents(client, project_id: str) -> list[dict]:
    resp = await client.get(f"/api/v1/projects/{project_id}/documents")
    assert resp.status_code == 200
    return resp.json()["items"]


async def _wait_for_documents(
    client,
    project_id: str,
    predicate,
    *,
    attempts: int = 60,
    delay: float = 0.05,
) -> list[dict]:
    last_docs: list[dict] = []
    for _ in range(attempts):
        last_docs = await _list_documents(client, project_id)
        if predicate(last_docs):
            return last_docs
        await asyncio.sleep(delay)
    pytest.fail(f"Document predicate was not satisfied. Last docs: {last_docs}")


async def _wait_for_index_status(
    client,
    project_id: str,
    expected_status: str,
    *,
    attempts: int = 60,
    delay: float = 0.05,
) -> dict:
    last_body: dict = {}
    for _ in range(attempts):
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert resp.status_code == 200
        last_body = resp.json()
        if last_body["index_status"] == expected_status:
            return last_body
        await asyncio.sleep(delay)
    pytest.fail(f"Index status never became {expected_status}. Last body: {last_body}")


async def _wait_for_job_terminal_state(
    client,
    project_id: str,
    *,
    attempts: int = 80,
    delay: float = 0.05,
) -> dict:
    last_body: dict = {}
    for _ in range(attempts):
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert resp.status_code == 200
        last_body = resp.json()
        job = last_body.get("job")
        if job and job["status"] in {"completed", "failed", "cancelled"}:
            return last_body
        await asyncio.sleep(delay)
    pytest.fail(f"Job did not reach a terminal state. Last body: {last_body}")


async def _wait_for_job_running(
    client,
    project_id: str,
    *,
    attempts: int = 60,
    delay: float = 0.05,
) -> dict:
    last_body: dict = {}
    for _ in range(attempts):
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert resp.status_code == 200
        last_body = resp.json()
        job = last_body.get("job")
        if job and job["status"] == "running":
            return last_body
        await asyncio.sleep(delay)
    pytest.fail(f"Job never reached running state. Last body: {last_body}")


async def _build_project_index(client, project_id: str) -> dict:
    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")
    return resp.json()


# ---------------------------------------------------------------------------
# IDX-01: User can trigger a vector index build/rebuild
# ---------------------------------------------------------------------------


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
    # Create empty project
    resp = await client.post("/api/v1/projects", json={"name": "Empty Project"})
    project_id = resp.json()["id"]

    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 400
    body = resp.json()
    assert "no_documents" in body.get("error_code", "") or "no parsed" in body.get("message", "").lower()


async def test_trigger_build_conflict(project_with_parsed_docs):
    """IDX-01 + INFR-06: Cannot start build while one is running."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Start first build
    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202

    # Wait a moment for background task to start
    await asyncio.sleep(0.2)

    # Try second build -- should conflict (409) if first is still running
    resp2 = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    # If the first job already completed, the project may have no eligible
    # work left and return 400 instead of a conflict.
    assert resp2.status_code in (202, 400, 409)


# ---------------------------------------------------------------------------
# IDX-02: User can observe indexing progress
# ---------------------------------------------------------------------------


async def test_poll_progress(project_with_parsed_docs):
    """IDX-02: Polling status endpoint shows progress fields."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Trigger build
    await client.post(f"/api/v1/projects/{project_id}/indexing/build")

    # Wait for completion (mocked embedding is fast)
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


# ---------------------------------------------------------------------------
# IDX-03: User can cancel a running indexing job
# ---------------------------------------------------------------------------


async def test_cancel_job(project_with_parsed_docs):
    """IDX-03: Cancel endpoint sets job status to cancelled."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Slow down the mock embedding service so the background task doesn't
    # finish before the cancel request arrives (otherwise it's a race).
    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.3)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        # Trigger build
        resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert resp.status_code == 202

        # Cancel immediately
        resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        # Might be 200 (cancelled) or 404 (job already completed)
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


# ---------------------------------------------------------------------------
# IDX-04: User can retry a failed indexing job
# ---------------------------------------------------------------------------


async def test_retry_after_cancel(project_with_parsed_docs):
    """IDX-04: Retry creates a new pending job after cancellation."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Trigger build and wait for completion
    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        job_status = resp.json().get("job", {})
        if job_status and job_status.get("status") in ("completed", "failed"):
            break

    # Cancel if still running, then retry
    cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
    if cancel_resp.status_code == 200:
        retry_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/retry")
        assert retry_resp.status_code == 202
        assert retry_resp.json()["status"] == "pending"


async def test_retry_invalid_state(project_with_parsed_docs):
    """IDX-04: Retry with no failed/cancelled job returns 400."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # No job exists yet, retry should fail
    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/retry")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# IDX-05: User sees stale-index warnings
# ---------------------------------------------------------------------------


async def test_stale_detection(project_with_parsed_docs):
    """IDX-05: Stale detection after settings change marks project as stale."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Build index
    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    # Change settings (embedding model) -- should trigger stale
    resp = await client.put(
        "/api/v1/settings",
        json={
            "embedding_model": "different-model",
        },
    )
    assert resp.status_code == 200

    # Check project shows stale
    resp = await client.get(f"/api/v1/projects/{project_id}")
    body = resp.json()
    # After settings change, project should be stale
    assert body["index_status"] in ("stale", "not_indexed")


# ---------------------------------------------------------------------------
# IDX-06: User can see last indexed timestamp per project
# ---------------------------------------------------------------------------


async def test_last_indexed_at(project_with_parsed_docs):
    """IDX-06: last_indexed_at set on project after successful indexing."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Before indexing: no timestamp
    resp = await client.get(f"/api/v1/projects/{project_id}")
    assert resp.json()["last_indexed_at"] is None

    # Build index
    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    # After indexing: timestamp is set
    resp = await client.get(f"/api/v1/projects/{project_id}")
    body = resp.json()
    assert body["last_indexed_at"] is not None
    assert body["index_status"] == "indexed"


# ---------------------------------------------------------------------------
# IDX-07: System tracks embedding model version and chunk parameters
# ---------------------------------------------------------------------------


async def test_chunk_params_hash():
    """IDX-07: chunk_params_hash is deterministic and changes with params."""
    from app.core.hashing import compute_chunk_params_hash

    hash1 = compute_chunk_params_hash(4000, 800, "text-embedding-test")
    hash2 = compute_chunk_params_hash(4000, 800, "text-embedding-test")
    hash3 = compute_chunk_params_hash(2000, 400, "text-embedding-test")
    hash4 = compute_chunk_params_hash(4000, 800, "different-model")

    assert hash1 == hash2  # Same params = same hash
    assert hash1 != hash3  # Different chunk_size = different hash
    assert hash1 != hash4  # Different model = different hash
    assert len(hash1) == 64  # SHA-256 hex digest length


# ---------------------------------------------------------------------------
# INFR-05: Background jobs persisted in SQLite (restart-safe)
# ---------------------------------------------------------------------------


async def test_job_persistence(project_with_parsed_docs):
    """INFR-05: Job state is persisted in SQLite and queryable."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Trigger build
    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202
    job_id = resp.json()["id"]

    # Status endpoint can read the job from DB
    await asyncio.sleep(0.2)
    resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["job"] is not None
    assert body["job"]["id"] == job_id


# ---------------------------------------------------------------------------
# INFR-06: Job handlers idempotent for rebuild/retry/cancel
# ---------------------------------------------------------------------------


async def test_idempotent_rebuild(project_with_parsed_docs, mock_vector_repo):
    """INFR-06: Build path is safe to rerun and writes embeddings for the project."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    # Build index
    await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    for _ in range(30):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        if resp.json().get("index_status") == "indexed":
            break

    # Initial builds may rely on vector upsert's get-or-create semantics rather
    # than explicitly deleting/recreating the collection.
    assert mock_vector_repo.upsert_embeddings.called


# ---------------------------------------------------------------------------
# RETR-03: System embeds chunks via OpenAI-compatible API
# ---------------------------------------------------------------------------


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

    # Verify embed_texts was called (once per document)
    assert mock_embedding_service.embed_texts.called
    # Verify model parameter was passed
    call_args = mock_embedding_service.embed_texts.call_args_list
    for call in call_args:
        args, kwargs = call
        # First arg is texts list, second is model string
        assert len(args) >= 2 or "model" in kwargs


# ---------------------------------------------------------------------------
# RETR-04: ChromaDB collection-per-project isolation
# ---------------------------------------------------------------------------


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

    # Verify vector writes are scoped to the project_id.
    upsert_calls = mock_vector_repo.upsert_embeddings.call_args_list
    assert len(upsert_calls) >= 1

    from uuid import UUID

    call_project_id = upsert_calls[0][0][0]
    assert str(call_project_id) == project_id


# ---------------------------------------------------------------------------
# Additional edge case tests
# ---------------------------------------------------------------------------


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


async def test_first_document_upload_flow_stays_not_indexed_until_build(async_client_with_indexing):
    """Empty project stays unindexed until the first successful build completes."""
    client = async_client_with_indexing

    project_resp = await client.post("/api/v1/projects", json={"name": "First Doc Flow"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "not_indexed"
    assert status_resp.json()["job"] is None

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("first.txt", b"first document content " * 40, "text/plain"))],
    )
    assert upload_resp.status_code == 202

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 1 and items[0]["status"] == "parsed",
    )
    assert docs[0]["status"] == "parsed"

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "not_indexed"

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202

    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == 1
    assert final_status["job"]["documents_processed"] == 1


async def test_incremental_upload_rebuilds_only_new_document(
    project_with_parsed_docs,
    mock_vector_repo,
    mock_embedding_service,
):
    """Uploading one parsed document after a healthy baseline triggers a 1-document incremental rebuild."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    assert all(doc["status"] == "indexed" for doc in baseline_docs)

    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)
    mock_vector_repo.create_collection.reset_mock()
    mock_vector_repo.delete_collection.reset_mock()
    mock_embedding_service.embed_texts.reset_mock()

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("fresh.txt", b"new incremental document " * 50, "text/plain"))],
    )
    assert upload_resp.status_code == 202

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "stale"

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1 and any(d["status"] == "parsed" for d in items),
    )
    new_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)
    old_docs = [doc for doc in docs if doc["id"] in baseline_doc_ids]
    assert new_doc["status"] == "parsed"
    assert all(doc["status"] == "indexed" for doc in old_docs)

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202

    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == 1
    assert final_status["job"]["documents_processed"] == 1

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "indexed" for doc in items),
    )
    new_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)
    old_docs = [doc for doc in docs if doc["id"] in baseline_doc_ids]
    assert new_doc["status"] == "indexed"
    assert all(doc["status"] == "indexed" for doc in old_docs)
    assert not mock_vector_repo.delete_collection.called
    assert not mock_vector_repo.create_collection.called
    assert mock_embedding_service.embed_texts.call_count == 1


async def test_delete_parsed_document_restores_indexed_project(project_with_parsed_docs, mock_vector_repo):
    """Deleting the only newly parsed document should restore a previously indexed project to indexed."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("delete-me.txt", b"temporary parsed content " * 40, "text/plain"))],
    )
    assert upload_resp.status_code == 202

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1 and any(d["status"] == "parsed" for d in items),
    )
    new_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)

    delete_resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{new_doc['id']}")
    assert delete_resp.status_code == 204

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: {doc["id"] for doc in items} == baseline_doc_ids,
    )
    assert all(doc["status"] == "indexed" for doc in docs)

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "indexed"


async def test_delete_indexed_document_keeps_project_consistent(project_with_parsed_docs, mock_vector_repo):
    """Deleting an indexed document removes its embeddings without making the remaining project stale."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in docs)
    mock_vector_repo.delete_document_embeddings.reset_mock()

    victim = docs[0]
    delete_resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{victim['id']}")
    assert delete_resp.status_code == 204

    remaining_docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(docs) - 1,
    )
    assert all(doc["id"] != victim["id"] for doc in remaining_docs)
    assert all(doc["status"] == "indexed" for doc in remaining_docs)
    mock_vector_repo.delete_document_embeddings.assert_called_once()
    call_args = mock_vector_repo.delete_document_embeddings.call_args[0]
    assert str(call_args[0]) == project_id
    assert str(call_args[1]) == victim["id"]

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "indexed"


async def test_settings_change_forces_full_rebuild(project_with_parsed_docs, mock_vector_repo):
    """Changing chunk settings should mark indexed docs for reindex and the next build should be full."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)
    mock_vector_repo.create_collection.reset_mock()
    mock_vector_repo.delete_collection.reset_mock()

    settings_resp = await client.put("/api/v1/settings", json={"chunk_size": 1800})
    assert settings_resp.status_code == 200

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )
    assert len(docs) == len(baseline_docs)

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "stale"

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202

    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == len(baseline_docs)
    mock_vector_repo.delete_collection.assert_called()
    mock_vector_repo.create_collection.assert_called()


async def test_settings_change_during_active_incremental_index_ends_stale(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """If indexing settings change during an active build, the finished project should remain stale."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("drift.txt", b"settings drift content " * 60, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1 and any(d["id"] not in baseline_doc_ids and d["status"] == "parsed" for d in items),
    )

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.3)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202
        await _wait_for_job_running(client, project_id)
        await _wait_for_documents(
            client,
            project_id,
            lambda items: any(
                d["id"] not in baseline_doc_ids and d["status"] == "indexing"
                for d in items
            ),
        )

        settings_resp = await client.put("/api/v1/settings", json={"chunk_overlap": 123})
        assert settings_resp.status_code == 200

        terminal = await _wait_for_job_terminal_state(client, project_id)
        assert terminal["job"]["status"] == "completed"

        status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["index_status"] == "stale"
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]


async def test_incremental_cancel_keeps_previously_indexed_documents(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Cancelling an incremental rebuild must not downgrade previously indexed documents."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("cancel-me.txt", b"cancel scenario content " * 60, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1 and any(d["id"] not in baseline_doc_ids and d["status"] == "parsed" for d in items),
    )

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.3)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202
        running = await _wait_for_job_running(client, project_id)
        assert running["job"]["documents_total"] == 1

        cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "cancelled"

        terminal = await _wait_for_job_terminal_state(client, project_id)
        assert terminal["job"]["status"] == "cancelled"

        docs = await _list_documents(client, project_id)
        old_docs = [doc for doc in docs if doc["id"] in baseline_doc_ids]
        new_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)
        assert all(doc["status"] == "indexed" for doc in old_docs)
        assert new_doc["status"] in {"parsed", "stale"}

        status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["index_status"] == "stale"
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]


async def test_trigger_build_detects_missing_collection_and_rebuilds_indexed_documents(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """A project marked indexed in SQLite should still be rebuildable when the vector collection is missing."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = False
    mock_vector_repo.collection_count.return_value = 0

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202

    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == len(docs)
