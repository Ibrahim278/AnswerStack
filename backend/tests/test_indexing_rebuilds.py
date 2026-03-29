"""Integration tests for full rebuild semantics and settings drift edge cases."""

import asyncio

from .indexing_helpers import (
    _build_project_index,
    _configure_keyword_embeddings,
    _create_project_with_parsed_documents,
    _get_project_chunk_ids,
    _install_stateful_vector_repo,
    _list_documents,
    _wait_for_documents,
    _wait_for_index_status,
    _wait_for_job_running,
    _wait_for_job_terminal_state,
    _wait_for_status_body,
)


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
        lambda items: len(items) == len(baseline_docs) + 1
        and any(d["id"] not in baseline_doc_ids and d["status"] == "parsed" for d in items),
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
                d["id"] not in baseline_doc_ids and d["status"] == "indexing" for d in items
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


async def test_trigger_build_detects_missing_chunk_id_and_rebuilds_indexed_documents(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """Indexed projects should rebuild when Chroma is missing only part of the chunk set."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    vector_store = _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Missing Vector Chunk",
        files=[
            ("alpha.txt", b"alpha alpha alpha baseline"),
            ("beta.txt", b"beta beta beta baseline"),
        ],
    )
    await _build_project_index(client, project_id)

    docs = await _list_documents(client, project_id)
    original_chunk_ids = await _get_project_chunk_ids(client, project_id)
    assert set(vector_store[project_id].keys()) == original_chunk_ids

    missing_chunk_id = next(iter(original_chunk_ids))
    vector_store[project_id].pop(missing_chunk_id)
    assert set(vector_store[project_id].keys()) == original_chunk_ids - {missing_chunk_id}

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202

    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == len(docs)
    assert set(vector_store[project_id].keys()) == original_chunk_ids


async def test_trigger_build_detects_chunk_id_drift_when_vector_count_matches(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """Count-only health checks must not accept a collection with the wrong chunk ids."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    vector_store = _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Vector Membership Drift",
        files=[
            ("alpha.txt", b"alpha alpha alpha baseline"),
            ("beta.txt", b"beta beta beta baseline"),
        ],
    )
    await _build_project_index(client, project_id)

    docs = await _list_documents(client, project_id)
    original_chunk_ids = await _get_project_chunk_ids(client, project_id)
    removed_chunk_id, removed_payload = next(iter(vector_store[project_id].items()))
    vector_store[project_id].pop(removed_chunk_id)
    vector_store[project_id]["orphan-chunk-id"] = {
        **removed_payload,
        "metadata": {**removed_payload["metadata"], "chunk_index": 999},
    }
    assert len(vector_store[project_id]) == len(original_chunk_ids)
    assert set(vector_store[project_id].keys()) != original_chunk_ids

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202

    final_status = await _wait_for_index_status(client, project_id, "indexed")
    assert final_status["job"]["documents_total"] == len(docs)
    assert set(vector_store[project_id].keys()) == original_chunk_ids
    assert "orphan-chunk-id" not in vector_store[project_id]


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
