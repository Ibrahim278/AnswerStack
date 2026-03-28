"""Integration tests for incremental indexing flows and related edge cases."""

import asyncio

from .indexing_helpers import (
    _build_project_index,
    _list_documents,
    _upload_document_without_background,
    _wait_for_documents,
    _wait_for_index_status,
    _wait_for_job_running,
    _wait_for_job_terminal_state,
    _wait_for_status_body,
)


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
        lambda items: len(items) == len(baseline_docs) + 1
        and any(d["id"] not in baseline_doc_ids and d["status"] == "parsed" for d in items),
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
        lambda items: len(items) == len(baseline_docs) + 3
        and len(
            [d for d in items if d["id"] not in baseline_doc_ids and d["status"] == "parsed"]
        )
        == 3,
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
                doc["id"] not in baseline_doc_ids and doc["status"] == "indexing" for doc in items
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

    from pathlib import Path
    from uuid import UUID

    from app.services import document as document_service_module

    original_get_parser = document_service_module.get_parser_for_extension
    original_parse_document_background = document_service_module._parse_document_background

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
        lambda items: any(doc["id"] == new_doc_id and doc["status"] == "parsing" for doc in items),
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
        lambda items: len(items) == len(baseline_docs) + 1
        and any(doc["id"] not in baseline_doc_ids and doc["status"] == "parsed" for doc in items),
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
