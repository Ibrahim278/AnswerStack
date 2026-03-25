"""Chat API endpoints: session CRUD and SSE streaming."""

import json
import uuid
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Request, Response
from sse_starlette.sse import EventSourceResponse

from app.core.dependencies import get_chat_service
from app.core.errors import ProviderError
from app.repositories.chat import SQLAlchemyChatRepository
from app.repositories.settings import SQLAlchemySettingsRepository
from app.schemas.chat import (
    ChatRequest,
    ChatSessionCreate,
    ChatSessionDetailResponse,
    ChatSessionRename,
    ChatSessionResponse,
)
from app.services.chat import ChatService
from app.services.retrieval import RetrievalService

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}", tags=["chat"])


# ---------------------------------------------------------------------------
# Session CRUD (CHAT-04)
# ---------------------------------------------------------------------------


@router.post("/chat/sessions", status_code=201, response_model=ChatSessionResponse)
async def create_session(
    project_id: UUID,
    body: ChatSessionCreate,
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatSessionResponse:
    """Create a new chat session for a project."""
    session = await chat_service.create_session(project_id, body.title)
    return ChatSessionResponse.model_validate(session)


@router.get("/chat/sessions", response_model=list[ChatSessionResponse])
async def list_sessions(
    project_id: UUID,
    chat_service: ChatService = Depends(get_chat_service),
) -> list[ChatSessionResponse]:
    """List all chat sessions for a project, ordered by most recently updated."""
    sessions = await chat_service.list_sessions(project_id)
    return [ChatSessionResponse.model_validate(s) for s in sessions]


@router.get(
    "/chat/sessions/{session_id}", response_model=ChatSessionDetailResponse
)
async def get_session_detail(
    project_id: UUID,
    session_id: UUID,
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatSessionDetailResponse:
    """Get a chat session with its messages."""
    session = await chat_service.get_session_with_messages(
        session_id, project_id=project_id
    )
    return ChatSessionDetailResponse.model_validate(session)


@router.put(
    "/chat/sessions/{session_id}", response_model=ChatSessionResponse
)
async def rename_session(
    project_id: UUID,
    session_id: UUID,
    body: ChatSessionRename,
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatSessionResponse:
    """Rename a chat session."""
    session = await chat_service.rename_session(
        session_id, body.title, project_id=project_id
    )
    return ChatSessionResponse.model_validate(session)


@router.post("/chat/sessions/{session_id}/clear", status_code=204)
async def clear_session(
    project_id: UUID,
    session_id: UUID,
    chat_service: ChatService = Depends(get_chat_service),
) -> Response:
    """Clear all messages from a chat session."""
    await chat_service.clear_session(session_id, project_id=project_id)
    return Response(status_code=204)


@router.delete("/chat/sessions/{session_id}", status_code=204)
async def delete_session(
    project_id: UUID,
    session_id: UUID,
    chat_service: ChatService = Depends(get_chat_service),
) -> Response:
    """Delete a chat session and all its messages."""
    await chat_service.delete_session(session_id, project_id=project_id)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# SSE streaming (SSE-01, SSE-02, SSE-03, SSE-04, RETR-01, CHAT-08)
# ---------------------------------------------------------------------------


@router.post("/chat/stream")
async def stream_chat(
    project_id: UUID,
    body: ChatRequest,
    request: Request,
):
    """Stream a chat answer via Server-Sent Events.

    Uses typed events: message_start, token, sources, message_complete, error, done.
    Heartbeat ping every 15 seconds via sse-starlette.
    Supports Last-Event-ID for reconnection.
    """
    # Access singletons from app.state
    session_factory = request.app.state.session_factory
    provider_service = request.app.state.provider_service
    vector_repo = request.app.state.vector_repo
    embedding_service = request.app.state.embedding_service
    ranker = getattr(request.app.state, "ranker", None)

    if not provider_service.is_configured:
        raise ProviderError(
            "Provider not configured. Configure a provider in Settings before chatting."
        )

    last_event_id = request.headers.get("Last-Event-ID")

    async def event_generator():
        event_seq = int(last_event_id) if last_event_id else 0

        try:
            # Create own session (Pitfall 6 -- SSE lifecycle outlives request)
            async with session_factory() as db_session:
                chat_repo = SQLAlchemyChatRepository(db_session)
                chat_service = ChatService(chat_repo)
                settings_repo = SQLAlchemySettingsRepository(db_session)
                settings = await settings_repo.get()

                # Create or resume session
                if body.session_id:
                    session = await chat_service.get_session(
                        body.session_id, project_id=project_id
                    )
                else:
                    session = await chat_service.create_session(project_id)

                # Save user message
                await chat_service.add_message(session.id, "user", body.question)
                await db_session.commit()

                # Auto-title on first message
                history = await chat_service.get_conversation_history(
                    session.id, limit=10
                )
                if len(history) <= 1:
                    await chat_service.auto_title_session(
                        session.id, body.question
                    )
                    await db_session.commit()

                # Generate assistant message ID upfront (SSE-04)
                assistant_message_id = str(uuid.uuid4())

                # message_start event (SSE-01, SSE-04)
                event_seq += 1
                yield {
                    "event": "message_start",
                    "id": str(event_seq),
                    "data": json.dumps(
                        {
                            "session_id": str(session.id),
                            "message_id": assistant_message_id,
                        }
                    ),
                }

                # Retrieve relevant chunks (RETR-01)
                retrieval_service = RetrievalService(
                    vector_repo, embedding_service, ranker
                )
                chunks = await retrieval_service.retrieve(
                    project_id=project_id,
                    query=body.question,
                    embedding_model=settings.embedding_model,
                    top_k=settings.top_k,
                    similarity_threshold=settings.similarity_threshold,
                    reranker_enabled=settings.reranker_enabled,
                )

                # No-context handling (CHAT-08)
                if not chunks:
                    no_answer = (
                        "I don't have enough information in the provided sources "
                        "to answer this question. Please ensure the project has "
                        "relevant documents indexed."
                    )
                    event_seq += 1
                    yield {
                        "event": "token",
                        "id": str(event_seq),
                        "data": no_answer,
                    }

                    # Empty sources
                    event_seq += 1
                    yield {
                        "event": "sources",
                        "id": str(event_seq),
                        "data": json.dumps([]),
                    }

                    # Save assistant message
                    await chat_service.add_message(
                        session.id, "assistant", no_answer, sources_json=[]
                    )
                    await db_session.commit()

                    # message_complete
                    event_seq += 1
                    yield {
                        "event": "message_complete",
                        "id": str(event_seq),
                        "data": json.dumps(
                            {"token_count": len(no_answer.split())}
                        ),
                    }

                    # done
                    event_seq += 1
                    yield {"event": "done", "id": str(event_seq), "data": ""}
                    return

                # Build system prompt with source context
                source_context = RetrievalService.build_source_context(chunks)
                system_prompt = (
                    settings.system_prompt
                    + "\n\n"
                    "INSTRUCTIONS:\n"
                    "- Only answer from the provided context below. "
                    "Do not use prior knowledge.\n"
                    "- If the context does not contain sufficient information, "
                    "say so.\n"
                    "- Cite sources by number, e.g. [Source 1], [Source 2].\n"
                    "- Be concise and accurate.\n\n"
                    "CONTEXT:\n" + source_context
                )

                # Build messages array with conversation history
                messages = [{"role": "system", "content": system_prompt}]
                conv_history = await chat_service.get_conversation_history(
                    session.id, limit=10
                )
                messages.extend(conv_history)

                # Send sources event BEFORE streaming tokens
                sources_payload = [
                    {
                        "document_name": c.document_name,
                        "chunk_text": c.chunk_text[:500],
                        "page_number": c.page_number,
                        "relevance_score": round(c.relevance_score, 4),
                    }
                    for c in chunks
                ]
                event_seq += 1
                yield {
                    "event": "sources",
                    "id": str(event_seq),
                    "data": json.dumps(sources_payload),
                }

                # Stream LLM response
                client = provider_service._client
                stream = await client.chat.completions.create(
                    model=settings.provider_model,
                    messages=messages,
                    temperature=settings.temperature,
                    stream=True,
                )

                full_response = ""
                token_count = 0
                async for chunk in stream:
                    if (
                        chunk.choices
                        and chunk.choices[0].delta.content is not None
                    ):
                        token_text = chunk.choices[0].delta.content
                        full_response += token_text
                        token_count += 1
                        event_seq += 1
                        yield {
                            "event": "token",
                            "id": str(event_seq),
                            "data": token_text,
                        }

                # Save complete assistant message with sources
                await chat_service.add_message(
                    session.id,
                    "assistant",
                    full_response,
                    sources_json=sources_payload,
                )
                await db_session.commit()

                # message_complete event
                event_seq += 1
                yield {
                    "event": "message_complete",
                    "id": str(event_seq),
                    "data": json.dumps({"token_count": token_count}),
                }

                # done event
                event_seq += 1
                yield {"event": "done", "id": str(event_seq), "data": ""}

        except Exception as e:
            logger.exception("SSE stream error", error=str(e))
            event_seq += 1
            yield {
                "event": "error",
                "id": str(event_seq),
                "data": json.dumps(
                    {
                        "code": "stream.error",
                        "message": "An error occurred while generating the response. Please try again.",
                    }
                ),
            }
            event_seq += 1
            yield {"event": "done", "id": str(event_seq), "data": ""}

    return EventSourceResponse(event_generator(), ping=15)
