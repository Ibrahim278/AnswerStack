"""Chat API endpoints: session CRUD and SSE streaming."""

import inspect
import json
import re
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
from answerstack.retrieval import RetrievalService

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

                # On retry: remove previous assistant response instead of adding a duplicate user message
                if body.retry and body.session_id:
                    await chat_service.delete_last_assistant_message(session.id)
                else:
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

                # Skip retrieval for short conversational follow-ups
                # when there's already conversation history
                _q = body.question.strip().rstrip("?!.,")
                _is_followup = (
                    len(history) > 1
                    and _q.lower() in {
                        "ok", "okay", "yes", "no", "thanks", "thank you",
                        "got it", "sure", "right", "is that right",
                        "is that correct", "go on", "continue",
                        "can you elaborate", "tell me more",
                        "what else", "anything else",
                    }
                )

                # retrieval_start event (D-88, D-89)
                event_seq += 1
                yield {
                    "event": "retrieval_start",
                    "id": str(event_seq),
                    "data": json.dumps({}),
                }

                if _is_followup:
                    # Use empty chunks -- LLM will answer from conversation history
                    chunks: list = []
                else:
                    # Retrieve relevant chunks (RETR-01)
                    retrieval_service = RetrievalService(
                        vector_repo, embedding_service, ranker
                    )
                    chunks = await retrieval_service.retrieve(
                        collection_name=f"project_{project_id}",
                        query=body.question,
                        embedding_model=settings.embedding_model,
                        top_k=settings.top_k,
                        similarity_threshold=settings.similarity_threshold,
                        reranker_enabled=settings.reranker_enabled,
                    )

                if await request.is_disconnected():
                    return

                # No-context handling (CHAT-08)
                # Skip canned response for follow-ups -- let LLM use conversation history
                if not chunks and not _is_followup:
                    # retrieval_start already emitted above; emit sources
                    # immediately so frontend gets consistent sequence
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
                if source_context:
                    system_prompt = (
                        settings.system_prompt
                        + "\n\n"
                        "INSTRUCTIONS:\n"
                        "- ONLY answer using information from the CONTEXT section below. "
                        "NEVER use your training data or prior knowledge.\n"
                        "- Every factual claim MUST include a citation like [Source 1], [Source 2].\n"
                        "- If the context does not contain enough information to answer, "
                        "say exactly: \"I don't have enough information in the provided sources "
                        "to answer this question.\" Do NOT attempt to answer from memory.\n"
                        "- Be concise and accurate.\n\n"
                        "CONTEXT:\n" + source_context
                    )
                else:
                    # Follow-up with no new retrieval -- rely on conversation history
                    system_prompt = (
                        settings.system_prompt
                        + "\n\n"
                        "INSTRUCTIONS:\n"
                        "- Answer based on the conversation history above.\n"
                        "- If you previously cited sources, you may reference them.\n"
                        "- Be concise and accurate.\n"
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
                        "relevance_score": round(float(c.relevance_score), 4),
                    }
                    for c in chunks
                ]
                event_seq += 1
                yield {
                    "event": "sources",
                    "id": str(event_seq),
                    "data": json.dumps(sources_payload),
                }

                if await request.is_disconnected():
                    return

                # Stream LLM response
                client = provider_service._client
                create_kwargs: dict = {
                    "model": settings.provider_model,
                    "messages": messages,
                    "temperature": settings.temperature,
                    "stream": True,
                }
                if settings.reasoning_effort:
                    create_kwargs["extra_body"] = {
                        "reasoning": {"effort": settings.reasoning_effort}
                    }
                if settings.max_completion_tokens is not None:
                    create_kwargs["max_completion_tokens"] = settings.max_completion_tokens
                stream = await client.chat.completions.create(**create_kwargs)

                full_response = ""
                token_count = 0
                async for chunk in stream:
                    if await request.is_disconnected():
                        close_stream = getattr(stream, "close", None)
                        if close_stream is not None:
                            close_result = close_stream()
                            if inspect.isawaitable(close_result):
                                await close_result
                        return
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

                # Only keep sources the LLM actually cited
                cited_nums = set(
                    int(m) for m in re.findall(r'Source\s+(\d+)', full_response)
                )
                effective_sources = [
                    s for i, s in enumerate(sources_payload, start=1)
                    if i in cited_nums
                ]

                # Save complete assistant message with sources
                await chat_service.add_message(
                    session.id,
                    "assistant",
                    full_response,
                    sources_json=effective_sources,
                )
                await db_session.commit()

                # message_complete event (includes cited sources for frontend update)
                event_seq += 1
                yield {
                    "event": "message_complete",
                    "id": str(event_seq),
                    "data": json.dumps({
                        "token_count": token_count,
                        "sources": effective_sources,
                    }),
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
