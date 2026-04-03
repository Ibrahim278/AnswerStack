"""Integration tests for chat API endpoints and SSE streaming.

Covers CHAT-04 (session CRUD), SSE-01 (typed events), SSE-02 (heartbeat),
SSE-03 (event IDs), SSE-04 (message_id in message_start), CHAT-08 (no-context).
"""

import json
from uuid import UUID

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_sse_events(body: str) -> list[dict]:
    """Parse SSE text into a list of event dicts.

    Each event has keys: event, id, data (all optional).
    Events are separated by blank lines.
    """
    events = []
    current: dict = {}

    for line in body.split("\n"):
        line = line.rstrip("\r")

        if line == "":
            # Blank line = event boundary
            if current:
                events.append(current)
                current = {}
            continue

        if line.startswith(":"):
            # Comment / heartbeat ping -- skip
            continue

        if ":" in line:
            field, _, value = line.partition(":")
            # Strip leading space from value (per SSE spec)
            if value.startswith(" "):
                value = value[1:]
            current[field] = value

    # Catch trailing event without final blank line
    if current:
        events.append(current)

    return events


async def create_project(client: AsyncClient) -> str:
    """Helper to create a project and return its ID."""
    resp = await client.post("/api/v1/projects", json={"name": "Chat Test Project"})
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# CHAT-04: Session CRUD
# ---------------------------------------------------------------------------


class TestChatSessionCRUD:
    """Session create, list, get-detail, rename, clear, delete."""

    async def test_create_session(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "id" in body
        assert body["project_id"] == project_id
        assert body["title"] == "New Chat"  # default title

    async def test_create_session_with_title(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={"title": "My Custom Session"},
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == "My Custom Session"

    async def test_list_sessions(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        # Create 2 sessions
        await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={"title": "Session A"},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={"title": "Session B"},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/chat/sessions")
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) == 2

    async def test_get_session_detail(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        # Create session
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={"title": "Detail Test"},
        )
        session_id = resp.json()["id"]

        # Get detail
        resp = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == session_id
        assert body["title"] == "Detail Test"
        assert "messages" in body
        assert isinstance(body["messages"], list)

    async def test_rename_session(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions", json={}
        )
        session_id = resp.json()["id"]

        resp = await client.put(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}",
            json={"title": "Renamed Session"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Renamed Session"

    async def test_clear_session(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions", json={}
        )
        session_id = resp.json()["id"]

        # Clear
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}/clear"
        )
        assert resp.status_code == 204

        # Verify messages empty
        resp = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        assert resp.status_code == 200
        assert resp.json()["messages"] == []

    async def test_delete_session(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions", json={}
        )
        session_id = resp.json()["id"]

        # Delete
        resp = await client.delete(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        assert resp.status_code == 204

        # Verify gone
        resp = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        assert resp.status_code == 404

    async def test_session_not_found(self, async_client_with_chat):
        client = async_client_with_chat
        project_id = await create_project(client)
        fake_id = "00000000-0000-0000-0000-000000000099"

        resp = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{fake_id}"
        )
        assert resp.status_code == 404

        resp = await client.put(
            f"/api/v1/projects/{project_id}/chat/sessions/{fake_id}",
            json={"title": "Nope"},
        )
        assert resp.status_code == 404

        resp = await client.delete(
            f"/api/v1/projects/{project_id}/chat/sessions/{fake_id}"
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# SSE Streaming tests
# ---------------------------------------------------------------------------


class TestSSEStreaming:
    """Tests for the SSE streaming endpoint."""

    async def test_sse_typed_events(self, async_client_with_chat):
        """SSE-01: Verify typed events in order: message_start, sources, token(s), message_complete, done."""
        client = async_client_with_chat
        project_id = await create_project(client)

        # Configure settings with embedding model
        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "What is the capital of France?"},
        )
        assert resp.status_code == 200

        events = parse_sse_events(resp.text)

        # Extract event types (ignoring pings/comments)
        event_types = [e.get("event") for e in events if "event" in e]

        assert event_types[0] == "message_start"
        assert "sources" in event_types
        assert "token" in event_types
        assert "message_complete" in event_types
        assert event_types[-1] == "done"

        # Verify order: message_start before sources before tokens before message_complete
        idx_start = event_types.index("message_start")
        idx_sources = event_types.index("sources")
        idx_token = event_types.index("token")
        idx_complete = event_types.index("message_complete")
        idx_done = event_types.index("done")

        assert idx_start < idx_sources < idx_token < idx_complete < idx_done

    async def test_sse_message_start_has_ids(self, async_client_with_chat):
        """SSE-04: message_start contains session_id and message_id UUIDs."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Test question"},
        )
        assert resp.status_code == 200

        events = parse_sse_events(resp.text)
        message_start_events = [e for e in events if e.get("event") == "message_start"]
        assert len(message_start_events) >= 1

        data = json.loads(message_start_events[0]["data"])
        assert "session_id" in data
        assert "message_id" in data

        # Validate both are valid UUIDs
        UUID(data["session_id"])
        UUID(data["message_id"])

    async def test_sse_events_have_ids(self, async_client_with_chat):
        """SSE-03: All events have monotonically increasing numeric IDs."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "ID test"},
        )
        assert resp.status_code == 200

        events = parse_sse_events(resp.text)
        ids = [int(e["id"]) for e in events if "id" in e]

        assert len(ids) >= 3  # At least message_start, sources/token, done
        # Verify monotonically increasing
        for i in range(1, len(ids)):
            assert ids[i] > ids[i - 1], f"IDs not monotonic: {ids}"

    async def test_no_context_response(self, async_client_with_chat, mock_vector_repo):
        """CHAT-08: No-context response when retrieval returns empty."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        # Override vector_repo to return empty
        mock_vector_repo.query = lambda *args, **kwargs: {
            "ids": [],
            "documents": [],
            "metadatas": [],
            "distances": [],
        }

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Something with no context"},
        )
        assert resp.status_code == 200

        events = parse_sse_events(resp.text)

        # Find token events -- should contain no-context message
        token_events = [e for e in events if e.get("event") == "token"]
        assert len(token_events) >= 1
        token_text = "".join(e.get("data", "") for e in token_events)
        assert "don't have enough information" in token_text

        # Sources should be empty array
        sources_events = [e for e in events if e.get("event") == "sources"]
        assert len(sources_events) >= 1
        sources_data = json.loads(sources_events[0]["data"])
        assert sources_data == []

        # Should still have done event
        done_events = [e for e in events if e.get("event") == "done"]
        assert len(done_events) >= 1

    async def test_sse_with_existing_session(self, async_client_with_chat):
        """Stream chat with an existing session_id resumes conversation."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        # Create a session first
        session_resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={"title": "Existing Session"},
        )
        session_id = session_resp.json()["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Follow-up question", "session_id": session_id},
        )
        assert resp.status_code == 200

        events = parse_sse_events(resp.text)
        message_start = [e for e in events if e.get("event") == "message_start"]
        assert len(message_start) >= 1
        data = json.loads(message_start[0]["data"])
        assert data["session_id"] == session_id

    async def test_retry_replaces_assistant_message(self, async_client_with_chat):
        """Retry flag should not create a duplicate user message and should replace the last assistant response."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        # Send initial message (creates session + user msg + assistant msg)
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "What is X?"},
        )
        assert resp.status_code == 200
        events = parse_sse_events(resp.text)
        start_data = json.loads(
            [e for e in events if e.get("event") == "message_start"][0]["data"]
        )
        session_id = start_data["session_id"]

        # Check initial message count
        detail = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        initial_msgs = detail.json()["messages"]
        assert len(initial_msgs) == 2  # 1 user + 1 assistant
        assert initial_msgs[0]["role"] == "user"
        assert initial_msgs[1]["role"] == "assistant"

        # Retry the same question
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "What is X?", "session_id": session_id, "retry": True},
        )
        assert resp.status_code == 200

        # Check message count hasn't grown: still 1 user + 1 assistant
        detail = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        retry_msgs = detail.json()["messages"]
        assert len(retry_msgs) == 2
        assert retry_msgs[0]["role"] == "user"
        assert retry_msgs[0]["content"] == "What is X?"
        assert retry_msgs[1]["role"] == "assistant"
        # The assistant message ID should be different (new response)
        assert retry_msgs[1]["id"] != initial_msgs[1]["id"]

    async def test_retry_without_session_id_is_normal_send(self, async_client_with_chat):
        """Retry flag without session_id should behave like a normal message (creates new session)."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Hello", "retry": True},
        )
        assert resp.status_code == 200
        events = parse_sse_events(resp.text)
        start_data = json.loads(
            [e for e in events if e.get("event") == "message_start"][0]["data"]
        )
        session_id = start_data["session_id"]

        # Should have created a normal user + assistant message pair
        detail = await client.get(
            f"/api/v1/projects/{project_id}/chat/sessions/{session_id}"
        )
        msgs = detail.json()["messages"]
        assert len(msgs) == 2
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant"

    async def test_retry_with_no_prior_assistant_message(self, async_client_with_chat):
        """Retry on a session with no assistant messages should still work (edge case)."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={"embedding_model": "text-embedding-test", "provider_model": "test-model"},
        )

        # Create a session manually (no messages)
        session_resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/sessions",
            json={"title": "Empty Session"},
        )
        session_id = session_resp.json()["id"]

        # Retry on empty session — should not crash, just proceed without deleting
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Retry on empty", "session_id": session_id, "retry": True},
        )
        assert resp.status_code == 200
        events = parse_sse_events(resp.text)
        event_types = [e.get("event") for e in events if "event" in e]
        assert "message_start" in event_types
        assert "done" in event_types


# ---------------------------------------------------------------------------
# Reasoning effort in LLM calls
# ---------------------------------------------------------------------------


class TestReasoningEffort:
    """Tests for reasoning_effort parameter being passed to the LLM."""

    async def test_reasoning_effort_passed_when_set(self, async_client_with_chat, mock_openai_client):
        """When reasoning_effort is configured, it is forwarded to client.chat.completions.create."""
        client = async_client_with_chat
        project_id = await create_project(client)

        # Configure settings with reasoning_effort
        await client.put(
            "/api/v1/settings",
            json={
                "embedding_model": "text-embedding-test",
                "provider_model": "test-model",
                "reasoning_effort": "high",
            },
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "What is the capital of France?"},
        )
        assert resp.status_code == 200

        # Verify the mock was called with reasoning_effort
        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("reasoning_effort") == "high"

    async def test_reasoning_effort_omitted_when_empty(self, async_client_with_chat, mock_openai_client):
        """When reasoning_effort is empty (default), it is NOT passed to the LLM call."""
        client = async_client_with_chat
        project_id = await create_project(client)

        # Configure settings WITHOUT reasoning_effort (default empty string)
        await client.put(
            "/api/v1/settings",
            json={
                "embedding_model": "text-embedding-test",
                "provider_model": "test-model",
            },
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "What is the capital of France?"},
        )
        assert resp.status_code == 200

        # Verify reasoning_effort was NOT included in the call
        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert "reasoning_effort" not in call_kwargs

    async def test_reasoning_effort_low_value(self, async_client_with_chat, mock_openai_client):
        """reasoning_effort='low' is correctly forwarded to the LLM."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={
                "embedding_model": "text-embedding-test",
                "provider_model": "test-model",
                "reasoning_effort": "low",
            },
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Test?"},
        )
        assert resp.status_code == 200

        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("reasoning_effort") == "low"

    async def test_reasoning_effort_medium_value(self, async_client_with_chat, mock_openai_client):
        """reasoning_effort='medium' is correctly forwarded to the LLM."""
        client = async_client_with_chat
        project_id = await create_project(client)

        await client.put(
            "/api/v1/settings",
            json={
                "embedding_model": "text-embedding-test",
                "provider_model": "test-model",
                "reasoning_effort": "medium",
            },
        )

        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Test?"},
        )
        assert resp.status_code == 200

        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("reasoning_effort") == "medium"

    async def test_clearing_reasoning_effort_removes_from_llm_call(self, async_client_with_chat, mock_openai_client):
        """Setting reasoning_effort then clearing it removes it from LLM calls."""
        client = async_client_with_chat
        project_id = await create_project(client)

        # Set reasoning_effort first
        await client.put(
            "/api/v1/settings",
            json={
                "embedding_model": "text-embedding-test",
                "provider_model": "test-model",
                "reasoning_effort": "high",
            },
        )

        # Send a message with reasoning_effort set
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "First question"},
        )
        assert resp.status_code == 200
        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("reasoning_effort") == "high"

        # Clear reasoning_effort
        await client.put(
            "/api/v1/settings",
            json={"reasoning_effort": ""},
        )

        # Send another message - reasoning_effort should NOT be present
        resp = await client.post(
            f"/api/v1/projects/{project_id}/chat/stream",
            json={"question": "Second question"},
        )
        assert resp.status_code == 200
        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert "reasoning_effort" not in call_kwargs
