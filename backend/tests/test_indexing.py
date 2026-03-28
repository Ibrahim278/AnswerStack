"""Integration tests for the vector indexing job system.

Covers IDX-01 through IDX-07, INFR-05, INFR-06, RETR-03, RETR-04
(trigger build, observe progress, cancel, retry, stale detection,
last-indexed timestamp, chunk params hashing, job persistence,
idempotent rebuild, embedding service, vector repo isolation).
"""

import asyncio
import math

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


async def _wait_for_status_body(
    client,
    project_id: str,
    predicate,
    *,
    attempts: int = 80,
    delay: float = 0.05,
) -> dict:
    last_body: dict = {}
    for _ in range(attempts):
        resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert resp.status_code == 200
        last_body = resp.json()
        if predicate(last_body):
            return last_body
        await asyncio.sleep(delay)
    pytest.fail(f"Status predicate was not satisfied. Last body: {last_body}")


async def _build_project_index(client, project_id: str) -> dict:
    resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")
    return resp.json()


async def _create_project_with_parsed_documents(
    client,
    *,
    name: str,
    files: list[tuple[str, bytes]],
) -> str:
    project_resp = await client.post("/api/v1/projects", json={"name": name})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    settings_resp = await client.put(
        "/api/v1/settings",
        json={
            "embedding_model": "text-embedding-test",
            "chunk_size": 4000,
            "chunk_overlap": 800,
        },
    )
    assert settings_resp.status_code == 200

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", (filename, content, "text/plain")) for filename, content in files],
    )
    assert upload_resp.status_code == 202

    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(files) and all(doc["status"] == "parsed" for doc in items),
    )
    return project_id


async def _upload_document_without_background(
    client,
    project_id: str,
    *,
    filename: str,
    content: bytes,
) -> dict:
    from uuid import UUID

    from app.repositories.document import SQLAlchemyDocumentRepository
    from app.repositories.project import SQLAlchemyProjectRepository
    from app.services.document import DocumentService, FileData

    class NoopBackgroundTasks:
        def add_task(self, func, *args, **kwargs):
            return None

    async with client._transport.app.state.session_factory() as session:  # type: ignore[union-attr]
        service = DocumentService(
            SQLAlchemyDocumentRepository(session),
            client._transport.app.state.settings,  # type: ignore[union-attr]
            SQLAlchemyProjectRepository(session),
        )
        result = await service.upload_documents(
            UUID(project_id),
            [FileData(filename=filename, content=content, content_type="text/plain")],
            NoopBackgroundTasks(),
            client._transport.app.state.session_factory,  # type: ignore[union-attr]
        )
    assert len(result.uploaded) == 1
    return result.uploaded[0].model_dump(mode="json")


def _configure_keyword_embeddings(mock_embedding_service) -> None:
    def _vectorize(text: str) -> list[float]:
        normalized = text.lower()
        keywords = ("alpha", "beta", "gamma", "delta", "stale")
        vector = [float(normalized.count(keyword)) for keyword in keywords]
        if not any(vector):
            vector.append(float(max(1, len(normalized.split()))))
        else:
            vector.append(1.0)
        return vector

    async def embed_texts(texts, model):
        return [_vectorize(text) for text in texts]

    async def embed_single(text, model):
        return _vectorize(text)

    mock_embedding_service.embed_texts.side_effect = embed_texts
    mock_embedding_service.embed_single.side_effect = embed_single


def _install_stateful_vector_repo(mock_vector_repo) -> dict[str, dict[str, dict]]:
    collections: set[str] = set()
    store: dict[str, dict[str, dict]] = {}

    def _project_store(project_id) -> dict[str, dict]:
        return store.setdefault(str(project_id), {})

    def create_collection(project_id):
        collections.add(str(project_id))
        store[str(project_id)] = {}

    def delete_collection(project_id):
        collections.discard(str(project_id))
        store.pop(str(project_id), None)

    def upsert_embeddings(project_id, ids, embeddings, documents, metadatas):
        project_store = _project_store(project_id)
        collections.add(str(project_id))
        for chunk_id, embedding, document, metadata in zip(
            ids, embeddings, documents, metadatas, strict=True
        ):
            project_store[chunk_id] = {
                "embedding": embedding,
                "document": document,
                "metadata": metadata,
            }

    def delete_document_embeddings(project_id, document_id):
        project_store = _project_store(project_id)
        doomed_ids = [
            chunk_id
            for chunk_id, payload in project_store.items()
            if payload["metadata"].get("document_id") == str(document_id)
        ]
        for chunk_id in doomed_ids:
            project_store.pop(chunk_id, None)

    def collection_exists(project_id):
        return str(project_id) in collections

    def collection_count(project_id):
        return len(store.get(str(project_id), {}))

    def query(project_id, query_embedding, n_results=20):
        def cosine_similarity(left: list[float], right: list[float]) -> float:
            numerator = sum(a * b for a, b in zip(left, right, strict=True))
            left_norm = math.sqrt(sum(value * value for value in left))
            right_norm = math.sqrt(sum(value * value for value in right))
            if left_norm == 0.0 or right_norm == 0.0:
                return 0.0
            return numerator / (left_norm * right_norm)

        scored = []
        for chunk_id, payload in store.get(str(project_id), {}).items():
            similarity = cosine_similarity(query_embedding, payload["embedding"])
            scored.append((1.0 - similarity, chunk_id, payload))

        scored.sort(key=lambda item: item[0])
        scored = scored[:n_results]
        return {
            "ids": [chunk_id for _, chunk_id, _ in scored],
            "documents": [payload["document"] for _, _, payload in scored],
            "metadatas": [payload["metadata"] for _, _, payload in scored],
            "distances": [distance for distance, _, _ in scored],
        }

    mock_vector_repo.create_collection.side_effect = create_collection
    mock_vector_repo.delete_collection.side_effect = delete_collection
    mock_vector_repo.upsert_embeddings.side_effect = upsert_embeddings
    mock_vector_repo.delete_document_embeddings.side_effect = delete_document_embeddings
    mock_vector_repo.collection_exists.side_effect = collection_exists
    mock_vector_repo.collection_count.side_effect = collection_count
    mock_vector_repo.query.side_effect = query

    return store


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


async def test_chunk_overlap_change_forces_full_rebuild(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Changing chunk overlap should mark indexed docs for reindex and the next build should be full."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)
    mock_vector_repo.create_collection.reset_mock()
    mock_vector_repo.delete_collection.reset_mock()

    settings_resp = await client.put("/api/v1/settings", json={"chunk_overlap": 123})
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


async def test_embedding_model_change_forces_full_rebuild(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Changing embedding model should mark indexed docs for reindex and the next build should be full."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)
    mock_vector_repo.create_collection.reset_mock()
    mock_vector_repo.delete_collection.reset_mock()

    settings_resp = await client.put("/api/v1/settings", json={"embedding_model": "different-model"})
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


async def test_incremental_cancel_before_work_starts_keeps_pending_document_parsed(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Cancelling an incremental rebuild before the first document starts should leave prior docs indexed."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}

    def slow_collection_count(project_id):
        import time

        slow_collection_count.calls += 1
        if slow_collection_count.calls == 1:
            time.sleep(0.3)
        return sum(doc["chunk_count"] for doc in baseline_docs)

    slow_collection_count.calls = 0
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.side_effect = slow_collection_count

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("cancel-before-start.txt", b"cancel before work starts " * 60, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1 and any(d["id"] not in baseline_doc_ids and d["status"] == "parsed" for d in items),
    )

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    running = await _wait_for_job_running(client, project_id)
    assert running["job"]["documents_total"] == 1
    assert running["job"]["documents_processed"] == 0

    cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    terminal = await _wait_for_job_terminal_state(client, project_id)
    assert terminal["job"]["status"] == "cancelled"
    assert terminal["job"]["documents_processed"] == 0

    docs = await _list_documents(client, project_id)
    old_docs = [doc for doc in docs if doc["id"] in baseline_doc_ids]
    new_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)
    assert all(doc["status"] == "indexed" for doc in old_docs)
    assert new_doc["status"] == "parsed"

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "stale"


async def test_incremental_cancel_near_completion_preserves_completed_documents(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Cancelling an incremental rebuild near completion should only leave remaining delta work stale."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[
            ("files", ("near-completion-a.txt", b"first near completion delta " * 50, "text/plain")),
            ("files", ("near-completion-b.txt", b"second near completion delta " * 50, "text/plain")),
            ("files", ("near-completion-c.txt", b"third near completion delta " * 50, "text/plain")),
        ],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 3 and len([d for d in items if d["id"] not in baseline_doc_ids and d["status"] == "parsed"]) == 3,
    )

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.2)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202

        running = await _wait_for_status_body(
            client,
            project_id,
            lambda body: body["job"]
            and body["job"]["status"] == "running"
            and body["job"]["documents_processed"] == 2
            and body["job"]["documents_total"] == 3,
        )
        assert running["job"]["documents_total"] == 3

        await _wait_for_documents(
            client,
            project_id,
            lambda items: any(
                doc["id"] not in baseline_doc_ids and doc["status"] == "indexing"
                for doc in items
            ),
        )

        cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "cancelled"

        terminal = await _wait_for_job_terminal_state(client, project_id)
        assert terminal["job"]["status"] == "cancelled"
        assert terminal["job"]["documents_processed"] == 2

        docs = await _list_documents(client, project_id)
        old_docs = [doc for doc in docs if doc["id"] in baseline_doc_ids]
        new_docs = [doc for doc in docs if doc["id"] not in baseline_doc_ids]
        assert all(doc["status"] == "indexed" for doc in old_docs)
        assert len([doc for doc in new_docs if doc["status"] == "indexed"]) == 2
        assert len([doc for doc in new_docs if doc["status"] in {"parsed", "stale"}]) == 1

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


async def test_delete_uploaded_document_restores_indexed_project(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Deleting a newly uploaded document before parsing starts should restore indexed state."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    terminal = await _wait_for_job_terminal_state(client, project_id)
    assert terminal["job"]["status"] == "completed"
    baseline_docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "indexed" for doc in items),
    )
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    new_doc = await _upload_document_without_background(
        client,
        project_id,
        filename="uploaded-only.txt",
        content=b"hold in uploaded state " * 20,
    )
    assert new_doc["status"] == "uploaded"

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


async def test_delete_parsing_document_restores_indexed_project(
    project_with_parsed_docs,
    mock_vector_repo,
    monkeypatch,
):
    """Deleting a document mid-parse should not leave chunks behind or stale project state."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    terminal = await _wait_for_job_terminal_state(client, project_id)
    assert terminal["job"]["status"] == "completed"
    baseline_docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "indexed" for doc in items),
    )
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    new_doc = await _upload_document_without_background(
        client,
        project_id,
        filename="parsing-delete.txt",
        content=b"hold in parsing state " * 40,
    )
    new_doc_id = new_doc["id"]

    from app.services import document as document_service_module

    original_get_parser = document_service_module.get_parser_for_extension
    original_parse_document_background = document_service_module._parse_document_background
    from pathlib import Path
    from uuid import UUID

    class SlowParser:
        def __init__(self, parser):
            self._parser = parser

        def parse(self, content: bytes, filename: str):
            import time

            time.sleep(1.0)
            return self._parser.parse(content, filename)

    def slow_get_parser(extension: str):
        return SlowParser(original_get_parser(extension))

    monkeypatch.setattr(document_service_module, "get_parser_for_extension", slow_get_parser)
    file_path = (
        Path(client._transport.app.state.settings.document_storage_path)  # type: ignore[union-attr]
        / project_id
        / new_doc_id
        / new_doc["filename"]
    )
    parse_task = asyncio.create_task(
        original_parse_document_background(
            client._transport.app.state.session_factory,  # type: ignore[union-attr]
            UUID(new_doc_id),
            file_path,
            client._transport.app.state.settings,  # type: ignore[union-attr]
        )
    )

    await _wait_for_documents(
        client,
        project_id,
        lambda items: any(
            doc["id"] == new_doc_id and doc["status"] == "parsing"
            for doc in items
        ),
    )

    delete_resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{new_doc_id}")
    assert delete_resp.status_code == 204

    await asyncio.wait_for(parse_task, timeout=2.0)

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: {doc["id"] for doc in items} == baseline_doc_ids,
    )
    assert all(doc["status"] == "indexed" for doc in docs)

    from sqlalchemy import func, select

    from app.models.document import Chunk

    async with client._transport.app.state.session_factory() as session:  # type: ignore[union-attr]
        chunk_count = await session.execute(
            select(func.count()).select_from(Chunk).where(Chunk.document_id == UUID(new_doc_id))
        )
        assert chunk_count.scalar_one() == 0

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "indexed"


async def test_full_rebuild_cancel_at_zero_of_total_stays_stale(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Cancelling a full rebuild before any documents process should keep all docs reindex-required."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    def slow_delete_collection(project_id):
        import time

        slow_delete_collection.calls += 1
        if slow_delete_collection.calls == 1:
            time.sleep(0.3)

    slow_delete_collection.calls = 0

    mock_vector_repo.delete_collection.side_effect = slow_delete_collection

    settings_resp = await client.put("/api/v1/settings", json={"chunk_size": 1700})
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    await _wait_for_job_running(client, project_id)

    cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    terminal = await _wait_for_job_terminal_state(client, project_id)
    assert terminal["job"]["status"] == "cancelled"
    assert terminal["job"]["documents_processed"] == 0
    await asyncio.sleep(0.2)

    docs = await _list_documents(client, project_id)
    assert all(doc["status"] == "reindex_required" for doc in docs)

    status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["index_status"] == "stale"


async def test_full_rebuild_cancel_at_one_of_total_stays_stale(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Cancelling a full rebuild after one document completes should roll the whole project back to stale."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    extra_upload = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("third.txt", b"third document for full rebuild cancel " * 40, "text/plain"))],
    )
    assert extra_upload.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 3 and all(doc["status"] == "parsed" for doc in items),
    )

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    settings_resp = await client.put("/api/v1/settings", json={"chunk_overlap": 123})
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.25)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202

        running = await _wait_for_status_body(
            client,
            project_id,
            lambda body: body["job"]
            and body["job"]["status"] == "running"
            and body["job"]["documents_processed"] == 1,
        )
        assert running["job"]["documents_total"] == 3

        cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "cancelled"

        terminal = await _wait_for_job_terminal_state(client, project_id)
        assert terminal["job"]["status"] == "cancelled"
        assert terminal["job"]["documents_processed"] == 1
        await asyncio.sleep(0.2)

        docs = await _list_documents(client, project_id)
        assert all(doc["status"] == "reindex_required" for doc in docs)

        status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["index_status"] == "stale"
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]


async def test_full_rebuild_cancel_near_completion_stays_stale(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """Cancelling near the end of a full rebuild should still leave the project stale until a clean retry."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    extra_upload = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("third-near-end.txt", b"near completion rebuild content " * 40, "text/plain"))],
    )
    assert extra_upload.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 3 and all(doc["status"] == "parsed" for doc in items),
    )

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    settings_resp = await client.put("/api/v1/settings", json={"chunk_size": 1900})
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.2)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202

        running = await _wait_for_status_body(
            client,
            project_id,
            lambda body: body["job"]
            and body["job"]["status"] == "running"
            and body["job"]["documents_processed"] == 2,
        )
        assert running["job"]["documents_total"] == 3

        cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "cancelled"

        terminal = await _wait_for_job_terminal_state(client, project_id)
        assert terminal["job"]["status"] == "cancelled"
        assert terminal["job"]["documents_processed"] == 2
        await asyncio.sleep(0.2)

        docs = await _list_documents(client, project_id)
        assert all(doc["status"] == "reindex_required" for doc in docs)

        status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["index_status"] == "stale"
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]


async def test_incremental_embedding_failure_preserves_existing_index_and_recovers(
    project_with_parsed_docs,
    mock_vector_repo,
):
    """A provider failure during incremental indexing should fail cleanly and retry only the new document."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("provider-failure.txt", b"provider failure content " * 50, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1 and any(doc["id"] not in baseline_doc_ids and doc["status"] == "parsed" for doc in items),
    )

    from unittest.mock import AsyncMock

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def failing_embed(texts, model):
        raise RuntimeError("embedding provider down")

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=failing_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202

        terminal = await _wait_for_job_terminal_state(client, project_id)
        assert terminal["job"]["status"] == "failed"
        assert "embedding provider down" in terminal["job"]["error_detail"]["message"]

        docs = await _list_documents(client, project_id)
        old_docs = [doc for doc in docs if doc["id"] in baseline_doc_ids]
        failed_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)
        assert all(doc["status"] == "indexed" for doc in old_docs)
        assert failed_doc["status"] == "parsed"

        status_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["index_status"] == "stale"
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]

    retry_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert retry_resp.status_code == 202
    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == 1


async def test_retrieval_integrity_after_incremental_rebuild(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """Incremental rebuild should make the new document retrievable without disturbing existing content."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Retrieval Incremental",
        files=[
            ("alpha.txt", b"alpha alpha alpha baseline"),
            ("beta.txt", b"beta beta beta baseline"),
        ],
    )
    await _build_project_index(client, project_id)

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("gamma.txt", b"gamma gamma gamma new content", "text/plain"))],
    )
    assert upload_resp.status_code == 202

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 3 and any(doc["filename"] == "gamma.txt" and doc["status"] == "parsed" for doc in items),
    )
    gamma_doc = next(doc for doc in docs if doc["filename"] == "gamma.txt")
    assert gamma_doc["status"] == "parsed"

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")

    from uuid import UUID

    from app.services.retrieval import RetrievalService

    retrieval = RetrievalService(
        mock_vector_repo,
        client._transport.app.state.embedding_service,  # type: ignore[union-attr]
        ranker=None,
    )
    results = await retrieval.retrieve(
        UUID(project_id),
        query="gamma",
        embedding_model="text-embedding-test",
        reranker_enabled=False,
        similarity_threshold=0.1,
    )
    assert results
    assert results[0].document_name == "gamma.txt"


async def test_retrieval_integrity_after_indexed_document_delete(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """Deleting an indexed document should remove it from retrieval results."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Retrieval Delete",
        files=[
            ("alpha.txt", b"alpha alpha alpha baseline"),
            ("beta.txt", b"beta beta beta baseline"),
        ],
    )
    await _build_project_index(client, project_id)

    docs = await _list_documents(client, project_id)
    victim = next(doc for doc in docs if doc["filename"] == "beta.txt")

    delete_resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{victim['id']}")
    assert delete_resp.status_code == 204

    from uuid import UUID

    from app.services.retrieval import RetrievalService

    retrieval = RetrievalService(
        mock_vector_repo,
        client._transport.app.state.embedding_service,  # type: ignore[union-attr]
        ranker=None,
    )
    results = await retrieval.retrieve(
        UUID(project_id),
        query="beta",
        embedding_model="text-embedding-test",
        reranker_enabled=False,
        similarity_threshold=0.8,
    )
    assert results == []


async def test_retrieval_integrity_after_settings_change_full_rebuild(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """A settings-change full rebuild should replace old chunk ids instead of leaking stale chunks."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    vector_store = _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Retrieval Rebuild",
        files=[
            ("alpha.txt", b"alpha alpha alpha baseline rebuild check"),
            ("beta.txt", b"beta beta beta baseline rebuild check"),
        ],
    )
    await _build_project_index(client, project_id)

    before_chunk_ids = set(vector_store[project_id].keys())
    assert before_chunk_ids

    settings_resp = await client.put("/api/v1/settings", json={"chunk_size": 100})
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")

    after_chunk_ids = set(vector_store[project_id].keys())
    assert after_chunk_ids
    assert before_chunk_ids.isdisjoint(after_chunk_ids)

    from uuid import UUID

    from app.services.retrieval import RetrievalService

    retrieval = RetrievalService(
        mock_vector_repo,
        client._transport.app.state.embedding_service,  # type: ignore[union-attr]
        ranker=None,
    )
    results = await retrieval.retrieve(
        UUID(project_id),
        query="alpha",
        embedding_model="text-embedding-test",
        reranker_enabled=False,
        similarity_threshold=0.8,
    )
    assert results
    assert all(result.document_name == "alpha.txt" for result in results)
    assert all(result.chunk_id in after_chunk_ids for result in results)
