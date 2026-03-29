"""Integration tests for retrieval integrity across indexing mutations."""

from .indexing_helpers import (
    _build_project_index,
    _configure_keyword_embeddings,
    _create_project_with_parsed_documents,
    _get_project_chunk_ids,
    _install_stateful_vector_repo,
    _list_documents,
    _wait_for_documents,
    _wait_for_index_status,
)


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
        lambda items: len(items) == 3
        and any(doc["filename"] == "gamma.txt" and doc["status"] == "parsed" for doc in items),
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


async def test_indexed_document_delete_restores_exact_vector_chunk_parity(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """Deleting an indexed document should leave remaining SQLite and Chroma chunk ids identical."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    vector_store = _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Retrieval Delete Parity",
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

    remaining_chunk_ids = await _get_project_chunk_ids(client, project_id)
    assert remaining_chunk_ids
    assert set(vector_store[project_id].keys()) == remaining_chunk_ids


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


async def test_retrieval_integrity_after_rechunk_reparse_rebuild_has_no_duplicate_chunks(
    async_client_with_indexing,
    mock_vector_repo,
    mock_embedding_service,
):
    """Repeated rechunk rebuilds should leave only the current chunk ids retrievable."""
    client = async_client_with_indexing
    _configure_keyword_embeddings(mock_embedding_service)
    vector_store = _install_stateful_vector_repo(mock_vector_repo)

    project_id = await _create_project_with_parsed_documents(
        client,
        name="Retrieval Dedupe",
        files=[
            ("gamma.txt", ("gamma " * 1200).encode()),
        ],
    )
    await _build_project_index(client, project_id)

    initial_chunk_ids = set(vector_store[project_id].keys())
    assert len(initial_chunk_ids) > 1

    settings_resp = await client.put("/api/v1/settings", json={"chunk_size": 600})
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")
    middle_chunk_ids = set(vector_store[project_id].keys())
    assert middle_chunk_ids
    assert initial_chunk_ids.isdisjoint(middle_chunk_ids)

    settings_resp = await client.put(
        "/api/v1/settings",
        json={"chunk_size": 450, "chunk_overlap": 100},
    )
    assert settings_resp.status_code == 200
    await _wait_for_documents(
        client,
        project_id,
        lambda items: all(doc["status"] == "reindex_required" for doc in items),
    )

    build_resp = await client.post(f"/api/v1/projects/{project_id}/indexing/build")
    assert build_resp.status_code == 202
    await _wait_for_index_status(client, project_id, "indexed")
    final_chunk_ids = set(vector_store[project_id].keys())
    assert final_chunk_ids
    assert initial_chunk_ids.isdisjoint(final_chunk_ids)
    assert middle_chunk_ids.isdisjoint(final_chunk_ids)

    from uuid import UUID

    from sqlalchemy import select

    from app.models.document import Chunk, Document
    from app.services.retrieval import RetrievalService

    async with client._transport.app.state.session_factory() as session:  # type: ignore[union-attr]
        db_chunk_ids = {
            str(chunk_id)
            for chunk_id in (
                await session.execute(
                    select(Chunk.id).join(Document).where(Document.project_id == UUID(project_id))
                )
            ).scalars()
        }

    assert final_chunk_ids == db_chunk_ids

    retrieval = RetrievalService(
        mock_vector_repo,
        client._transport.app.state.embedding_service,  # type: ignore[union-attr]
        ranker=None,
    )
    results = await retrieval.retrieve(
        UUID(project_id),
        query="gamma",
        embedding_model="text-embedding-test",
        top_k=len(final_chunk_ids),
        initial_k=len(final_chunk_ids),
        reranker_enabled=False,
        similarity_threshold=0.1,
    )
    retrieved_chunk_ids = [result.chunk_id for result in results]
    assert retrieved_chunk_ids
    assert len(retrieved_chunk_ids) == len(set(retrieved_chunk_ids))
    assert set(retrieved_chunk_ids) == final_chunk_ids
