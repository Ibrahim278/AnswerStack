"""RAGPipeline facade: retrieve relevant chunks and generate streamed answers.

Composes internal core modules (vector storage, embedding, retrieval, provider)
into a single ergonomic entry point for RAG queries.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

import structlog

from answerstack.config import RAGConfig
from answerstack.embedding import OpenAIEmbeddingService
from answerstack.prompts import build_rag_prompt
from answerstack.provider import ProviderService
from answerstack.reranker import create_flashrank_ranker
from answerstack.retrieval import RetrievalService, RetrievedChunk
from answerstack.types import (
    CompleteEvent,
    ErrorEvent,
    RerankerProtocol,
    SourcesEvent,
    TokenEvent,
)
from answerstack.vector import ChromaDBVectorRepository

logger = structlog.get_logger()


class RAGPipeline:
    """Query facade: retrieve relevant chunks and generate streamed answers.

    Usage:
        pipeline = RAGPipeline(config)
        chunks = await pipeline.retrieve(query="What is X?", collection_name="my_kb")

        async for event in pipeline.query(query="What is X?", collection_name="my_kb"):
            if isinstance(event, TokenEvent):
                print(event.text, end="")
    """

    def __init__(
        self,
        config: RAGConfig,
        ranker: RerankerProtocol | None = None,
    ) -> None:
        self._config = config
        self._vector_repo = ChromaDBVectorRepository(path=config.data_dir)
        self._provider = ProviderService()
        self._embedding = OpenAIEmbeddingService(self._provider)
        if ranker is None and config.reranker_enabled:
            ranker = create_flashrank_ranker()
        self._retrieval = RetrievalService(
            self._vector_repo, self._embedding, ranker
        )
        self._initialized = False

    async def _ensure_provider(self) -> None:
        """Lazy-configure provider on first use."""
        if not self._initialized:
            await self._provider.configure(
                base_url=self._config.provider_url,
                api_key=self._config.provider_api_key,
            )
            self._initialized = True

    async def retrieve(
        self,
        query: str,
        collection_name: str = "default",
        top_k: int | None = None,
        initial_k: int | None = None,
        similarity_threshold: float | None = None,
        reranker_enabled: bool | None = None,
    ) -> list[RetrievedChunk]:
        """Retrieve relevant chunks for a query.

        Parameters default to config values if not provided,
        allowing per-request overrides from the web app.
        """
        await self._ensure_provider()
        return await self._retrieval.retrieve(
            collection_name=collection_name,
            query=query,
            embedding_model=self._config.embedding_model,
            top_k=top_k if top_k is not None else self._config.top_k,
            initial_k=initial_k if initial_k is not None else self._config.initial_k,
            similarity_threshold=(
                similarity_threshold
                if similarity_threshold is not None
                else self._config.similarity_threshold
            ),
            reranker_enabled=(
                reranker_enabled
                if reranker_enabled is not None
                else self._config.reranker_enabled
            ),
        )

    async def query(
        self,
        query: str,
        collection_name: str = "default",
        system_prompt: str | None = None,
        messages: list[dict] | None = None,
    ) -> AsyncGenerator[
        TokenEvent | SourcesEvent | CompleteEvent | ErrorEvent, None
    ]:
        """Retrieve chunks and generate a streamed LLM answer.

        Yields typed domain events:
        - SourcesEvent: emitted first with retrieved chunks
        - TokenEvent: one per streamed token
        - CompleteEvent: emitted after all tokens
        - ErrorEvent: emitted if generation fails

        Args:
            query: The user's question.
            collection_name: Collection to search.
            system_prompt: Override for config system_prompt.
            messages: Optional conversation history (list of {"role": ..., "content": ...}).
                The backend provides this from SQLAlchemy chat history.
                For standalone usage, omit or pass [].
        """
        await self._ensure_provider()

        # Stage 1: Retrieve
        chunks = await self.retrieve(query, collection_name)

        # Emit sources
        sources_payload = [
            {
                "document_name": c.document_name,
                "chunk_text": c.chunk_text[:500],
                "page_number": c.page_number,
                "relevance_score": round(float(c.relevance_score), 4),
            }
            for c in chunks
        ]
        yield SourcesEvent(sources=sources_payload)

        # Build prompt with source context (hardened against injection)
        source_context = RetrievalService.build_source_context(chunks)
        base_prompt = system_prompt or self._config.system_prompt
        effective_prompt = build_rag_prompt(base_prompt, source_context)

        # Build messages array
        llm_messages = [{"role": "system", "content": effective_prompt}]
        if messages:
            llm_messages.extend(messages)
        llm_messages.append({"role": "user", "content": query})

        # Stage 2: Stream LLM response
        try:
            client = self._provider._client
            create_kwargs: dict = {
                "model": self._config.provider_model,
                "messages": llm_messages,
                "temperature": self._config.temperature,
                "stream": True,
            }
            if self._config.reasoning_effort is not None:
                create_kwargs["reasoning_effort"] = self._config.reasoning_effort
            if self._config.max_completion_tokens is not None:
                create_kwargs["max_completion_tokens"] = self._config.max_completion_tokens
            stream = await client.chat.completions.create(**create_kwargs)

            full_response = ""
            token_count = 0
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content is not None:
                    token_text = chunk.choices[0].delta.content
                    full_response += token_text
                    token_count += 1
                    yield TokenEvent(text=token_text)

            yield CompleteEvent(full_text=full_response, token_count=token_count)
        except Exception as e:
            logger.error("LLM generation failed", error=str(e))
            yield ErrorEvent(message=str(e))

    def retrieve_sync(
        self,
        query: str,
        collection_name: str = "default",
    ) -> list[RetrievedChunk]:
        """Sync convenience wrapper for retrieve(). Do NOT call from async context."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None:
            raise RuntimeError(
                "Cannot call retrieve_sync() from async context. "
                "Use 'await retrieve()' instead."
            )
        return asyncio.run(self.retrieve(query, collection_name))
