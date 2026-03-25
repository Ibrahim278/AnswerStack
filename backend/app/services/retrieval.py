"""Retrieval service: two-stage RAG pipeline with vector search and reranking."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog
from flashrank import RerankRequest

from app.repositories.vector import VectorRepository
from app.services.embedding import EmbeddingService

logger = structlog.get_logger()


@dataclass
class RetrievedChunk:
    """Internal data object representing a single retrieved source chunk."""

    chunk_id: str
    document_name: str
    chunk_text: str
    page_number: int | None
    relevance_score: float


class RetrievalService:
    """Two-stage retrieval: vector similarity search followed by FlashRank reranking.

    Stage 1: Embed the query, perform cosine similarity search (top-N candidates).
    Stage 2: Rerank candidates with FlashRank cross-encoder, filter by threshold.

    The service has no SQLAlchemy imports -- all data access flows through
    VectorRepository and EmbeddingService interfaces.
    """

    def __init__(
        self,
        vector_repo: VectorRepository,
        embedding_service: EmbeddingService,
        ranker: Any | None = None,
    ) -> None:
        self._vector_repo = vector_repo
        self._embedding_service = embedding_service
        self._ranker = ranker

    async def retrieve(
        self,
        project_id: UUID,
        query: str,
        embedding_model: str,
        top_k: int = 5,
        initial_k: int = 20,
        similarity_threshold: float = 0.3,
        reranker_enabled: bool = True,
    ) -> list[RetrievedChunk]:
        """Execute the two-stage retrieval pipeline.

        1. Embed query and perform vector similarity search (initial_k candidates).
        2. If reranker enabled and available, rerank with FlashRank then threshold-filter.
           Otherwise, convert cosine distances to similarities and threshold-filter.
        3. Return top_k chunks that pass the similarity_threshold.

        Returns an empty list when no sources pass the threshold -- the caller
        handles the no-context case.
        """
        # Stage 1: Vector similarity search
        query_embedding = await self._embedding_service.embed_single(query, embedding_model)

        raw_results = await asyncio.to_thread(
            self._vector_repo.query,
            project_id,
            query_embedding,
            n_results=initial_k,
        )

        if not raw_results["ids"]:
            logger.debug("No vector results for query", project_id=str(project_id))
            return []

        # Stage 2: Reranking or fallback similarity scoring
        if reranker_enabled and self._ranker is not None:
            return await self._rerank_results(raw_results, query, top_k, similarity_threshold)
        else:
            return self._fallback_similarity(raw_results, top_k, similarity_threshold)

    async def _rerank_results(
        self,
        raw_results: dict,
        query: str,
        top_k: int,
        similarity_threshold: float,
    ) -> list[RetrievedChunk]:
        """Stage 2a: Rerank with FlashRank cross-encoder."""
        passages = [
            {"id": i, "text": doc, "meta": meta}
            for i, (doc, meta) in enumerate(
                zip(raw_results["documents"], raw_results["metadatas"])
            )
        ]

        reranked = await asyncio.to_thread(
            self._ranker.rerank,
            RerankRequest(query=query, passages=passages),
        )

        chunks: list[RetrievedChunk] = []
        for result in reranked:
            score = result["score"]
            if score < similarity_threshold:
                continue
            original_idx = result["id"]
            chunks.append(
                RetrievedChunk(
                    chunk_id=raw_results["ids"][original_idx],
                    document_name=result["meta"].get("document_name", "Unknown"),
                    chunk_text=result["text"],
                    page_number=result["meta"].get("page_number"),
                    relevance_score=score,
                )
            )
            if len(chunks) >= top_k:
                break

        logger.debug(
            "Reranked retrieval complete",
            candidates=len(raw_results["ids"]),
            returned=len(chunks),
        )
        return chunks

    def _fallback_similarity(
        self,
        raw_results: dict,
        top_k: int,
        similarity_threshold: float,
    ) -> list[RetrievedChunk]:
        """Stage 2b: Fallback without reranker -- use cosine distance conversion."""
        scored: list[tuple[int, float]] = []
        for i, distance in enumerate(raw_results["distances"]):
            similarity = 1.0 - distance
            if similarity >= similarity_threshold:
                scored.append((i, similarity))

        # Sort by similarity descending
        scored.sort(key=lambda x: x[1], reverse=True)
        scored = scored[:top_k]

        chunks: list[RetrievedChunk] = []
        for idx, similarity in scored:
            meta = raw_results["metadatas"][idx]
            chunks.append(
                RetrievedChunk(
                    chunk_id=raw_results["ids"][idx],
                    document_name=meta.get("document_name", "Unknown"),
                    chunk_text=raw_results["documents"][idx],
                    page_number=meta.get("page_number"),
                    relevance_score=similarity,
                )
            )

        logger.debug(
            "Fallback retrieval complete",
            candidates=len(raw_results["ids"]),
            returned=len(chunks),
        )
        return chunks

    @staticmethod
    def build_source_context(chunks: list[RetrievedChunk]) -> str:
        """Build a formatted source context block for the system prompt.

        Each source is formatted as:
            [Source N: filename, page X]
            chunk_text

        If page_number is None, the "page X" part is omitted.
        """
        if not chunks:
            return ""

        blocks: list[str] = []
        for n, chunk in enumerate(chunks, start=1):
            if chunk.page_number is not None:
                header = f"[Source {n}: {chunk.document_name}, page {chunk.page_number}]"
            else:
                header = f"[Source {n}: {chunk.document_name}]"
            blocks.append(f"{header}\n{chunk.chunk_text}")

        return "\n\n".join(blocks)
