"""API contract snapshots for indexing-related UI state transitions."""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock
from uuid import UUID

from .indexing_helpers import (
    _build_project_index,
    _list_documents,
    _upload_document_without_background,
    _wait_for_documents,
    _wait_for_index_status,
    _wait_for_job_running,
    _wait_for_job_terminal_state,
)


def _assert_uuid(value: str) -> str:
    UUID(value)
    return "<uuid>"


def _assert_datetime(value: str) -> str:
    datetime.fromisoformat(value)
    return "<datetime>"


def _assert_checksum(value: str) -> str:
    assert len(value) == 64
    assert all(ch in "0123456789abcdef" for ch in value)
    return "<sha256>"


def _normalize_job(job: dict | None) -> dict | None:
    if job is None:
        return None

    return {
        "id": _assert_uuid(job["id"]),
        "project_id": _assert_uuid(job["project_id"]),
        "status": job["status"],
        "documents_processed": job["documents_processed"],
        "documents_total": job["documents_total"],
        "percentage": job["percentage"],
        "current_document_id": (
            _assert_uuid(job["current_document_id"])
            if job["current_document_id"] is not None
            else None
        ),
        "error_detail": job["error_detail"],
        "created_at": _assert_datetime(job["created_at"]),
        "started_at": (
            _assert_datetime(job["started_at"])
            if job["started_at"] is not None
            else None
        ),
        "completed_at": (
            _assert_datetime(job["completed_at"])
            if job["completed_at"] is not None
            else None
        ),
    }


def _normalize_documents_payload(payload: dict) -> dict:
    normalized_items = []
    for item in sorted(payload["items"], key=lambda doc: doc["filename"]):
        normalized_items.append(
            {
                "id": _assert_uuid(item["id"]),
                "project_id": _assert_uuid(item["project_id"]),
                "filename": item["filename"],
                "original_filename": item["original_filename"],
                "file_type": item["file_type"],
                "file_size": item["file_size"],
                "checksum": _assert_checksum(item["checksum"]),
                "status": item["status"],
                "chunk_count": item["chunk_count"],
                "error_detail": item["error_detail"],
                "created_at": _assert_datetime(item["created_at"]),
                "updated_at": _assert_datetime(item["updated_at"]),
            }
        )

    return {
        "items": normalized_items,
        "next_cursor": payload["next_cursor"],
        "has_more": payload["has_more"],
    }


def _normalize_status_payload(payload: dict) -> dict:
    project = payload["project"]
    active_job = project["active_job"] if project is not None else None
    return {
        "status": payload["status"],
        "provider": payload["provider"],
        "health": payload["health"],
        "project": (
            {
                "index_status": project["index_status"],
                "documents_total": project["documents_total"],
                "documents_stale": project["documents_stale"],
                "last_indexed": (
                    _assert_datetime(project["last_indexed"])
                    if project["last_indexed"] is not None
                    else None
                ),
                "active_job": (
                    {
                        "status": active_job["status"],
                        "progress_current": active_job["progress_current"],
                        "progress_total": active_job["progress_total"],
                    }
                    if active_job is not None
                    else None
                ),
            }
            if project is not None
            else None
        ),
    }


async def _enable_status_provider(client) -> None:
    resp = await client.put(
        "/api/v1/settings",
        json={
            "provider_url": "http://mock-provider:1234/v1",
            "embedding_model": "text-embedding-test",
            "chunk_size": 4000,
            "chunk_overlap": 800,
        },
    )
    assert resp.status_code == 200


async def _capture_contract_snapshot(client, project_id: str) -> dict:
    indexing_resp = await client.get(f"/api/v1/projects/{project_id}/indexing/status")
    assert indexing_resp.status_code == 200
    documents_resp = await client.get(f"/api/v1/projects/{project_id}/documents")
    assert documents_resp.status_code == 200
    system_resp = await client.get(f"/api/v1/status?project_id={project_id}")
    assert system_resp.status_code == 200

    indexing = indexing_resp.json()
    return {
        "indexing_status": {
            "index_status": indexing["index_status"],
            "job": _normalize_job(indexing["job"]),
            "last_indexed_at": (
                _assert_datetime(indexing["last_indexed_at"])
                if indexing["last_indexed_at"] is not None
                else None
            ),
        },
        "documents": _normalize_documents_payload(documents_resp.json()),
        "system_status": _normalize_status_payload(system_resp.json()),
    }


async def test_api_contract_snapshot_upload(async_client_with_indexing):
    """12.1: Upload state snapshot stays aligned across indexing, documents, and system status."""
    client = async_client_with_indexing
    await _enable_status_provider(client)

    project_resp = await client.post("/api/v1/projects", json={"name": "Contract Upload"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    content = b"queued upload contract content " * 8
    document = await _upload_document_without_background(
        client,
        project_id,
        filename="queued-upload.txt",
        content=content,
    )
    assert document["status"] == "uploaded"

    snapshot = await _capture_contract_snapshot(client, project_id)
    assert snapshot == {
        "indexing_status": {
            "index_status": "not_indexed",
            "job": None,
            "last_indexed_at": None,
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "queued-upload.txt",
                    "original_filename": "queued-upload.txt",
                    "file_type": "txt",
                    "file_size": len(content),
                    "checksum": "<sha256>",
                    "status": "uploaded",
                    "chunk_count": 0,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                }
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "ready",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "not_indexed",
                "documents_total": 1,
                "documents_stale": 0,
                "last_indexed": None,
                "active_job": None,
            },
        },
    }


async def test_api_contract_snapshot_parse_completion(async_client_with_indexing):
    """12.2: Parsed documents snapshot stays aligned before the first build."""
    client = async_client_with_indexing
    await _enable_status_provider(client)

    project_resp = await client.post("/api/v1/projects", json={"name": "Contract Parse"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    content = b"parsed contract content " * 20
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("parsed-contract.txt", content, "text/plain"))],
    )
    assert upload_resp.status_code == 202

    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 1 and items[0]["status"] == "parsed",
    )

    snapshot = await _capture_contract_snapshot(client, project_id)
    assert snapshot == {
        "indexing_status": {
            "index_status": "not_indexed",
            "job": None,
            "last_indexed_at": None,
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "parsed-contract.txt",
                    "original_filename": "parsed-contract.txt",
                    "file_type": "txt",
                    "file_size": len(content),
                    "checksum": "<sha256>",
                    "status": "parsed",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                }
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "ready",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "not_indexed",
                "documents_total": 1,
                "documents_stale": 0,
                "last_indexed": None,
                "active_job": None,
            },
        },
    }


async def test_api_contract_snapshot_build_start(async_client_with_indexing):
    """12.3: Build start snapshot exposes an active running job and indexing document state."""
    client = async_client_with_indexing
    await _enable_status_provider(client)

    project_resp = await client.post("/api/v1/projects", json={"name": "Contract Build Start"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    content = b"build start contract content " * 20
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("build-start.txt", content, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 1 and items[0]["status"] == "parsed",
    )

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
            lambda items: len(items) == 1 and items[0]["status"] == "indexing",
        )

        snapshot = await _capture_contract_snapshot(client, project_id)
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]
        await _wait_for_index_status(client, project_id, "indexed")

    assert snapshot == {
        "indexing_status": {
            "index_status": "indexing",
            "job": {
                "id": "<uuid>",
                "project_id": "<uuid>",
                "status": "running",
                "documents_processed": 0,
                "documents_total": 1,
                "percentage": 0.0,
                "current_document_id": None,
                "error_detail": None,
                "created_at": "<datetime>",
                "started_at": "<datetime>",
                "completed_at": None,
            },
            "last_indexed_at": None,
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "build-start.txt",
                    "original_filename": "build-start.txt",
                    "file_type": "txt",
                    "file_size": len(content),
                    "checksum": "<sha256>",
                    "status": "indexing",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                }
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "indexing",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "indexing",
                "documents_total": 1,
                "documents_stale": 0,
                "last_indexed": None,
                "active_job": {
                    "status": "running",
                    "progress_current": 0,
                    "progress_total": 1,
                },
            },
        },
    }


async def test_api_contract_snapshot_build_completion(async_client_with_indexing):
    """12.4: Completed build snapshot exposes indexed documents and retained last job details."""
    client = async_client_with_indexing
    await _enable_status_provider(client)

    project_resp = await client.post("/api/v1/projects", json={"name": "Contract Build Complete"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    content = b"build completion contract content " * 20
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("build-complete.txt", content, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 1 and items[0]["status"] == "parsed",
    )

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")

    snapshot = await _capture_contract_snapshot(client, project_id)
    assert snapshot == {
        "indexing_status": {
            "index_status": "indexed",
            "job": {
                "id": "<uuid>",
                "project_id": "<uuid>",
                "status": "completed",
                "documents_processed": 1,
                "documents_total": 1,
                "percentage": 100.0,
                "current_document_id": "<uuid>",
                "error_detail": None,
                "created_at": "<datetime>",
                "started_at": "<datetime>",
                "completed_at": "<datetime>",
            },
            "last_indexed_at": "<datetime>",
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "build-complete.txt",
                    "original_filename": "build-complete.txt",
                    "file_type": "txt",
                    "file_size": len(content),
                    "checksum": "<sha256>",
                    "status": "indexed",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                }
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "ready",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "indexed",
                "documents_total": 1,
                "documents_stale": 0,
                "last_indexed": "<datetime>",
                "active_job": None,
            },
        },
    }


async def test_api_contract_snapshot_cancel(async_client_with_indexing):
    """12.5: Cancel snapshot preserves the cancelled job and restores the document to parsed."""
    client = async_client_with_indexing
    await _enable_status_provider(client)

    project_resp = await client.post("/api/v1/projects", json={"name": "Contract Cancel"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    content = b"cancel contract content " * 20
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("cancel-contract.txt", content, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 1 and items[0]["status"] == "parsed",
    )

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.3)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202
        await _wait_for_job_running(client, project_id)

        cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        assert cancel_resp.status_code == 200
        await _wait_for_job_terminal_state(client, project_id)
        await _wait_for_documents(
            client,
            project_id,
            lambda items: len(items) == 1 and items[0]["status"] == "parsed",
        )
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]

    snapshot = await _capture_contract_snapshot(client, project_id)
    assert snapshot == {
        "indexing_status": {
            "index_status": "stale",
            "job": {
                "id": "<uuid>",
                "project_id": "<uuid>",
                "status": "cancelled",
                "documents_processed": 0,
                "documents_total": 1,
                "percentage": 0.0,
                "current_document_id": None,
                "error_detail": None,
                "created_at": "<datetime>",
                "started_at": "<datetime>",
                "completed_at": "<datetime>",
            },
            "last_indexed_at": None,
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "cancel-contract.txt",
                    "original_filename": "cancel-contract.txt",
                    "file_type": "txt",
                    "file_size": len(content),
                    "checksum": "<sha256>",
                    "status": "parsed",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                }
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "stale",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "stale",
                "documents_total": 1,
                "documents_stale": 0,
                "last_indexed": None,
                "active_job": None,
            },
        },
    }


async def test_api_contract_snapshot_retry(async_client_with_indexing):
    """12.6: Retry snapshot exposes a fresh running job over the same parsed document."""
    client = async_client_with_indexing
    await _enable_status_provider(client)

    project_resp = await client.post("/api/v1/projects", json={"name": "Contract Retry"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    content = b"retry contract content " * 20
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("retry-contract.txt", content, "text/plain"))],
    )
    assert upload_resp.status_code == 202
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == 1 and items[0]["status"] == "parsed",
    )

    original_embed = client._transport.app.state.embedding_service.embed_texts  # type: ignore[union-attr]

    async def slow_embed(texts, model):
        await asyncio.sleep(0.3)
        return [[0.1] * 384 for _ in texts]

    client._transport.app.state.embedding_service.embed_texts = AsyncMock(side_effect=slow_embed)  # type: ignore[union-attr]

    try:
        build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
        assert build_resp.status_code == 202
        await _wait_for_job_running(client, project_id)

        cancel_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/cancel")
        assert cancel_resp.status_code == 200
        await _wait_for_job_terminal_state(client, project_id)
        await _wait_for_documents(
            client,
            project_id,
            lambda items: len(items) == 1 and items[0]["status"] == "parsed",
        )

        retry_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/retry")
        assert retry_resp.status_code == 202
        await _wait_for_job_running(client, project_id)
        await _wait_for_documents(
            client,
            project_id,
            lambda items: len(items) == 1 and items[0]["status"] == "indexing",
        )

        snapshot = await _capture_contract_snapshot(client, project_id)
    finally:
        client._transport.app.state.embedding_service.embed_texts = original_embed  # type: ignore[union-attr]
        await _wait_for_index_status(client, project_id, "indexed")

    assert snapshot == {
        "indexing_status": {
            "index_status": "indexing",
            "job": {
                "id": "<uuid>",
                "project_id": "<uuid>",
                "status": "running",
                "documents_processed": 0,
                "documents_total": 1,
                "percentage": 0.0,
                "current_document_id": None,
                "error_detail": None,
                "created_at": "<datetime>",
                "started_at": "<datetime>",
                "completed_at": None,
            },
            "last_indexed_at": None,
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "retry-contract.txt",
                    "original_filename": "retry-contract.txt",
                    "file_type": "txt",
                    "file_size": len(content),
                    "checksum": "<sha256>",
                    "status": "indexing",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                }
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "indexing",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "indexing",
                "documents_total": 1,
                "documents_stale": 0,
                "last_indexed": None,
                "active_job": {
                    "status": "running",
                    "progress_current": 0,
                    "progress_total": 1,
                },
            },
        },
    }


async def test_api_contract_snapshot_delete(project_with_parsed_docs, mock_vector_repo):
    """12.7: Delete snapshot removes the stale delta document and restores indexed project state."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]
    await _enable_status_provider(client)

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    baseline_doc_ids = {doc["id"] for doc in baseline_docs}
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    content = b"delete contract content " * 20
    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=[("files", ("delete-contract.txt", content, "text/plain"))],
    )
    assert upload_resp.status_code == 202

    docs = await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs) + 1
        and any(doc["id"] not in baseline_doc_ids and doc["status"] == "parsed" for doc in items),
    )
    doomed_doc = next(doc for doc in docs if doc["id"] not in baseline_doc_ids)

    delete_resp = await client.delete(f"/api/v1/projects/{project_id}/documents/{doomed_doc['id']}")
    assert delete_resp.status_code == 204
    await _wait_for_documents(
        client,
        project_id,
        lambda items: {doc["id"] for doc in items} == baseline_doc_ids,
    )

    snapshot = await _capture_contract_snapshot(client, project_id)
    assert snapshot == {
        "indexing_status": {
            "index_status": "indexed",
            "job": {
                "id": "<uuid>",
                "project_id": "<uuid>",
                "status": "completed",
                "documents_processed": len(baseline_docs),
                "documents_total": len(baseline_docs),
                "percentage": 100.0,
                "current_document_id": "<uuid>",
                "error_detail": None,
                "created_at": "<datetime>",
                "started_at": "<datetime>",
                "completed_at": "<datetime>",
            },
            "last_indexed_at": "<datetime>",
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "test1.txt",
                    "original_filename": "test1.txt",
                    "file_type": "txt",
                    "file_size": 600,
                    "checksum": "<sha256>",
                    "status": "indexed",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                },
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "test2.txt",
                    "original_filename": "test2.txt",
                    "file_type": "txt",
                    "file_size": 620,
                    "checksum": "<sha256>",
                    "status": "indexed",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                },
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "ready",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "indexed",
                "documents_total": len(baseline_docs),
                "documents_stale": 0,
                "last_indexed": "<datetime>",
                "active_job": None,
            },
        },
    }


async def test_api_contract_snapshot_settings_change(project_with_parsed_docs, mock_vector_repo):
    """12.8: Settings change snapshot exposes full-rebuild requirements across all API views."""
    data = project_with_parsed_docs
    client, project_id = data["client"], data["project_id"]
    await _enable_status_provider(client)

    await _build_project_index(client, project_id)
    baseline_docs = await _list_documents(client, project_id)
    mock_vector_repo.collection_exists.return_value = True
    mock_vector_repo.collection_count.return_value = sum(doc["chunk_count"] for doc in baseline_docs)

    settings_resp = await client.put("/api/v1/settings", json={"chunk_size": 1800})
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: len(items) == len(baseline_docs)
        and all(doc["status"] == "reindex_required" for doc in items),
    )

    snapshot = await _capture_contract_snapshot(client, project_id)
    assert snapshot == {
        "indexing_status": {
            "index_status": "stale",
            "job": {
                "id": "<uuid>",
                "project_id": "<uuid>",
                "status": "completed",
                "documents_processed": len(baseline_docs),
                "documents_total": len(baseline_docs),
                "percentage": 100.0,
                "current_document_id": "<uuid>",
                "error_detail": None,
                "created_at": "<datetime>",
                "started_at": "<datetime>",
                "completed_at": "<datetime>",
            },
            "last_indexed_at": "<datetime>",
        },
        "documents": {
            "items": [
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "test1.txt",
                    "original_filename": "test1.txt",
                    "file_type": "txt",
                    "file_size": 600,
                    "checksum": "<sha256>",
                    "status": "reindex_required",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                },
                {
                    "id": "<uuid>",
                    "project_id": "<uuid>",
                    "filename": "test2.txt",
                    "original_filename": "test2.txt",
                    "file_type": "txt",
                    "file_size": 620,
                    "checksum": "<sha256>",
                    "status": "reindex_required",
                    "chunk_count": 1,
                    "error_detail": None,
                    "created_at": "<datetime>",
                    "updated_at": "<datetime>",
                },
            ],
            "next_cursor": None,
            "has_more": False,
        },
        "system_status": {
            "status": "stale",
            "provider": {
                "configured": True,
                "connected": True,
                "last_error": None,
            },
            "health": {
                "database": True,
                "vector_store": True,
            },
            "project": {
                "index_status": "stale",
                "documents_total": len(baseline_docs),
                "documents_stale": len(baseline_docs),
                "last_indexed": "<datetime>",
                "active_job": None,
            },
        },
    }
