"""FlashRank reranker integration for answerstack.

Provides a convenience factory for creating FlashRank Ranker instances
with graceful degradation when the model is unavailable.
"""

from __future__ import annotations

import structlog
from flashrank import Ranker

logger = structlog.get_logger()


def create_flashrank_ranker(
    model_name: str = "rank-T5-flan",
    max_length: int = 512,
) -> Ranker | None:
    """Create a FlashRank ranker instance.

    Returns None if initialization fails (graceful degradation).
    """
    try:
        ranker = Ranker(model_name=model_name, max_length=max_length)
        logger.info("FlashRank reranker initialized", model=model_name)
        return ranker
    except Exception as e:
        logger.warning("FlashRank reranker not available", error=str(e))
        return None
