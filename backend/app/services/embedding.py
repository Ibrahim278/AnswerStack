from abc import ABC, abstractmethod

import structlog

from app.core.errors import ProviderError
from app.services.provider import ProviderService

logger = structlog.get_logger()


class EmbeddingService(ABC):
    """Port for embedding text into vector representations."""

    @abstractmethod
    async def embed_texts(self, texts: list[str], model: str) -> list[list[float]]:
        """Embed a list of texts, returning one vector per text."""
        ...

    @abstractmethod
    async def embed_single(self, text: str, model: str) -> list[float]:
        """Embed a single text, returning its vector."""
        ...


class OpenAIEmbeddingService(EmbeddingService):
    """Concrete EmbeddingService using an OpenAI-compatible API via ProviderService."""

    def __init__(self, provider_service: ProviderService) -> None:
        self._provider = provider_service
        self._batch_size = 100

    async def embed_texts(self, texts: list[str], model: str) -> list[list[float]]:
        if not self._provider.is_configured:
            raise ProviderError("Provider not configured for embeddings.")

        client = self._provider._client
        all_embeddings: list[list[float]] = []

        total_batches = (len(texts) + self._batch_size - 1) // self._batch_size
        for batch_idx in range(0, len(texts), self._batch_size):
            batch = texts[batch_idx : batch_idx + self._batch_size]
            batch_num = batch_idx // self._batch_size + 1

            logger.debug(
                "Embedding batch",
                batch=batch_num,
                total_batches=total_batches,
                batch_size=len(batch),
            )

            response = await client.embeddings.create(model=model, input=batch)

            # Sort by index to guarantee order matches input
            sorted_data = sorted(response.data, key=lambda item: item.index)
            batch_embeddings = [item.embedding for item in sorted_data]
            all_embeddings.extend(batch_embeddings)

        logger.info(
            "Embedding complete",
            total_texts=len(texts),
            total_embeddings=len(all_embeddings),
        )
        return all_embeddings

    async def embed_single(self, text: str, model: str) -> list[float]:
        result = await self.embed_texts([text], model)
        return result[0]
