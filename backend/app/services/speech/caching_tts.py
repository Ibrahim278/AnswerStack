"""Caching decorator for TTSProvider implementations.

Wraps any TTSProvider and caches synthesized audio in memory using an
LRU eviction policy based on total cached bytes.
"""

import hashlib
from collections import OrderedDict
from collections.abc import AsyncIterator

import structlog

from app.services.speech.tts_provider import TTSProvider, VoiceInfo

logger = structlog.get_logger()

# Default: 100 MB max cache
_DEFAULT_MAX_BYTES = 100 * 1024 * 1024


class CachingTTSProvider(TTSProvider):
    """Transparent caching wrapper around any TTSProvider.

    Caches the full audio output keyed by (provider, text, voice_id).
    Uses LRU eviction when total cached bytes exceed max_cache_bytes.
    """

    def __init__(
        self,
        inner: TTSProvider,
        max_cache_bytes: int = _DEFAULT_MAX_BYTES,
    ) -> None:
        self._inner = inner
        self._max_cache_bytes = max_cache_bytes
        self._cache: OrderedDict[str, bytes] = OrderedDict()
        self._current_bytes = 0

    @staticmethod
    def _cache_key(provider_name: str, text: str, voice_id: str) -> str:
        raw = f"{provider_name}:{voice_id}:{text}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def _evict(self, needed: int) -> None:
        """Evict least-recently-used entries until there's room for `needed` bytes."""
        while self._cache and self._current_bytes + needed > self._max_cache_bytes:
            _key, evicted = self._cache.popitem(last=False)
            self._current_bytes -= len(evicted)

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        effective_voice = voice_id or self._inner.default_voice_id or ""
        key = self._cache_key(self._inner.provider_name, text, effective_voice)

        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            logger.debug("TTS cache hit", provider=self._inner.provider_name, text_len=len(text))
            chunk_size = 4096
            for idx in range(0, len(cached), chunk_size):
                yield cached[idx : idx + chunk_size]
            return

        # Cache miss — collect from inner provider
        chunks: list[bytes] = []
        async for chunk in self._inner.synthesize_stream(text, voice_id, output_format):
            chunks.append(chunk)
            yield chunk

        audio = b"".join(chunks)
        if audio and len(audio) <= self._max_cache_bytes:
            self._evict(len(audio))
            self._cache[key] = audio
            self._current_bytes += len(audio)
            logger.debug(
                "TTS cache store",
                provider=self._inner.provider_name,
                text_len=len(text),
                audio_bytes=len(audio),
                cache_entries=len(self._cache),
                cache_bytes=self._current_bytes,
            )

    async def list_voices(self) -> list[VoiceInfo]:
        return await self._inner.list_voices()

    async def is_available(self) -> bool:
        return await self._inner.is_available()

    @property
    def provider_name(self) -> str:
        return self._inner.provider_name

    @property
    def default_voice_id(self) -> str | None:
        return self._inner.default_voice_id
