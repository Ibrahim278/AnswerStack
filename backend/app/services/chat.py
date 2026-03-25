"""Chat service: session CRUD and message persistence."""

from __future__ import annotations

from uuid import UUID

import structlog

from app.core.errors import NotFoundError
from app.models.chat import ChatMessage, ChatSession
from app.repositories.chat import ChatRepository

logger = structlog.get_logger()


class ChatService:
    """Business logic for chat sessions and messages.

    Delegates all persistence to ChatRepository.
    No SQLAlchemy imports -- hexagonal boundary enforced.
    """

    def __init__(self, repo: ChatRepository) -> None:
        self._repo = repo

    async def create_session(
        self, project_id: UUID, title: str | None = None
    ) -> ChatSession:
        """Create a new chat session. Uses 'New Chat' as default title."""
        effective_title = title if title else "New Chat"
        return await self._repo.create_session(project_id, effective_title)

    async def get_session(self, session_id: UUID) -> ChatSession:
        """Get a session by ID. Raises NotFoundError if not found."""
        session = await self._repo.get_session(session_id)
        if session is None:
            raise NotFoundError("chat_session", str(session_id))
        return session

    async def get_session_with_messages(self, session_id: UUID) -> ChatSession:
        """Get a session with messages eagerly loaded. Raises NotFoundError if not found."""
        session = await self._repo.get_session_with_messages(session_id)
        if session is None:
            raise NotFoundError("chat_session", str(session_id))
        return session

    async def list_sessions(self, project_id: UUID) -> list[ChatSession]:
        """Return sessions for a project, ordered by updated_at desc."""
        return await self._repo.list_sessions(project_id)

    async def rename_session(self, session_id: UUID, title: str) -> ChatSession:
        """Rename a session. Raises NotFoundError if not found."""
        session = await self._repo.rename_session(session_id, title)
        if session is None:
            raise NotFoundError("chat_session", str(session_id))
        return session

    async def clear_session(self, session_id: UUID) -> None:
        """Clear all messages from a session. Raises NotFoundError if not found."""
        success = await self._repo.clear_session(session_id)
        if not success:
            raise NotFoundError("chat_session", str(session_id))

    async def delete_session(self, session_id: UUID) -> None:
        """Delete a session. Raises NotFoundError if not found."""
        success = await self._repo.delete_session(session_id)
        if not success:
            raise NotFoundError("chat_session", str(session_id))

    async def add_message(
        self,
        session_id: UUID,
        role: str,
        content: str,
        sources_json: dict | None = None,
    ) -> ChatMessage:
        """Add a message to a session. Returns the created message."""
        return await self._repo.add_message(session_id, role, content, sources_json)

    async def get_conversation_history(
        self, session_id: UUID, limit: int = 10
    ) -> list[dict]:
        """Get recent messages formatted for OpenAI messages array.

        Returns a list of {"role": ..., "content": ...} dicts in chronological order.
        """
        messages = await self._repo.get_recent_messages(session_id, limit)
        return [{"role": msg.role, "content": msg.content} for msg in messages]

    async def auto_title_session(
        self, session_id: UUID, first_message: str
    ) -> None:
        """Auto-title a session based on the first message.

        Truncates to 50 characters with '...' suffix if needed.
        """
        if len(first_message) > 50:
            title = first_message[:50] + "..."
        else:
            title = first_message
        await self._repo.rename_session(session_id, title)
