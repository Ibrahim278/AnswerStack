"""Retrieval service: two-stage RAG pipeline with vector search and reranking.

Uses collection_name: str (not project_id: UUID) to keep the core
library domain-agnostic.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from statistics import mean, pstdev
from typing import TYPE_CHECKING

import structlog
from flashrank import RerankRequest

from answerstack.embedding import EmbeddingService
from answerstack.types import RerankerProtocol
from answerstack.vector import VectorRepository

if TYPE_CHECKING:
    pass

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
              Filter by similarity_threshold (the only quality gate).
    Stage 2: Rerank surviving candidates with FlashRank cross-encoder for ordering.
              No reranker threshold -- top-k by reranker order.
              Collapse detection: if reranker scores are uniformly near-zero,
              fall back to vector-ranked results.

    The service has no SQLAlchemy imports -- all data access flows through
    VectorRepository and EmbeddingService interfaces.
    """

    def __init__(
        self,
        vector_repo: VectorRepository,
        embedding_service: EmbeddingService,
        ranker: RerankerProtocol | None = None,
    ) -> None:
        self._vector_repo = vector_repo
        self._embedding_service = embedding_service
        self._ranker = ranker

    async def retrieve(
        self,
        collection_name: str,
        query: str,
        embedding_model: str,
        top_k: int = 5,
        initial_k: int = 20,
        similarity_threshold: float = 0.3,
        reranker_enabled: bool = True,
    ) -> list[RetrievedChunk]:
        """Execute the two-stage retrieval pipeline.

        1. Embed query and perform vector similarity search (initial_k candidates).
        2. Filter by cosine similarity_threshold (the only hard quality gate).
        3. If reranker enabled, rerank for ordering. Return top_k.
           On reranker collapse, fall back to vector-ranked order.

        Returns an empty list when no sources pass the threshold -- the caller
        handles the no-context case.
        """
        # Stage 1: Vector similarity search
        query_embedding = await self._embedding_service.embed_single(query, embedding_model)

        raw_results = await asyncio.to_thread(
            self._vector_repo.query,
            collection_name,
            query_embedding,
            n_results=initial_k,
        )

        if not raw_results["ids"]:
            logger.debug("No vector results for query", collection_name=collection_name)
            return []

        # Filter by cosine similarity threshold (the only quality gate)
        filtered = self._filter_by_similarity(raw_results, similarity_threshold)

        if not filtered["ids"]:
            logger.info(
                "No vector results passed similarity threshold",
                query=query[:80],
                threshold=similarity_threshold,
                candidates=len(raw_results["ids"]),
                best_similarity=round(1.0 - min(raw_results["distances"]), 4),
            )
            return []

        logger.info(
            "Vector filtering complete",
            query=query[:80],
            candidates=len(raw_results["ids"]),
            passed=len(filtered["ids"]),
            threshold=similarity_threshold,
        )

        # Stage 2: Reranking for ordering, or vector-ranked fallback
        if reranker_enabled and self._ranker is not None:
            reranked = await self._rerank_results(filtered, query, top_k)
            if reranked:
                return reranked
            # Reranker collapsed -- fall back to vector similarity ordering
            logger.info(
                "Falling back to vector-ranked results",
                query=query[:80],
            )
        return self._vector_ranked(filtered, top_k)

    def _filter_by_similarity(
        self,
        raw_results: dict,
        similarity_threshold: float,
    ) -> dict:
        """Filter vector results by cosine similarity threshold.

        ChromaDB cosine distance is converted to similarity via 1.0 - distance.
        Original vector order is preserved.
        """
        qualified = [
            i
            for i, distance in enumerate(raw_results["distances"])
            if (1.0 - distance) >= similarity_threshold
        ]
        return {
            "ids": [raw_results["ids"][i] for i in qualified],
            "documents": [raw_results["documents"][i] for i in qualified],
            "metadatas": [raw_results["metadatas"][i] for i in qualified],
            "distances": [raw_results["distances"][i] for i in qualified],
        }

    async def _rerank_results(
        self,
        filtered_results: dict,
        query: str,
        top_k: int,
    ) -> list[RetrievedChunk]:
        """Stage 2: Rerank with FlashRank cross-encoder for ordering.

        No score threshold -- returns top_k by reranker order.
        Detects reranker collapse (all scores near zero) and returns empty
        so the caller can fall back to vector ordering.
        """
        passages = [
            {"id": i, "text": doc, "meta": meta}
            for i, (doc, meta) in enumerate(
                zip(filtered_results["documents"], filtered_results["metadatas"])
            )
        ]

        reranked = await asyncio.to_thread(
            self._ranker.rerank,
            RerankRequest(query=query, passages=passages),
        )

        if not reranked:
            logger.warning("Reranker returned no results", query=query[:80])
            return []

        # Observability: log reranker score distribution
        scores = [float(result["score"]) for result in reranked]
        max_score = max(scores)
        min_score = min(scores)
        mean_score = mean(scores)
        stddev_score = pstdev(scores)

        logger.info(
            "Reranker stats",
            query=query[:80],
            candidates=len(reranked),
            max_score=round(max_score, 6),
            min_score=round(min_score, 6),
            mean_score=round(mean_score, 6),
            stddev_score=round(stddev_score, 6),
        )

        # Collapse detection: if all scores are near-zero with no variance,
        # the reranker failed to meaningfully differentiate -- fall back
        if max_score < 0.01 and stddev_score < 1e-4:
            logger.warning(
                "Reranker collapse detected",
                query=query[:80],
                max_score=round(max_score, 6),
                stddev_score=round(stddev_score, 6),
            )
            return []

        # Return top_k by reranker order (no score threshold)
        chunks: list[RetrievedChunk] = []
        for result in reranked[:top_k]:
            original_idx = result["id"]
            chunks.append(
                RetrievedChunk(
                    chunk_id=filtered_results["ids"][original_idx],
                    document_name=result["meta"].get("document_name", "Unknown"),
                    chunk_text=result["text"],
                    page_number=result["meta"].get("page_number"),
                    relevance_score=float(result["score"]),
                )
            )

        logger.info(
            "Reranked retrieval complete",
            query=query[:80],
            candidates=len(reranked),
            returned=len(chunks),
        )
        return chunks

    def _vector_ranked(
        self,
        filtered_results: dict,
        top_k: int,
    ) -> list[RetrievedChunk]:
        """Return top_k chunks ordered by vector cosine similarity."""
        scored: list[tuple[int, float]] = []
        for i, distance in enumerate(filtered_results["distances"]):
            scored.append((i, 1.0 - distance))

        scored.sort(key=lambda x: x[1], reverse=True)
        scored = scored[:top_k]

        chunks: list[RetrievedChunk] = []
        for idx, similarity in scored:
            meta = filtered_results["metadatas"][idx]
            chunks.append(
                RetrievedChunk(
                    chunk_id=filtered_results["ids"][idx],
                    document_name=meta.get("document_name", "Unknown"),
                    chunk_text=filtered_results["documents"][idx],
                    page_number=meta.get("page_number"),
                    relevance_score=similarity,
                )
            )

        logger.info(
            "Vector-ranked retrieval complete",
            candidates=len(filtered_results["ids"]),
            returned=len(chunks),
        )
        return chunks

    # Keep old method name for compatibility
    _fallback_similarity = _vector_ranked

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
