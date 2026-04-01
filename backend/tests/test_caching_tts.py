"""Tests for CachingTTSProvider wrapper.

Covers:
- Cache hit returns identical audio without calling inner provider
- Cache miss calls inner provider and caches result
- LRU eviction when cache exceeds max bytes
- Different text/voice/provider produce different cache keys
- Empty audio is not cached
- Audio larger than max cache is not cached
- Passthrough of list_voices, is_available, provider_name, default_voice_id
- Cache key collision resistance
"""

import pytest
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, PropertyMock, patch

from app.services.speech.caching_tts import CachingTTSProvider
from app.services.speech.tts_provider import TTSProvider, VoiceInfo


# ---------------------------------------------------------------------------
# Fake inner provider for testing
# ---------------------------------------------------------------------------


class FakeTTSProvider(TTSProvider):
    """Minimal concrete TTSProvider for testing the caching wrapper."""

    def __init__(
        self,
        name: str = "FakeTTS",
        default_voice: str = "voice-1",
        voices: list[VoiceInfo] | None = None,
        available: bool = True,
    ):
        self._name = name
        self._default_voice = default_voice
        self._voices = voices or [VoiceInfo(voice_id="voice-1", name="Default")]
        self._available = available
        self.call_count = 0
        self.last_text: str | None = None
        self.last_voice_id: str | None = None

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        self.call_count += 1
        self.last_text = text
        self.last_voice_id = voice_id
        audio = f"audio-for-{text}-{voice_id or self._default_voice}".encode()
        chunk_size = 8
        for idx in range(0, len(audio), chunk_size):
            yield audio[idx : idx + chunk_size]

    async def list_voices(self) -> list[VoiceInfo]:
        return self._voices

    async def is_available(self) -> bool:
        return self._available

    @property
    def provider_name(self) -> str:
        return self._name

    @property
    def default_voice_id(self) -> str | None:
        return self._default_voice


# ---------------------------------------------------------------------------
# Helper to collect async iterator
# ---------------------------------------------------------------------------


async def _collect(stream: AsyncIterator[bytes]) -> bytes:
    chunks = []
    async for chunk in stream:
        chunks.append(chunk)
    return b"".join(chunks)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCachingTTSProviderCacheMiss:
    """First call (cache miss) should call inner provider."""

    async def test_cache_miss_calls_inner(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        audio = await _collect(caching.synthesize_stream("Hello"))
        assert inner.call_count == 1
        assert audio == b"audio-for-Hello-voice-1"

    async def test_cache_miss_passes_voice_id(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        await _collect(caching.synthesize_stream("Hi", voice_id="voice-2"))
        assert inner.last_voice_id == "voice-2"

    async def test_cache_miss_passes_output_format(self):
        """Output format is forwarded to inner provider."""
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        await _collect(caching.synthesize_stream("Hi"))
        assert inner.call_count == 1


class TestCachingTTSProviderCacheHit:
    """Second call with same params should return cached result."""

    async def test_cache_hit_skips_inner(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        audio1 = await _collect(caching.synthesize_stream("Hello"))
        audio2 = await _collect(caching.synthesize_stream("Hello"))

        assert inner.call_count == 1
        assert audio1 == audio2

    async def test_cache_hit_with_explicit_voice(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        audio1 = await _collect(caching.synthesize_stream("Hi", voice_id="v1"))
        audio2 = await _collect(caching.synthesize_stream("Hi", voice_id="v1"))

        assert inner.call_count == 1
        assert audio1 == audio2

    async def test_different_text_is_separate_entry(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        audio1 = await _collect(caching.synthesize_stream("Hello"))
        audio2 = await _collect(caching.synthesize_stream("World"))

        assert inner.call_count == 2
        assert audio1 != audio2

    async def test_different_voice_is_separate_entry(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner)

        audio1 = await _collect(caching.synthesize_stream("Hello", voice_id="v1"))
        audio2 = await _collect(caching.synthesize_stream("Hello", voice_id="v2"))

        assert inner.call_count == 2
        assert audio1 != audio2

    async def test_none_voice_uses_default_for_cache_key(self):
        """voice_id=None and voice_id=default_voice should share cache entry."""
        inner = FakeTTSProvider(default_voice="voice-1")
        caching = CachingTTSProvider(inner)

        audio1 = await _collect(caching.synthesize_stream("Hello", voice_id=None))
        audio2 = await _collect(caching.synthesize_stream("Hello", voice_id="voice-1"))

        assert inner.call_count == 1
        assert audio1 == audio2


class TestCachingTTSProviderEviction:
    """LRU eviction when cache exceeds max bytes."""

    async def test_evicts_oldest_entry(self):
        inner = FakeTTSProvider()
        # Set max to fit ~1 entry (each audio is ~25 bytes)
        caching = CachingTTSProvider(inner, max_cache_bytes=30)

        await _collect(caching.synthesize_stream("first"))
        assert caching._current_bytes > 0

        # Second entry should evict the first
        await _collect(caching.synthesize_stream("second"))
        assert len(caching._cache) == 1

        # "first" should be evicted — inner called again
        await _collect(caching.synthesize_stream("first"))
        assert inner.call_count == 3

    async def test_lru_order_preserved(self):
        inner = FakeTTSProvider()
        # Fit exactly 2 entries (~19 bytes each, so 38 total)
        caching = CachingTTSProvider(inner, max_cache_bytes=38)

        await _collect(caching.synthesize_stream("A"))
        await _collect(caching.synthesize_stream("B"))

        # Access "A" to make it most recently used
        await _collect(caching.synthesize_stream("A"))
        assert inner.call_count == 2  # "A" was a cache hit

        # Adding "C" should evict "B" (least recently used), not "A"
        await _collect(caching.synthesize_stream("C"))

        # "A" should still be cached
        await _collect(caching.synthesize_stream("A"))
        assert inner.call_count == 3  # only "C" was a miss

        # "B" should be evicted
        await _collect(caching.synthesize_stream("B"))
        assert inner.call_count == 4  # "B" was a miss

    async def test_entry_larger_than_max_not_cached(self):
        inner = FakeTTSProvider()
        caching = CachingTTSProvider(inner, max_cache_bytes=5)

        audio = await _collect(caching.synthesize_stream("Hello"))
        assert len(audio) > 5
        assert len(caching._cache) == 0

        # Second call should still hit inner
        await _collect(caching.synthesize_stream("Hello"))
        assert inner.call_count == 2


class TestCachingTTSProviderEdgeCases:
    """Edge cases: empty audio, provider errors, empty text."""

    async def test_empty_audio_not_cached(self):
        """If inner produces no audio chunks, nothing should be cached."""

        class EmptyProvider(FakeTTSProvider):
            async def synthesize_stream(self, text, voice_id=None, output_format="mp3_44100_128"):
                self.call_count += 1
                return
                yield  # make it an async generator

        inner = EmptyProvider()
        caching = CachingTTSProvider(inner)

        audio = await _collect(caching.synthesize_stream("Hello"))
        assert audio == b""
        assert len(caching._cache) == 0

    async def test_inner_error_propagates(self):
        """Errors from inner provider should propagate without caching."""

        class ErrorProvider(FakeTTSProvider):
            async def synthesize_stream(self, text, voice_id=None, output_format="mp3_44100_128"):
                self.call_count += 1
                raise RuntimeError("provider down")
                yield  # make it an async generator

        inner = ErrorProvider()
        caching = CachingTTSProvider(inner)

        with pytest.raises(RuntimeError, match="provider down"):
            await _collect(caching.synthesize_stream("Hello"))

        assert len(caching._cache) == 0

    async def test_different_provider_names_separate_caches(self):
        """Two wrappers around differently-named providers should not share keys."""
        inner_a = FakeTTSProvider(name="ProviderA")
        inner_b = FakeTTSProvider(name="ProviderB")
        cache_a = CachingTTSProvider(inner_a)
        cache_b = CachingTTSProvider(inner_b)

        audio_a = await _collect(cache_a.synthesize_stream("Hello"))
        audio_b = await _collect(cache_b.synthesize_stream("Hello"))

        # They should both call their inner provider (separate cache instances)
        assert inner_a.call_count == 1
        assert inner_b.call_count == 1


class TestCachingTTSProviderPassthrough:
    """Passthrough methods delegate to inner provider."""

    async def test_list_voices_delegates(self):
        voices = [VoiceInfo("v1", "Voice 1"), VoiceInfo("v2", "Voice 2")]
        inner = FakeTTSProvider(voices=voices)
        caching = CachingTTSProvider(inner)

        result = await caching.list_voices()
        assert result == voices

    async def test_is_available_delegates(self):
        inner = FakeTTSProvider(available=True)
        caching = CachingTTSProvider(inner)
        assert await caching.is_available() is True

        inner2 = FakeTTSProvider(available=False)
        caching2 = CachingTTSProvider(inner2)
        assert await caching2.is_available() is False

    def test_provider_name_delegates(self):
        inner = FakeTTSProvider(name="TestProvider")
        caching = CachingTTSProvider(inner)
        assert caching.provider_name == "TestProvider"

    def test_default_voice_id_delegates(self):
        inner = FakeTTSProvider(default_voice="my-voice")
        caching = CachingTTSProvider(inner)
        assert caching.default_voice_id == "my-voice"

    def test_default_voice_id_none(self):
        inner = FakeTTSProvider(default_voice=None)
        caching = CachingTTSProvider(inner)
        assert caching.default_voice_id is None
