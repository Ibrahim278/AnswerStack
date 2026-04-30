from abc import ABC, abstractmethod
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import ChatMessage, ChatSession


class ChatRepository(ABC):
    """Port for chat session and message persistence."""

    @abstractmethod
    async def create_session(self, project_id: UUID, title: str) -> ChatSession: ...

    @abstractmethod
    async def get_session(self, session_id: UUID) -> ChatSession | None: ...

    @abstractmethod
    async def get_session_with_messages(self, session_id: UUID) -> ChatSession | None: ...

    @abstractmethod
    async def list_sessions(self, project_id: UUID) -> list[ChatSession]: ...

    @abstractmethod
    async def rename_session(self, session_id: UUID, title: str) -> ChatSession | None: ...

    @abstractmethod
    async def clear_session(self, session_id: UUID) -> bool: ...

    @abstractmethod
    async def delete_session(self, session_id: UUID) -> bool: ...

    @abstractmethod
    async def add_message(
        self,
        session_id: UUID,
        role: str,
        content: str,
        sources_json: list | dict | None = None,
    ) -> ChatMessage: ...

    @abstractmethod
    async def delete_last_assistant_message(self, session_id: UUID) -> bool: ...

    @abstractmethod
    async def get_recent_messages(self, session_id: UUID, limit: int = 10) -> list[ChatMessage]: ...


class SQLAlchemyChatRepository(ChatRepository):
    """SQLAlchemy-backed chat repository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_session(self, project_id: UUID, title: str) -> ChatSession:
        chat_session = ChatSession(project_id=project_id, title=title)
        self._session.add(chat_session)
        await self._session.flush()
        await self._session.refresh(chat_session)
        return chat_session

    async def get_session(self, session_id: UUID) -> ChatSession | None:
        result = await self._session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_session_with_messages(self, session_id: UUID) -> ChatSession | None:
        result = await self._session.execute(
            select(ChatSession)
            .where(ChatSession.id == session_id)
            .options(selectinload(ChatSession.messages))
        )
        return result.scalar_one_or_none()

    async def list_sessions(self, project_id: UUID) -> list[ChatSession]:
        result = await self._session.execute(
            select(ChatSession)
            .where(ChatSession.project_id == project_id)
            .order_by(ChatSession.updated_at.desc())
        )
        return list(result.scalars().all())

    async def rename_session(self, session_id: UUID, title: str) -> ChatSession | None:
        session = await self.get_session(session_id)
        if session is None:
            return None
        session.title = title
        session.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        await self._session.refresh(session)
        return session

    async def clear_session(self, session_id: UUID) -> bool:
        session = await self.get_session(session_id)
        if session is None:
            return False
        await self._session.execute(
            sa_delete(ChatMessage).where(ChatMessage.session_id == session_id)
        )
        session.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        return True

    async def delete_session(self, session_id: UUID) -> bool:
        session = await self.get_session(session_id)
        if session is None:
            return False
        await self._session.delete(session)
        await self._session.flush()
        return True

    async def add_message(
        self,
        session_id: UUID,
        role: str,
        content: str,
        sources_json: list | dict | None = None,
    ) -> ChatMessage:
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            sources_json=sources_json,
        )
        self._session.add(message)
        await self._session.flush()
        await self._session.refresh(message)
        # Update session's updated_at timestamp
        result = await self._session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            session.updated_at = datetime.now(timezone.utc)
            await self._session.flush()
        return message

    async def delete_last_assistant_message(self, session_id: UUID) -> bool:
        """Delete the most recent assistant message in a session (for retry)."""
        result = await self._session.execute(
            select(ChatMessage)
            .where(
                ChatMessage.session_id == session_id,
                ChatMessage.role == "assistant",
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        msg = result.scalar_one_or_none()
        if msg is None:
            return False
        await self._session.delete(msg)
        await self._session.flush()
        return True

    async def get_recent_messages(self, session_id: UUID, limit: int = 10) -> list[ChatMessage]:
        result = await self._session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
        messages = list(result.scalars().all())
        # Reverse to chronological order
        messages.reverse()
        return messages
