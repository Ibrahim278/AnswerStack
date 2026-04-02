"""ProviderService — wraps AsyncOpenAI for OpenAI-compatible LLM/embedding providers."""

import time
from typing import Any

import httpx
import openai
import structlog
from openai import AsyncOpenAI

from answerstack.errors import ProviderError

logger = structlog.get_logger()


class ProviderService:
    """Manages connection to an OpenAI-compatible API provider.

    Supports LM Studio, Ollama, vLLM, and any server implementing
    the OpenAI chat completions and embeddings API.
    """

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None
        self._current_base_url: str | None = None
        self._current_api_key: str | None = None
        self._models_cache: list[dict] | None = None
        self._models_cache_time: float = 0
        self._cache_ttl: float = 300.0

    async def configure(self, base_url: str, api_key: str) -> None:
        """Configure (or reconfigure) the provider connection."""
        if self._client is not None:
            await self._client.close()
        base_url = base_url.rstrip("/")
        api_key = api_key or "not-needed"
        self._client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=httpx.Timeout(30.0, connect=5.0),
        )
        self._current_base_url = base_url
        self._current_api_key = api_key
        self._models_cache = None
        self._models_cache_time = 0
        logger.info("Provider configured", base_url=base_url)

    async def close(self) -> None:
        """Close the underlying HTTP client and clear provider state."""
        if self._client is not None:
            await self._client.close()
        self._client = None
        self._current_base_url = None
        self._current_api_key = None
        self._models_cache = None
        self._models_cache_time = 0

    @property
    def is_configured(self) -> bool:
        """Return True if the provider has been configured with a client."""
        return self._client is not None

    async def list_models(self) -> tuple[list[dict], bool]:
        """List available models from the provider.

        Returns:
            Tuple of (models_list, from_cache).
        """
        if not self.is_configured:
            return ([], False)

        if self._models_cache is not None and (time.monotonic() - self._models_cache_time) < self._cache_ttl:
            return (self._models_cache, True)

        try:
            response = await self._client.models.list()
            models = [{"id": m.id, "owned_by": m.owned_by} for m in response.data]
            self._models_cache = models
            self._models_cache_time = time.monotonic()
            return (models, False)
        except openai.NotFoundError:
            logger.warning("Provider does not support model listing")
            return ([], False)
        except openai.AuthenticationError as e:
            logger.warning("Provider auth failed when listing models")
            raise ProviderError(
                "Authentication failed. Check your API key.",
                retryable=False,
            ) from e
        except openai.APIConnectionError as e:
            logger.warning("Provider connection failed when listing models")
            raise ProviderError(
                "Could not connect to provider. Check the URL.",
                retryable=True,
            ) from e
        except openai.APITimeoutError as e:
            logger.warning("Provider timed out when listing models")
            raise ProviderError(
                "Connection timed out. The provider may be slow or unreachable.",
                retryable=True,
            ) from e
        except openai.APIStatusError as e:
            logger.warning("Provider API error when listing models", status_code=e.status_code)
            raise ProviderError(
                f"Provider returned an error: {e.message}",
                retryable=False,
            ) from e

    async def test_connection(self, chat_model: str = "", embedding_model: str = "") -> dict[str, Any]:
        """Run a three-phase connection test: auth, chat, embedding.

        Returns a dict with results for each phase and provider capabilities.
        """
        if not self.is_configured:
            return {
                "auth": {"status": "fail", "message": "Provider not configured"},
                "chat": {"status": "skip", "message": "Provider not configured"},
                "embedding": {"status": "skip", "message": "Provider not configured"},
                "provider_capabilities": None,
            }

        test_client = self._client.with_options(timeout=httpx.Timeout(15.0, connect=5.0))

        auth: dict[str, Any]
        model_ids: list[str] = []
        models_available = False
        supports_streaming = False
        supports_embeddings = False
        embedding_dimensions: int | None = None

        # Phase 1 -- Auth via model listing
        try:
            response = await test_client.models.list()
            model_ids = [m.id for m in response.data]
            auth = {"status": "pass", "details": {"models_found": len(response.data)}}
            models_available = True
        except openai.AuthenticationError:
            auth = {"status": "fail", "message": "Authentication failed. Check your API key."}
            return {
                "auth": auth,
                "chat": {"status": "skip", "message": "Skipped due to auth failure"},
                "embedding": {"status": "skip", "message": "Skipped due to auth failure"},
                "provider_capabilities": None,
            }
        except openai.APIConnectionError:
            auth = {"status": "fail", "message": "Could not connect to provider. Check the URL."}
            return {
                "auth": auth,
                "chat": {"status": "skip", "message": "Skipped due to connection failure"},
                "embedding": {"status": "skip", "message": "Skipped due to connection failure"},
                "provider_capabilities": None,
            }
        except openai.APITimeoutError:
            auth = {"status": "fail", "message": "Connection timed out. The provider may be slow or unreachable."}
            return {
                "auth": auth,
                "chat": {"status": "skip", "message": "Skipped due to timeout"},
                "embedding": {"status": "skip", "message": "Skipped due to timeout"},
                "provider_capabilities": None,
            }
        except openai.NotFoundError:
            auth = {
                "status": "pass",
                "message": "Connected but model listing not supported",
                "details": {"models_found": 0},
            }
            models_available = False
        except Exception as e:
            auth = {"status": "fail", "message": str(e)}
            return {
                "auth": auth,
                "chat": {"status": "skip", "message": "Skipped due to auth failure"},
                "embedding": {"status": "skip", "message": "Skipped due to auth failure"},
                "provider_capabilities": None,
            }

        # Phase 2 -- Chat completion test
        chat: dict[str, Any]
        test_model = chat_model or (model_ids[0] if model_ids else "")
        if not test_model:
            chat = {"status": "skip", "message": "No model available for chat test"}
        else:
            try:
                await test_client.chat.completions.create(
                    model=test_model,
                    messages=[{"role": "user", "content": "Hi"}],
                    max_tokens=5,
                )
                chat = {"status": "pass"}
                supports_streaming = True
            except openai.BadRequestError as e:
                chat = {"status": "fail", "message": str(e)}
            except Exception as e:
                chat = {"status": "fail", "message": str(e)}

        # Phase 3 -- Embedding test
        embedding: dict[str, Any]
        embed_model = embedding_model
        if not embed_model and model_ids:
            embed_candidates = [m for m in model_ids if "embed" in m.lower()]
            embed_model = embed_candidates[0] if embed_candidates else ""
        if not embed_model:
            embedding = {"status": "skip", "message": "No embedding model configured"}
        else:
            try:
                embed_response = await test_client.embeddings.create(
                    model=embed_model,
                    input="test",
                )
                dims = len(embed_response.data[0].embedding)
                embedding = {"status": "pass", "details": {"dimensions": dims}}
                supports_embeddings = True
                embedding_dimensions = dims
            except Exception as e:
                embedding = {"status": "fail", "message": str(e)}

        capabilities = {
            "supports_streaming": supports_streaming,
            "supports_embeddings": supports_embeddings,
            "embedding_dimensions": embedding_dimensions,
            "models_available": models_available,
        }

        return {
            "auth": auth,
            "chat": chat,
            "embedding": embedding,
            "provider_capabilities": capabilities,
        }

    async def check_provider_available(self) -> bool:
        """Quick check whether the provider is reachable."""
        if not self.is_configured:
            return False
        try:
            await self._client.models.list()
            return True
        except Exception:
            return False
