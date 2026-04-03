"""Unit tests for RAGPipeline query facade."""

import asyncio
from typing import AsyncIterator

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from answerstack.config import RAGConfig
from answerstack.rag_pipeline import RAGPipeline
from answerstack.retrieval import RetrievedChunk
from answerstack.types import (
    CompleteEvent,
    ErrorEvent,
    SourcesEvent,
    TokenEvent,
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _make_sample_chunks(n: int = 2) -> list[RetrievedChunk]:
    """Create n sample RetrievedChunk objects."""
    return [
        RetrievedChunk(
            chunk_id=f"chunk-{i}",
            document_name=f"doc-{i}.txt",
            chunk_text=f"Content of chunk {i}.",
            page_number=i + 1,
            relevance_score=0.9 - i * 0.1,
        )
        for i in range(n)
    ]


class MockStreamChunk:
    """Mimics OpenAI streaming chunk structure."""

    def __init__(self, content: str | None):
        self.choices = [MagicMock()]
        self.choices[0].delta.content = content


class MockAsyncStream:
    """Async iterator that mimics OpenAI streaming response."""

    def __init__(self, tokens: list[str]):
        self._tokens = tokens
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._tokens):
            raise StopAsyncIteration
        chunk = MockStreamChunk(self._tokens[self._index])
        self._index += 1
        return chunk


def _make_pipeline(
    sample_config: RAGConfig,
    retrieval_result: list[RetrievedChunk] | None = None,
    stream_tokens: list[str] | None = None,
    stream_error: Exception | None = None,
) -> RAGPipeline:
    """Create a RAGPipeline with mocked services."""
    with patch("answerstack.rag_pipeline.ProviderService") as MockProvider, \
         patch("answerstack.rag_pipeline.OpenAIEmbeddingService") as MockEmbedding, \
         patch("answerstack.rag_pipeline.ChromaDBVectorRepository"), \
         patch("answerstack.rag_pipeline.create_flashrank_ranker", return_value=None):

        mock_provider_inst = MockProvider.return_value
        mock_provider_inst.configure = AsyncMock()
        mock_provider_inst.is_configured = True

        # Set up a mock client for LLM streaming
        mock_client = AsyncMock()
        mock_provider_inst._client = mock_client

        if stream_error is not None:
            mock_client.chat.completions.create = AsyncMock(side_effect=stream_error)
        elif stream_tokens is not None:
            mock_client.chat.completions.create = AsyncMock(
                return_value=MockAsyncStream(stream_tokens)
            )
        else:
            mock_client.chat.completions.create = AsyncMock(
                return_value=MockAsyncStream(["Hello", " ", "world"])
            )

        pipeline = RAGPipeline(sample_config, ranker=None)

    # Mock the retrieval service
    if retrieval_result is not None:
        pipeline._retrieval.retrieve = AsyncMock(return_value=retrieval_result)
    else:
        pipeline._retrieval.retrieve = AsyncMock(return_value=_make_sample_chunks())

    return pipeline


async def _collect_events(pipeline: RAGPipeline, query: str = "test?", **kwargs) -> list:
    """Collect all events from pipeline.query() into a list."""
    events = []
    async for event in pipeline.query(query=query, **kwargs):
        events.append(event)
    return events


# --------------------------------------------------------------------------- #
# retrieve() tests
# --------------------------------------------------------------------------- #

async def test_retrieve_returns_chunks(sample_config):
    """retrieve() returns the expected list of RetrievedChunk."""
    expected = _make_sample_chunks(3)
    pipeline = _make_pipeline(sample_config, retrieval_result=expected)

    result = await pipeline.retrieve(query="What is X?", collection_name="test")
    assert result == expected
    assert len(result) == 3


async def test_retrieve_with_per_request_overrides(sample_config):
    """Per-request overrides are passed through to RetrievalService."""
    pipeline = _make_pipeline(sample_config)

    await pipeline.retrieve(
        query="test",
        collection_name="test",
        top_k=3,
        initial_k=10,
        similarity_threshold=0.5,
        reranker_enabled=False,
    )

    call_kwargs = pipeline._retrieval.retrieve.call_args.kwargs
    assert call_kwargs["top_k"] == 3
    assert call_kwargs["initial_k"] == 10
    assert call_kwargs["similarity_threshold"] == 0.5
    assert call_kwargs["reranker_enabled"] is False


async def test_retrieve_defaults_to_config_values(sample_config):
    """Without overrides, config values are used."""
    pipeline = _make_pipeline(sample_config)

    await pipeline.retrieve(query="test", collection_name="test")

    call_kwargs = pipeline._retrieval.retrieve.call_args.kwargs
    assert call_kwargs["top_k"] == sample_config.top_k
    assert call_kwargs["initial_k"] == sample_config.initial_k
    assert call_kwargs["similarity_threshold"] == sample_config.similarity_threshold
    assert call_kwargs["reranker_enabled"] == sample_config.reranker_enabled


async def test_retrieve_with_empty_results(sample_config):
    """retrieve() returns empty list when no chunks match."""
    pipeline = _make_pipeline(sample_config, retrieval_result=[])
    result = await pipeline.retrieve(query="nothing", collection_name="test")
    assert result == []


# --------------------------------------------------------------------------- #
# query() event stream tests
# --------------------------------------------------------------------------- #

async def test_query_yields_sources_event_first(sample_config):
    """First yielded event is a SourcesEvent."""
    pipeline = _make_pipeline(sample_config)
    events = await _collect_events(pipeline)

    assert len(events) > 0
    assert isinstance(events[0], SourcesEvent)
    assert len(events[0].sources) == 2  # _make_sample_chunks returns 2


async def test_query_yields_token_events(sample_config):
    """Token events are yielded for each streamed token."""
    pipeline = _make_pipeline(sample_config, stream_tokens=["Hello", " world"])
    events = await _collect_events(pipeline)

    token_events = [e for e in events if isinstance(e, TokenEvent)]
    assert len(token_events) == 2
    assert token_events[0].text == "Hello"
    assert token_events[1].text == " world"


async def test_query_yields_complete_event_last(sample_config):
    """Last event is a CompleteEvent with full accumulated text."""
    pipeline = _make_pipeline(sample_config, stream_tokens=["Hello", " world"])
    events = await _collect_events(pipeline)

    complete_events = [e for e in events if isinstance(e, CompleteEvent)]
    assert len(complete_events) == 1
    assert complete_events[0].full_text == "Hello world"
    assert complete_events[0].token_count == 2


async def test_query_yields_error_event_on_llm_failure(sample_config):
    """ErrorEvent is yielded when LLM streaming fails."""
    pipeline = _make_pipeline(
        sample_config,
        stream_error=RuntimeError("LLM connection failed"),
    )
    events = await _collect_events(pipeline)

    error_events = [e for e in events if isinstance(e, ErrorEvent)]
    assert len(error_events) == 1
    assert "LLM connection failed" in error_events[0].message


async def test_query_passes_conversation_history(sample_config):
    """Conversation history messages are included in the LLM call."""
    pipeline = _make_pipeline(sample_config)

    history = [
        {"role": "user", "content": "previous question"},
        {"role": "assistant", "content": "previous answer"},
    ]
    events = await _collect_events(pipeline, query="follow-up?", messages=history)

    # Verify the LLM was called with messages including history
    call_args = pipeline._provider._client.chat.completions.create.call_args
    llm_messages = call_args.kwargs["messages"]

    # Should be: system, user (prev), assistant (prev), user (current)
    assert llm_messages[0]["role"] == "system"
    assert llm_messages[1] == {"role": "user", "content": "previous question"}
    assert llm_messages[2] == {"role": "assistant", "content": "previous answer"}
    assert llm_messages[3] == {"role": "user", "content": "follow-up?"}


async def test_query_without_history(sample_config):
    """Without messages, only system and user message are sent."""
    pipeline = _make_pipeline(sample_config)

    events = await _collect_events(pipeline, query="What is X?")

    call_args = pipeline._provider._client.chat.completions.create.call_args
    llm_messages = call_args.kwargs["messages"]

    assert len(llm_messages) == 2
    assert llm_messages[0]["role"] == "system"
    assert llm_messages[1] == {"role": "user", "content": "What is X?"}


async def test_query_with_system_prompt_override(sample_config):
    """Custom system_prompt overrides config default."""
    pipeline = _make_pipeline(sample_config)
    custom_prompt = "You are a specialized medical assistant."

    events = await _collect_events(
        pipeline, query="test", system_prompt=custom_prompt
    )

    call_args = pipeline._provider._client.chat.completions.create.call_args
    llm_messages = call_args.kwargs["messages"]
    # System prompt should start with the custom prompt
    assert llm_messages[0]["content"].startswith(custom_prompt)


async def test_query_sources_payload_format(sample_config):
    """SourcesEvent contains properly formatted source payloads."""
    chunks = _make_sample_chunks(2)
    pipeline = _make_pipeline(sample_config, retrieval_result=chunks)

    events = await _collect_events(pipeline)
    sources_event = events[0]
    assert isinstance(sources_event, SourcesEvent)

    for source in sources_event.sources:
        assert "document_name" in source
        assert "chunk_text" in source
        assert "page_number" in source
        assert "relevance_score" in source
        # chunk_text should be truncated to 500 chars
        assert len(source["chunk_text"]) <= 500


async def test_query_with_no_chunks_still_streams(sample_config):
    """Even with no retrieved chunks, query still yields events."""
    pipeline = _make_pipeline(sample_config, retrieval_result=[])
    events = await _collect_events(pipeline)

    # Should still get SourcesEvent (empty), then tokens, then complete
    assert isinstance(events[0], SourcesEvent)
    assert events[0].sources == []


# --------------------------------------------------------------------------- #
# reasoning_effort parameter tests
# --------------------------------------------------------------------------- #

async def test_query_passes_reasoning_effort_when_set(sample_config):
    """reasoning_effort is forwarded to the LLM create call when configured."""
    sample_config.reasoning_effort = "high"
    pipeline = _make_pipeline(sample_config)

    events = await _collect_events(pipeline, query="test?")

    call_kwargs = pipeline._provider._client.chat.completions.create.call_args.kwargs
    assert call_kwargs["reasoning_effort"] == "high"


async def test_query_omits_reasoning_effort_when_none(sample_config):
    """reasoning_effort is NOT passed to the LLM when it is None (default)."""
    assert sample_config.reasoning_effort is None
    pipeline = _make_pipeline(sample_config)

    events = await _collect_events(pipeline, query="test?")

    call_kwargs = pipeline._provider._client.chat.completions.create.call_args.kwargs
    assert "reasoning_effort" not in call_kwargs


async def test_query_reasoning_effort_low(sample_config):
    """reasoning_effort='low' is correctly forwarded."""
    sample_config.reasoning_effort = "low"
    pipeline = _make_pipeline(sample_config)

    events = await _collect_events(pipeline, query="test?")

    call_kwargs = pipeline._provider._client.chat.completions.create.call_args.kwargs
    assert call_kwargs["reasoning_effort"] == "low"


async def test_query_reasoning_effort_medium(sample_config):
    """reasoning_effort='medium' is correctly forwarded."""
    sample_config.reasoning_effort = "medium"
    pipeline = _make_pipeline(sample_config)

    events = await _collect_events(pipeline, query="test?")

    call_kwargs = pipeline._provider._client.chat.completions.create.call_args.kwargs
    assert call_kwargs["reasoning_effort"] == "medium"


# --------------------------------------------------------------------------- #
# Sync wrapper
# --------------------------------------------------------------------------- #

def test_retrieve_sync_from_sync_context(sample_config):
    """retrieve_sync() works from a non-async context."""
    pipeline = _make_pipeline(sample_config, retrieval_result=_make_sample_chunks(2))

    result = pipeline.retrieve_sync(query="test", collection_name="test")
    assert len(result) == 2
    assert all(isinstance(c, RetrievedChunk) for c in result)


async def test_retrieve_sync_from_async_context_raises(sample_config):
    """retrieve_sync() raises RuntimeError from async context."""
    pipeline = _make_pipeline(sample_config)

    with pytest.raises(RuntimeError, match="Cannot call retrieve_sync\\(\\) from async context"):
        pipeline.retrieve_sync(query="test", collection_name="test")


# --------------------------------------------------------------------------- #
# Provider lazy initialization
# --------------------------------------------------------------------------- #

async def test_provider_configured_lazily(sample_config):
    """Provider is configured only on first retrieve/query call."""
    pipeline = _make_pipeline(sample_config)

    # Before any call, _initialized should be False
    assert pipeline._initialized is False

    await pipeline.retrieve(query="test", collection_name="test")

    # After first call, should be True
    assert pipeline._initialized is True
