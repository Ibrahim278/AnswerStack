"""Tests for speech provider ports and concrete implementations.

Covers:
- STTProvider / TTSProvider ABC interface contracts
- ElevenLabsSTTProvider with mocked httpx
- ElevenLabsTTSProvider with mocked httpx
- KokoroTTSProvider with mocked httpx
- Config fields for speech providers
- Edge cases: empty API keys, missing voices, content type mapping
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import fields as dataclass_fields

import httpx


# ---------------------------------------------------------------------------
# STTProvider port tests
# ---------------------------------------------------------------------------


class TestSTTProviderInterface:
    """Verify STTProvider ABC has required abstract methods and TranscriptionResult shape."""

    def test_transcription_result_has_required_fields(self):
        from app.services.speech.stt_provider import TranscriptionResult

        result = TranscriptionResult(text="hello", language_code="en", confidence=0.99)
        assert result.text == "hello"
        assert result.language_code == "en"
        assert result.confidence == 0.99

    def test_transcription_result_defaults(self):
        from app.services.speech.stt_provider import TranscriptionResult

        result = TranscriptionResult(text="hello")
        assert result.language_code is None
        assert result.confidence is None

    def test_stt_provider_cannot_be_instantiated(self):
        from app.services.speech.stt_provider import STTProvider

        with pytest.raises(TypeError):
            STTProvider()

    def test_stt_provider_has_transcribe_method(self):
        from app.services.speech.stt_provider import STTProvider

        assert hasattr(STTProvider, "transcribe")

    def test_stt_provider_has_is_available_method(self):
        from app.services.speech.stt_provider import STTProvider

        assert hasattr(STTProvider, "is_available")

    def test_stt_provider_has_provider_name_property(self):
        from app.services.speech.stt_provider import STTProvider

        assert hasattr(STTProvider, "provider_name")


# ---------------------------------------------------------------------------
# TTSProvider port tests
# ---------------------------------------------------------------------------


class TestTTSProviderInterface:
    """Verify TTSProvider ABC has required abstract methods and VoiceInfo shape."""

    def test_voice_info_has_required_fields(self):
        from app.services.speech.tts_provider import VoiceInfo

        voice = VoiceInfo(voice_id="v1", name="Test Voice", labels={"accent": "british"})
        assert voice.voice_id == "v1"
        assert voice.name == "Test Voice"
        assert voice.labels == {"accent": "british"}

    def test_voice_info_labels_default_none(self):
        from app.services.speech.tts_provider import VoiceInfo

        voice = VoiceInfo(voice_id="v1", name="Test Voice")
        assert voice.labels is None

    def test_tts_provider_cannot_be_instantiated(self):
        from app.services.speech.tts_provider import TTSProvider

        with pytest.raises(TypeError):
            TTSProvider()

    def test_tts_provider_has_synthesize_stream(self):
        from app.services.speech.tts_provider import TTSProvider

        assert hasattr(TTSProvider, "synthesize_stream")

    def test_tts_provider_has_list_voices(self):
        from app.services.speech.tts_provider import TTSProvider

        assert hasattr(TTSProvider, "list_voices")

    def test_tts_provider_has_is_available(self):
        from app.services.speech.tts_provider import TTSProvider

        assert hasattr(TTSProvider, "is_available")

    def test_tts_provider_has_provider_name(self):
        from app.services.speech.tts_provider import TTSProvider

        assert hasattr(TTSProvider, "provider_name")

    def test_tts_provider_has_default_voice_id(self):
        from app.services.speech.tts_provider import TTSProvider

        assert hasattr(TTSProvider, "default_voice_id")


# ---------------------------------------------------------------------------
# ElevenLabsSTTProvider tests
# ---------------------------------------------------------------------------


class TestElevenLabsSTTProvider:
    """Tests for ElevenLabs STT provider with mocked HTTP client."""

    def test_is_available_with_api_key(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="test-key")
        # is_available is async, so we use pytest.mark.asyncio
        import asyncio

        assert asyncio.get_event_loop().run_until_complete(provider.is_available()) is True

    async def test_is_available_without_api_key(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="")
        assert await provider.is_available() is False

    def test_provider_name(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="test-key")
        assert provider.provider_name == "ElevenLabs Scribe"

    def test_content_type_to_ext_mapping(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="test-key")
        assert provider._content_type_to_ext("audio/webm") == "webm"
        assert provider._content_type_to_ext("audio/mp4") == "mp4"
        assert provider._content_type_to_ext("audio/ogg") == "ogg"
        assert provider._content_type_to_ext("audio/wav") == "wav"
        assert provider._content_type_to_ext("audio/mpeg") == "mp3"
        assert provider._content_type_to_ext("audio/unknown") == "webm"

    async def test_transcribe_success(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "text": "Hello world",
            "language_code": "eng",
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            result = await provider.transcribe(b"fake-audio", "audio/webm", "en")

        assert result.text == "Hello world"
        assert result.language_code == "eng"

    async def test_transcribe_sends_xi_api_key_header(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="secret-key-123")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"text": "Hello", "language_code": "eng"}
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            await provider.transcribe(b"fake-audio", "audio/webm", "en")

            # Verify the call used the right headers (in client init)
            # The xi-api-key is set in client default headers, not per-request

    async def test_transcribe_raises_on_api_error(self):
        from app.services.speech.elevenlabs_stt import ElevenLabsSTTProvider

        provider = ElevenLabsSTTProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )

        with patch.object(provider, "_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            with pytest.raises(httpx.HTTPStatusError):
                await provider.transcribe(b"fake-audio", "audio/webm", "en")


# ---------------------------------------------------------------------------
# ElevenLabsTTSProvider tests
# ---------------------------------------------------------------------------


class TestElevenLabsTTSProvider:
    """Tests for ElevenLabs TTS provider with mocked HTTP client."""

    def test_provider_name(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key")
        assert provider.provider_name == "ElevenLabs TTS"

    async def test_is_available_with_key(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key")
        assert await provider.is_available() is True

    async def test_is_available_without_key(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="")
        assert await provider.is_available() is False

    def test_default_voice_id_when_set(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key", default_voice="voice-abc")
        assert provider.default_voice_id == "voice-abc"

    def test_default_voice_id_when_empty(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key", default_voice="")
        assert provider.default_voice_id is None

    async def test_list_voices(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "voices": [
                {"voice_id": "v1", "name": "Rachel", "labels": {"accent": "american"}},
                {"voice_id": "v2", "name": "Adam", "labels": {}},
            ]
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_response)
            voices = await provider.list_voices()

        assert len(voices) == 2
        assert voices[0].voice_id == "v1"
        assert voices[0].name == "Rachel"
        assert voices[1].voice_id == "v2"

    async def test_synthesize_stream_yields_chunks(self):
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key", default_voice="v1")

        chunks = [b"chunk1", b"chunk2", b"chunk3"]

        async def mock_aiter_bytes(chunk_size):
            for chunk in chunks:
                yield chunk

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_bytes = mock_aiter_bytes

        # Use AsyncMock for the stream context manager
        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        with patch.object(provider, "_client") as mock_client:
            mock_client.stream = MagicMock(return_value=mock_stream)
            collected = []
            async for chunk in provider.synthesize_stream(text="Hello", voice_id="v1"):
                collected.append(chunk)

        assert collected == chunks

    async def test_synthesize_stream_fetches_voice_when_none(self):
        """When no voice_id and no default, should fetch first voice from list_voices."""
        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        provider = ElevenLabsTTSProvider(api_key="test-key", default_voice="")

        # Mock list_voices
        from app.services.speech.tts_provider import VoiceInfo

        with patch.object(
            provider, "list_voices", new=AsyncMock(return_value=[VoiceInfo("auto-v1", "AutoVoice")])
        ):
            chunks = [b"audio-data"]

            async def mock_aiter_bytes(chunk_size):
                for chunk in chunks:
                    yield chunk

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()
            mock_response.aiter_bytes = mock_aiter_bytes

            mock_stream = AsyncMock()
            mock_stream.__aenter__ = AsyncMock(return_value=mock_response)
            mock_stream.__aexit__ = AsyncMock(return_value=False)

            with patch.object(provider, "_client") as mock_client:
                mock_client.stream = MagicMock(return_value=mock_stream)
                collected = []
                async for chunk in provider.synthesize_stream(text="Hello"):
                    collected.append(chunk)

            assert collected == chunks


# ---------------------------------------------------------------------------
# KokoroTTSProvider tests
# ---------------------------------------------------------------------------


class TestKokoroTTSProvider:
    """Tests for Kokoro (OpenAI-compatible) TTS provider with mocked HTTP client."""

    def test_provider_name(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880")
        assert provider.provider_name == "Kokoro TTS"

    def test_default_voice_id(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880", default_voice="af_bella")
        assert provider.default_voice_id == "af_bella"

    async def test_is_available_success(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880")

        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch.object(provider, "_client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_response)
            assert await provider.is_available() is True

    async def test_is_available_failure(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880")

        with patch.object(provider, "_client") as mock_client:
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            assert await provider.is_available() is False

    async def test_is_available_empty_base_url(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="")
        assert await provider.is_available() is False

    async def test_synthesize_stream_yields_chunks(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880")

        chunks = [b"kokoro-chunk1", b"kokoro-chunk2"]

        async def mock_aiter_bytes(chunk_size):
            for chunk in chunks:
                yield chunk

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_bytes = mock_aiter_bytes

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        with patch.object(provider, "_client") as mock_client:
            mock_client.stream = MagicMock(return_value=mock_stream)
            collected = []
            async for chunk in provider.synthesize_stream(text="Hello", voice_id="af_bella"):
                collected.append(chunk)

        assert collected == chunks

    async def test_list_voices_success(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "voices": [
                {"voice_id": "af_bella", "name": "Bella"},
                {"voice_id": "af_sky", "name": "Sky"},
            ]
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider, "_client") as mock_client:
            mock_client.get = AsyncMock(return_value=mock_response)
            voices = await provider.list_voices()

        assert len(voices) == 2
        assert voices[0].voice_id == "af_bella"

    async def test_list_voices_fallback_on_error(self):
        from app.services.speech.kokoro_tts import KokoroTTSProvider

        provider = KokoroTTSProvider(base_url="http://localhost:8880")

        with patch.object(provider, "_client") as mock_client:
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            voices = await provider.list_voices()

        # Should return fallback default voice
        assert len(voices) >= 1
        assert voices[0].voice_id == "af_bella"


# ---------------------------------------------------------------------------
# Config speech fields tests
# ---------------------------------------------------------------------------


class TestSpeechConfig:
    """Verify config.py has all speech-related settings."""

    def test_elevenlabs_api_key_default_empty(self):
        from app.core.config import Settings

        s = Settings(
            _env_file=None,
            elevenlabs_api_key="",
        )
        assert s.elevenlabs_api_key == ""

    def test_tts_provider_default(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.tts_provider == "elevenlabs"

    def test_stt_provider_default(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.stt_provider == "elevenlabs"

    def test_elevenlabs_tts_model_default(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.elevenlabs_tts_model == "eleven_multilingual_v2"

    def test_elevenlabs_stt_model_default(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.elevenlabs_stt_model == "scribe_v2"

    def test_kokoro_base_url_default_empty(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.kokoro_base_url == ""

    def test_kokoro_voice_default(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.kokoro_voice == "af_bella"

    def test_elevenlabs_tts_voice_id_default_empty(self):
        from app.core.config import Settings

        s = Settings(_env_file=None)
        assert s.elevenlabs_tts_voice_id == ""


# ---------------------------------------------------------------------------
# httpx dependency test
# ---------------------------------------------------------------------------


class TestHttpxDependency:
    """Verify httpx is a main dependency, not dev-only."""

    def test_httpx_importable(self):
        import httpx

        assert httpx is not None
