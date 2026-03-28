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
