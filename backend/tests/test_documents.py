"""Integration tests for the document ingestion pipeline.

Covers DOC-01 through DOC-07 (document upload, list, delete, validation,
duplicate detection, error diagnostics, metadata) and SEC-03/SEC-04
(filename sanitization, path traversal prevention).
"""

import asyncio
import os
from uuid import UUID, uuid4

import pytest


# ---------------------------------------------------------------------------
# DOC-01: Upload multiple files
# ---------------------------------------------------------------------------


async def test_upload_single_txt_file(async_client, project_id):
    """DOC-01: Upload a single .txt file returns 202 with document record."""
    content = b"Hello world, this is a test document."
    files = [("files", ("test.txt", content, "text/plain"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    data = response.json()

    assert len(data["uploaded"]) == 1
    assert data["rejected"] == []

    doc = data["uploaded"][0]
    assert doc["status"] == "uploaded"
    assert doc["filename"] == "test.txt"
    assert doc["file_type"] == "txt"
    assert doc["file_size"] == len(content)
    # Checksum is a 64-char hex SHA-256
    assert len(doc["checksum"]) == 64
    assert all(c in "0123456789abcdef" for c in doc["checksum"])
    # UUID fields present
    UUID(doc["id"])
    assert doc["project_id"] == str(project_id)


async def test_upload_multiple_files(async_client, project_id):
    """DOC-01: Upload multiple files in a single request."""
    files = [
        ("files", ("doc1.txt", b"Document one content.", "text/plain")),
        ("files", ("doc2.md", b"# Document two\n\nMarkdown content.", "text/markdown")),
    ]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    data = response.json()
    assert len(data["uploaded"]) == 2
    assert data["rejected"] == []


async def test_upload_md_file(async_client, project_id):
    """DOC-01: Upload a .md file is accepted with correct file_type."""
    files = [("files", ("readme.md", b"# Hello Markdown", "text/markdown"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    doc = response.json()["uploaded"][0]
    assert doc["file_type"] == "md"


async def test_upload_pdf_file(async_client, project_id, sample_pdf_bytes):
    """DOC-01: Upload a .pdf file is accepted and initially in 'uploaded' status."""
    files = [("files", ("test.pdf", sample_pdf_bytes, "application/pdf"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    doc = response.json()["uploaded"][0]
    assert doc["file_type"] == "pdf"
    assert doc["status"] == "uploaded"


# ---------------------------------------------------------------------------
# DOC-04: Validation errors for rejected files
# ---------------------------------------------------------------------------


async def test_upload_invalid_type_rejected(async_client, project_id):
    """DOC-04: Uploading an unsupported file type results in rejection."""
    files = [("files", ("malware.exe", b"MZ\x90\x00", "application/octet-stream"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    data = response.json()
    assert data["uploaded"] == []
    assert len(data["rejected"]) == 1

    rejected = data["rejected"][0]
    assert rejected["error_code"] == "document.invalid_type"
    assert ".txt" in rejected["reason"] or "Only" in rejected["reason"]


async def test_upload_mixed_valid_and_invalid(async_client, project_id):
    """DOC-04: Mixed upload -- valid files accepted, invalid files rejected."""
    files = [
        ("files", ("good.txt", b"Valid text content.", "text/plain")),
        ("files", ("bad.jpg", b"\xff\xd8\xff\xe0", "image/jpeg")),
    ]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    data = response.json()
    assert len(data["uploaded"]) == 1
    assert len(data["rejected"]) == 1
    assert data["uploaded"][0]["filename"] == "good.txt"
    assert data["rejected"][0]["error_code"] == "document.invalid_type"


async def test_upload_oversized_file_rejected(async_client, project_id, monkeypatch):
    """DOC-04: Uploading a file that exceeds max size is rejected."""
    # Set max upload size to 0 MB so any file is oversized
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_size_mb", 0)

    files = [("files", ("tiny.txt", b"x", "text/plain"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    data = response.json()
    assert data["uploaded"] == []
    assert len(data["rejected"]) == 1
    assert data["rejected"][0]["error_code"] == "document.too_large"


async def test_upload_no_files_returns_error(async_client, project_id):
    """DOC-04: POST with no files field returns 422 validation error."""
    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# DOC-05: Duplicate detection
# ---------------------------------------------------------------------------


async def test_upload_duplicate_detected(async_client, project_id):
    """DOC-05: Uploading same filename+checksum is rejected as duplicate."""
    content = b"Duplicate detection test content."
    files = [("files", ("dup.txt", content, "text/plain"))]

    # First upload succeeds
    resp1 = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert resp1.status_code == 202
    assert len(resp1.json()["uploaded"]) == 1

    # Second upload with same file is rejected as duplicate
    files2 = [("files", ("dup.txt", content, "text/plain"))]
    resp2 = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files2,
    )
    assert resp2.status_code == 202
    data2 = resp2.json()
    assert data2["uploaded"] == []
    assert len(data2["rejected"]) == 1
    assert data2["rejected"][0]["error_code"] == "document.duplicate"


async def test_upload_same_filename_different_content_allowed(async_client, project_id):
    """DOC-05: Same filename but different content (different checksum) is allowed."""
    files_a = [("files", ("shared.txt", b"Content version A.", "text/plain"))]
    files_b = [("files", ("shared.txt", b"Content version B -- different.", "text/plain"))]

    resp_a = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files_a,
    )
    assert len(resp_a.json()["uploaded"]) == 1

    resp_b = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files_b,
    )
    assert len(resp_b.json()["uploaded"]) == 1
    assert resp_b.json()["rejected"] == []


# ---------------------------------------------------------------------------
# DOC-02: List documents with status
# ---------------------------------------------------------------------------


async def test_list_documents_empty(async_client, project_id):
    """DOC-02: Listing documents for a project with no uploads returns empty."""
    response = await async_client.get(
        f"/api/v1/projects/{project_id}/documents",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["has_more"] is False


async def test_list_documents_with_data(async_client, project_id):
    """DOC-02: Listing documents returns uploaded items with status and metadata."""
    # Upload 2 files
    files = [
        ("files", ("list1.txt", b"List test content one.", "text/plain")),
        ("files", ("list2.txt", b"List test content two.", "text/plain")),
    ]
    await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )

    response = await async_client.get(
        f"/api/v1/projects/{project_id}/documents",
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2

    for item in data["items"]:
        assert "id" in item
        assert "filename" in item
        assert "status" in item
        assert "file_type" in item
        assert "file_size" in item
        assert "checksum" in item
        assert "created_at" in item


async def test_list_documents_pagination(async_client, project_id):
    """DOC-02: Cursor-based pagination works for document listing."""
    # Upload 3 files
    for i in range(3):
        files = [("files", (f"page{i}.txt", f"Page content {i}".encode(), "text/plain"))]
        await async_client.post(
            f"/api/v1/projects/{project_id}/documents",
            files=files,
        )

    # Request first page with limit=2
    resp1 = await async_client.get(
        f"/api/v1/projects/{project_id}/documents?limit=2",
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert len(data1["items"]) == 2
    assert data1["has_more"] is True
    assert data1["next_cursor"] is not None

    # Request second page using cursor
    resp2 = await async_client.get(
        f"/api/v1/projects/{project_id}/documents?cursor={data1['next_cursor']}&limit=2",
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert len(data2["items"]) == 1
    assert data2["has_more"] is False


# ---------------------------------------------------------------------------
# DOC-07: Document metadata
# ---------------------------------------------------------------------------


async def test_document_metadata(async_client, project_id):
    """DOC-07: GET document returns full metadata including all required fields."""
    content = b"Metadata test document content."
    files = [("files", ("meta.txt", content, "text/plain"))]
    upload_resp = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    doc_id = upload_resp.json()["uploaded"][0]["id"]

    response = await async_client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
    )
    assert response.status_code == 200
    doc = response.json()

    # All required metadata fields
    assert doc["filename"] == "meta.txt"
    assert doc["original_filename"] == "meta.txt"
    assert doc["file_type"] == "txt"
    assert doc["file_size"] == len(content)
    assert len(doc["checksum"]) == 64
    # chunk_count may be 0 (if background parsing hasn't run yet) or >= 1
    # (if background parsing completed by the time we GET the document)
    assert isinstance(doc["chunk_count"], int)
    assert doc["chunk_count"] >= 0
    assert doc["status"] in ("uploaded", "parsing", "parsed")
    assert "created_at" in doc
    assert "updated_at" in doc
    assert doc["project_id"] == str(project_id)


# ---------------------------------------------------------------------------
# DOC-03: Delete document
# ---------------------------------------------------------------------------


async def test_delete_document(async_client, project_id):
    """DOC-03: Delete document returns 204 and subsequent GET returns 404."""
    content = b"Document to be deleted."
    files = [("files", ("delete_me.txt", content, "text/plain"))]
    upload_resp = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    doc_id = upload_resp.json()["uploaded"][0]["id"]

    # Delete
    delete_resp = await async_client.delete(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
    )
    assert delete_resp.status_code == 204

    # Confirm deleted
    get_resp = await async_client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
    )
    assert get_resp.status_code == 404


async def test_delete_nonexistent_document(async_client, project_id):
    """DOC-03: Deleting nonexistent document returns 404."""
    fake_id = str(uuid4())
    response = await async_client.delete(
        f"/api/v1/projects/{project_id}/documents/{fake_id}",
    )
    assert response.status_code == 404
    assert "not_found" in response.json()["error_code"]


# ---------------------------------------------------------------------------
# DOC-06: Failed document diagnostics
# ---------------------------------------------------------------------------


async def test_failed_document_has_error_detail(async_client, project_id):
    """DOC-06: Uploading a corrupt PDF triggers failed status with error_detail.

    Upload a file with .pdf extension containing invalid content.
    Background parsing will fail, updating status to 'failed' with
    error_detail containing stage and message.
    """
    corrupt_pdf = b"this is definitely not a valid PDF document"
    files = [("files", ("corrupt.pdf", corrupt_pdf, "application/pdf"))]

    upload_resp = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert upload_resp.status_code == 202
    doc_id = upload_resp.json()["uploaded"][0]["id"]

    # Wait for background parsing to complete (it runs in-process in tests)
    # Poll with short intervals to give the background task time to execute
    doc = None
    for _ in range(20):
        await asyncio.sleep(0.1)
        resp = await async_client.get(
            f"/api/v1/projects/{project_id}/documents/{doc_id}",
        )
        doc = resp.json()
        if doc["status"] != "uploaded" and doc["status"] != "parsing":
            break

    assert doc is not None
    assert doc["status"] == "failed"
    assert doc["error_detail"] is not None
    assert doc["error_detail"]["stage"] == "parsing"
    assert "message" in doc["error_detail"]


# ---------------------------------------------------------------------------
# SEC-03: Filename sanitization
# ---------------------------------------------------------------------------


async def test_upload_sanitizes_filename(async_client, project_id):
    """SEC-03: Filenames with path traversal attempts are sanitized."""
    content = b"Path traversal test content."
    files = [("files", ("../../etc/passwd.txt", content, "text/plain"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202
    doc = response.json()["uploaded"][0]

    # Sanitized filename should not contain path components
    assert "/" not in doc["filename"]
    assert ".." not in doc["filename"]
    # Original filename is preserved
    assert doc["original_filename"] == "../../etc/passwd.txt"


# ---------------------------------------------------------------------------
# SEC-04: Path traversal prevention
# ---------------------------------------------------------------------------


async def test_path_traversal_filename_stored_safely(async_client, project_id):
    """SEC-04: File with path traversal in name is stored with sanitized name."""
    content = b"Security test -- path traversal in filename."
    files = [("files", ("../../../tmp/evil.txt", content, "text/plain"))]

    response = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    assert response.status_code == 202

    # Should succeed with sanitized filename
    if response.json()["uploaded"]:
        doc = response.json()["uploaded"][0]
        assert "/" not in doc["filename"]
        assert "\\" not in doc["filename"]
        assert ".." not in doc["filename"]
    else:
        # If rejected due to path_traversal, that's also valid security behavior
        rejected = response.json()["rejected"][0]
        assert rejected["error_code"] in ("document.path_traversal", "document.invalid_type")


# ---------------------------------------------------------------------------
# Non-existent project
# ---------------------------------------------------------------------------


async def test_upload_to_nonexistent_project(async_client):
    """Upload to a non-existent project returns 404."""
    fake_project_id = str(uuid4())
    files = [("files", ("orphan.txt", b"No project.", "text/plain"))]

    response = await async_client.post(
        f"/api/v1/projects/{fake_project_id}/documents",
        files=files,
    )
    assert response.status_code == 404


async def test_get_document_from_wrong_project(async_client, project_id):
    """Getting a document using wrong project ID returns 404."""
    # Upload to the real project
    content = b"Cross-project access test."
    files = [("files", ("cross.txt", content, "text/plain"))]
    upload_resp = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    doc_id = upload_resp.json()["uploaded"][0]["id"]

    # Try to access via a different (non-existent) project
    fake_project_id = str(uuid4())
    response = await async_client.get(
        f"/api/v1/projects/{fake_project_id}/documents/{doc_id}",
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Background parsing produces chunks (DOC-06 positive path)
# ---------------------------------------------------------------------------


async def test_background_parsing_creates_chunks(async_client, project_id):
    """DOC-06: Successful background parsing updates status to parsed with chunk_count."""
    content = b"This is a small text document for parsing.\n\nIt has two paragraphs."
    files = [("files", ("parse_me.txt", content, "text/plain"))]

    upload_resp = await async_client.post(
        f"/api/v1/projects/{project_id}/documents",
        files=files,
    )
    doc_id = upload_resp.json()["uploaded"][0]["id"]

    # Wait for background parsing
    doc = None
    for _ in range(20):
        await asyncio.sleep(0.1)
        resp = await async_client.get(
            f"/api/v1/projects/{project_id}/documents/{doc_id}",
        )
        doc = resp.json()
        if doc["status"] not in ("uploaded", "parsing"):
            break

    assert doc is not None
    assert doc["status"] == "parsed"
    assert doc["chunk_count"] >= 1
