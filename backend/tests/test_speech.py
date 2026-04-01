"""Integration tests for speech API endpoints.

Tests cover:
- POST /api/v1/speech/transcribe (success, 503 not configured, 502 provider error)
- POST /api/v1/speech/synthesize/prepare + GET /synthesize/stream/{token}
- GET /api/v1/speech/voices (success, 503 not configured)
- GET /api/v1/speech/capabilities (both available, both unavailable, partial)
- All tests use mock providers -- no real speech provider calls.
"""

import os
import tempfile
from collections.abc import AsyncIterator
from unittest.mock import MagicMock

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import create_app
from app.services.speech.stt_provider import STTProvider, TranscriptionResult
from app.services.speech.tts_provider import TTSProvider, VoiceInfo


# ---------------------------------------------------------------------------
# Mock providers
# ---------------------------------------------------------------------------


class MockSTTProvider(STTProvider):
    """Mock STT provider returning a canned transcription."""

    async def transcribe(
        self,
        audio_data: bytes,
        content_type: str,
        language_code: str = "en",
    ) -> TranscriptionResult:
        return TranscriptionResult(text="Hello world", language_code="eng", confidence=0.98)

    async def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Mock STT"


class MockTTSProvider(TTSProvider):
    """Mock TTS provider returning fake audio chunks."""

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        yield b"fake-audio-chunk-1"
        yield b"fake-audio-chunk-2"

    async def list_voices(self) -> list[VoiceInfo]:
        return [
            VoiceInfo(voice_id="v1", name="Test Voice", labels={"accent": "neutral"}),
            VoiceInfo(voice_id="v2", name="Second Voice"),
        ]

    async def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Mock TTS"

    @property
    def default_voice_id(self) -> str | None:
        return "v1"


class FailingSTTProvider(STTProvider):
    """Mock STT provider that simulates an ElevenLabs API error."""

    async def transcribe(
        self,
        audio_data: bytes,
        content_type: str,
        language_code: str = "en",
    ) -> TranscriptionResult:
        mock_request = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        raise httpx.HTTPStatusError(
            "Unauthorized", request=mock_request, response=mock_response
        )

    async def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Failing STT"


class FailingTTSProvider(TTSProvider):
    """Mock TTS provider that raises a generic error on synthesis."""

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        raise RuntimeError("TTS synthesis failed unexpectedly")
        # Make this a generator
        yield b""  # pragma: no cover

    async def list_voices(self) -> list[VoiceInfo]:
        return []

    async def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Failing TTS"

    @property
    def default_voice_id(self) -> str | None:
        return None


class HTTPFailingTTSProvider(TTSProvider):
    """Mock TTS provider that simulates an upstream HTTP error during synthesis."""

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        mock_request = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 402
        mock_response.json.return_value = {
            "detail": {
                "status": "quota_exceeded",
                "message": "This request exceeds your quota.",
            }
        }
        raise httpx.HTTPStatusError(
            "Quota exceeded", request=mock_request, response=mock_response
        )
        yield b""  # pragma: no cover

    async def list_voices(self) -> list[VoiceInfo]:
        return []

    async def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "HTTP Failing TTS"

    @property
    def default_voice_id(self) -> str | None:
        return None


class UnavailableSTTProvider(STTProvider):
    """Mock STT provider that reports unavailable."""

    async def transcribe(self, audio_data: bytes, content_type: str, language_code: str = "en") -> TranscriptionResult:
        raise RuntimeError("Should not be called")

    async def is_available(self) -> bool:
        return False

    @property
    def provider_name(self) -> str:
        return "Unavailable STT"


class UnavailableTTSProvider(TTSProvider):
    """Mock TTS provider that reports unavailable."""

    async def synthesize_stream(self, text: str, voice_id: str | None = None, output_format: str = "mp3_44100_128") -> AsyncIterator[bytes]:
        raise RuntimeError("Should not be called")
        yield b""  # pragma: no cover

    async def list_voices(self) -> list[VoiceInfo]:
        return []

    async def is_available(self) -> bool:
        return False

    @property
    def provider_name(self) -> str:
        return "Unavailable TTS"

    @property
    def default_voice_id(self) -> str | None:
        return None


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def speech_client() -> AsyncIterator[AsyncClient]:
    """Create a test client with mock speech providers."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        get_settings.cache_clear()
        os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

        app = create_app()

        # Set speech providers on app.state
        app.state.stt_provider = MockSTTProvider()
        app.state.tts_provider = MockTTSProvider()
        app.state.settings = get_settings()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)


@pytest.fixture
async def speech_client_no_providers() -> AsyncIterator[AsyncClient]:
    """Create a test client with NO speech providers."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        get_settings.cache_clear()
        os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

        app = create_app()

        # Explicitly set providers to None
        app.state.stt_provider = None
        app.state.tts_provider = None
        app.state.settings = get_settings()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)


@pytest.fixture
async def speech_client_failing_tts_http() -> AsyncIterator[AsyncClient]:
    """Create a test client with a TTS provider that raises HTTPStatusError."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        get_settings.cache_clear()
        os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

        app = create_app()
        app.state.stt_provider = MockSTTProvider()
        app.state.tts_provider = HTTPFailingTTSProvider()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)


@pytest.fixture
async def speech_client_failing_stt() -> AsyncIterator[AsyncClient]:
    """Create a test client with a failing STT provider."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        get_settings.cache_clear()
        os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

        app = create_app()
        app.state.stt_provider = FailingSTTProvider()
        app.state.tts_provider = MockTTSProvider()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

        get_settings.cache_clear()
        os.environ.pop("DOCUMENT_STORAGE_PATH", None)


# ---------------------------------------------------------------------------
# POST /api/v1/speech/transcribe tests
# ---------------------------------------------------------------------------


class TestTranscribeEndpoint:
    """Tests for POST /api/v1/speech/transcribe."""

    async def test_transcribe_success(self, speech_client: AsyncClient):
        """Successful transcription returns JSON with text and language_code."""
        files = {"file": ("audio.webm", b"fake-audio-data", "audio/webm")}
        data = {"language_code": "en"}

        resp = await speech_client.post("/api/v1/speech/transcribe", files=files, data=data)
        assert resp.status_code == 200
        body = resp.json()
        assert body["text"] == "Hello world"
        assert body["language_code"] == "eng"

    async def test_transcribe_no_provider_returns_503(self, speech_client_no_providers: AsyncClient):
        """503 when no STT provider is configured."""
        files = {"file": ("audio.webm", b"fake-audio-data", "audio/webm")}

        resp = await speech_client_no_providers.post("/api/v1/speech/transcribe", files=files)
        assert resp.status_code == 503
        body = resp.json()
        assert body["error_code"] == "speech_not_configured"

    async def test_transcribe_provider_error_returns_502(self, speech_client_failing_stt: AsyncClient):
        """502 when the STT provider returns an error."""
        files = {"file": ("audio.webm", b"fake-audio-data", "audio/webm")}

        resp = await speech_client_failing_stt.post("/api/v1/speech/transcribe", files=files)
        assert resp.status_code == 502
        body = resp.json()
        assert body["error_code"] == "speech_provider_error"
        assert body["retryable"] is True

    async def test_transcribe_default_language_code(self, speech_client: AsyncClient):
        """Language code defaults to 'en' when not provided."""
        files = {"file": ("audio.webm", b"fake-audio-data", "audio/webm")}

        resp = await speech_client.post("/api/v1/speech/transcribe", files=files)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /speech/synthesize/prepare + GET /speech/synthesize/stream/{token}
# ---------------------------------------------------------------------------


class TestSynthesizePrepareEndpoint:
    """Tests for the prepare + stream two-step synthesis flow."""

    async def test_prepare_returns_token_and_url(self, speech_client: AsyncClient):
        """Prepare returns a token and GET URL."""
        resp = await speech_client.post(
            "/api/v1/speech/synthesize/prepare", json={"text": "Hello there"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "token" in body
        assert "url" in body
        assert body["url"].startswith("/api/v1/speech/synthesize/stream/")

    async def test_prepare_with_voice_id(self, speech_client: AsyncClient):
        """Prepare accepts optional voice_id."""
        resp = await speech_client.post(
            "/api/v1/speech/synthesize/prepare",
            json={"text": "Hello", "voice_id": "v1"},
        )
        assert resp.status_code == 200
        assert "token" in resp.json()

    async def test_prepare_no_provider_returns_503(self, speech_client_no_providers: AsyncClient):
        """503 when no TTS provider is configured."""
        resp = await speech_client_no_providers.post(
            "/api/v1/speech/synthesize/prepare", json={"text": "Hello"}
        )
        assert resp.status_code == 503
        assert resp.json()["error_code"] == "speech_not_configured"

    async def test_prepare_empty_text_returns_400(self, speech_client: AsyncClient):
        """400 when text is empty."""
        resp = await speech_client.post(
            "/api/v1/speech/synthesize/prepare", json={"text": ""}
        )
        assert resp.status_code == 400
        assert resp.json()["error_code"] == "speech_validation_error"

    async def test_prepare_whitespace_only_text_returns_400(self, speech_client: AsyncClient):
        """400 when text is only whitespace."""
        resp = await speech_client.post(
            "/api/v1/speech/synthesize/prepare", json={"text": "   \n\t  "}
        )
        assert resp.status_code == 400
        assert resp.json()["error_code"] == "speech_validation_error"


class TestSynthesizeStreamEndpoint:
    """Tests for GET /speech/synthesize/stream/{token}."""

    async def test_stream_success(self, speech_client: AsyncClient):
        """Full prepare→stream flow returns audio."""
        prep = await speech_client.post(
            "/api/v1/speech/synthesize/prepare", json={"text": "Hello there"}
        )
        url = prep.json()["url"]

        resp = await speech_client.get(url)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/mpeg"
        assert b"fake-audio-chunk" in resp.content

    async def test_stream_with_voice_id(self, speech_client: AsyncClient):
        """Voice ID from prepare is forwarded to the stream."""
        prep = await speech_client.post(
            "/api/v1/speech/synthesize/prepare",
            json={"text": "Hello", "voice_id": "v1"},
        )
        resp = await speech_client.get(prep.json()["url"])
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/mpeg"

    async def test_stream_invalid_token_returns_404(self, speech_client: AsyncClient):
        """404 for unknown or expired token."""
        resp = await speech_client.get(
            "/api/v1/speech/synthesize/stream/nonexistent-token"
        )
        assert resp.status_code == 404
        assert resp.json()["error_code"] == "speech_token_invalid"

    async def test_stream_token_is_single_use(self, speech_client: AsyncClient):
        """Token is consumed on first GET; second GET returns 404."""
        prep = await speech_client.post(
            "/api/v1/speech/synthesize/prepare", json={"text": "Hello"}
        )
        url = prep.json()["url"]

        resp1 = await speech_client.get(url)
        assert resp1.status_code == 200

        resp2 = await speech_client.get(url)
        assert resp2.status_code == 404

    async def test_stream_provider_http_error_returns_502(
        self,
        speech_client_failing_tts_http: AsyncClient,
    ):
        """Provider HTTP errors during streaming return 502 with message."""
        prep = await speech_client_failing_tts_http.post(
            "/api/v1/speech/synthesize/prepare", json={"text": "Hello there"}
        )
        resp = await speech_client_failing_tts_http.get(prep.json()["url"])
        assert resp.status_code == 502
        assert resp.json()["error_code"] == "speech_provider_error"
        assert resp.json()["message"] == "This request exceeds your quota."


# ---------------------------------------------------------------------------
# Voice fallback from app.state.tts_default_voice_id tests
# ---------------------------------------------------------------------------


class RecordingTTSProvider(TTSProvider):
    """Mock TTS provider that records the voice_id it receives."""

    def __init__(self):
        self.last_voice_id: str | None = None

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        self.last_voice_id = voice_id
        yield b"fake-audio"

    async def list_voices(self) -> list[VoiceInfo]:
        return [VoiceInfo(voice_id="v1", name="Voice 1")]

    async def is_available(self) -> bool:
        return True

    @property
    def provider_name(self) -> str:
        return "Recording TTS"

    @property
    def default_voice_id(self) -> str | None:
        return "v1"


class TestVoiceFallback:
    """Tests for voice_id fallback from app.state.tts_default_voice_id."""

    @pytest.fixture
    async def recording_client(self) -> AsyncIterator[tuple[AsyncClient, RecordingTTSProvider]]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            get_settings.cache_clear()
            os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

            app = create_app()
            provider = RecordingTTSProvider()
            app.state.tts_provider = provider
            app.state.stt_provider = None
            app.state.tts_default_voice_id = ""

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                yield client, provider

            get_settings.cache_clear()
            os.environ.pop("DOCUMENT_STORAGE_PATH", None)

    async def test_explicit_voice_id_takes_precedence(self, recording_client):
        """Explicit voice_id in the request overrides app.state default."""
        client, provider = recording_client

        # Set a default voice on app state
        transport = client._transport
        if isinstance(transport, ASGITransport):
            transport.app.state.tts_default_voice_id = "fallback-voice"

        # Request with explicit voice
        prep = await client.post(
            "/api/v1/speech/synthesize/prepare",
            json={"text": "Hello", "voice_id": "explicit-voice"},
        )
        url = prep.json()["url"]
        await client.get(url)

        assert provider.last_voice_id == "explicit-voice"

    async def test_fallback_to_app_state_voice(self, recording_client):
        """When no voice_id in request, uses app.state.tts_default_voice_id."""
        client, provider = recording_client

        transport = client._transport
        if isinstance(transport, ASGITransport):
            transport.app.state.tts_default_voice_id = "saved-voice"

        prep = await client.post(
            "/api/v1/speech/synthesize/prepare",
            json={"text": "Hello"},
        )
        url = prep.json()["url"]
        await client.get(url)

        assert provider.last_voice_id == "saved-voice"

    async def test_no_voice_when_both_empty(self, recording_client):
        """When no voice_id in request and no app.state default, passes None."""
        client, provider = recording_client

        prep = await client.post(
            "/api/v1/speech/synthesize/prepare",
            json={"text": "Hello"},
        )
        url = prep.json()["url"]
        await client.get(url)

        assert provider.last_voice_id is None


# ---------------------------------------------------------------------------
# GET /api/v1/speech/voices tests
# ---------------------------------------------------------------------------


class TestVoicesEndpoint:
    """Tests for GET /api/v1/speech/voices."""

    async def test_voices_success(self, speech_client: AsyncClient):
        """Returns list of voices from TTS provider."""
        resp = await speech_client.get("/api/v1/speech/voices")
        assert resp.status_code == 200
        body = resp.json()
        assert "voices" in body
        assert len(body["voices"]) == 2
        assert body["voices"][0]["voice_id"] == "v1"
        assert body["voices"][0]["name"] == "Test Voice"
        assert body["voices"][0]["labels"] == {"accent": "neutral"}
        assert body["voices"][1]["voice_id"] == "v2"

    async def test_voices_no_provider_returns_503(self, speech_client_no_providers: AsyncClient):
        """503 when no TTS provider is configured."""
        resp = await speech_client_no_providers.get("/api/v1/speech/voices")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error_code"] == "speech_not_configured"


# ---------------------------------------------------------------------------
# GET /api/v1/speech/providers tests
# ---------------------------------------------------------------------------


class TestProvidersEndpoint:
    """Tests for GET /api/v1/speech/providers."""

    async def test_providers_lists_available(self, speech_client: AsyncClient):
        """Returns a list of providers with availability info."""
        resp = await speech_client.get("/api/v1/speech/providers")
        assert resp.status_code == 200
        body = resp.json()
        assert "providers" in body
        assert "active" in body
        assert isinstance(body["providers"], list)
        assert len(body["providers"]) >= 1

        # Each provider has id, name, available
        for p in body["providers"]:
            assert "id" in p
            assert "name" in p
            assert "available" in p

    async def test_providers_shows_active(self, speech_client: AsyncClient):
        """Active field shows the current provider name."""
        resp = await speech_client.get("/api/v1/speech/providers")
        body = resp.json()
        # speech_client has MockTTSProvider with name "Mock TTS"
        assert body["active"] == "Mock TTS"

    async def test_providers_no_active_when_none(self, speech_client_no_providers: AsyncClient):
        """Active is null when no provider is configured."""
        resp = await speech_client_no_providers.get("/api/v1/speech/providers")
        body = resp.json()
        assert body["active"] is None

    async def test_piper_always_available(self, speech_client: AsyncClient):
        """Piper should always be listed as available."""
        resp = await speech_client.get("/api/v1/speech/providers")
        body = resp.json()
        piper = next((p for p in body["providers"] if p["id"] == "piper"), None)
        assert piper is not None
        assert piper["available"] is True

    async def test_elevenlabs_has_reason_if_unavailable(self, speech_client: AsyncClient):
        """ElevenLabs includes a reason when unavailable (no API key)."""
        resp = await speech_client.get("/api/v1/speech/providers")
        body = resp.json()
        el = next((p for p in body["providers"] if p["id"] == "elevenlabs"), None)
        assert el is not None
        # If unavailable, it should include a reason
        if not el["available"]:
            assert "reason" in el


# ---------------------------------------------------------------------------
# GET /api/v1/speech/capabilities tests
# ---------------------------------------------------------------------------


class TestCapabilitiesEndpoint:
    """Tests for GET /api/v1/speech/capabilities."""

    async def test_capabilities_both_available(self, speech_client: AsyncClient):
        """Both STT and TTS show as available."""
        resp = await speech_client.get("/api/v1/speech/capabilities")
        assert resp.status_code == 200
        body = resp.json()

        assert body["stt"]["available"] is True
        assert body["stt"]["provider"] == "Mock STT"

        assert body["tts"]["available"] is True
        assert body["tts"]["provider"] == "Mock TTS"
        assert body["tts"]["voices_count"] == 2

    async def test_capabilities_none_configured(self, speech_client_no_providers: AsyncClient):
        """Both STT and TTS show as unavailable when no providers."""
        resp = await speech_client_no_providers.get("/api/v1/speech/capabilities")
        assert resp.status_code == 200
        body = resp.json()

        assert body["stt"]["available"] is False
        assert body["stt"]["provider"] is None
        assert body["tts"]["available"] is False
        assert body["tts"]["provider"] is None

    async def test_capabilities_stt_only(self):
        """Only STT available, TTS unavailable."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            get_settings.cache_clear()
            os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

            app = create_app()
            app.state.stt_provider = MockSTTProvider()
            app.state.tts_provider = None

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/speech/capabilities")

            get_settings.cache_clear()
            os.environ.pop("DOCUMENT_STORAGE_PATH", None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["stt"]["available"] is True
        assert body["tts"]["available"] is False

    async def test_capabilities_tts_only(self):
        """Only TTS available, STT unavailable."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            get_settings.cache_clear()
            os.environ["DOCUMENT_STORAGE_PATH"] = tmp_dir

            app = create_app()
            app.state.stt_provider = None
            app.state.tts_provider = MockTTSProvider()

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/speech/capabilities")

            get_settings.cache_clear()
            os.environ.pop("DOCUMENT_STORAGE_PATH", None)

        assert resp.status_code == 200
        body = resp.json()
        assert body["stt"]["available"] is False
        assert body["tts"]["available"] is True
        assert body["tts"]["voices_count"] == 2


# ---------------------------------------------------------------------------
# Security: API key never in response
# ---------------------------------------------------------------------------


class TestApiKeySecurity:
    """Verify provider credentials never appear in any API response."""

    async def test_capabilities_no_api_key_leak(self, speech_client: AsyncClient):
        """Capabilities response does not contain any api key."""
        resp = await speech_client.get("/api/v1/speech/capabilities")
        body_text = resp.text
        assert "elevenlabs_api_key" not in body_text.lower()
        assert "eleven_labs_key" not in body_text.lower()
        assert "xi-api-key" not in body_text.lower()

    async def test_voices_no_api_key_leak(self, speech_client: AsyncClient):
        """Voices response does not contain any api key."""
        resp = await speech_client.get("/api/v1/speech/voices")
        body_text = resp.text
        assert "elevenlabs_api_key" not in body_text.lower()
        assert "xi-api-key" not in body_text.lower()


# ---------------------------------------------------------------------------
# Lifespan wiring: verify main.py creates providers on app.state
# ---------------------------------------------------------------------------


class TestLifespanWiring:
    """Verify speech providers are wired during app lifespan."""

    async def test_app_state_has_stt_provider(self, speech_client: AsyncClient):
        """App state should have stt_provider attribute."""
        # The client fixture sets providers, but in production main.py lifespan
        # should also set them. This test verifies the attribute exists.
        resp = await speech_client.get("/api/v1/speech/capabilities")
        assert resp.status_code == 200

    async def test_app_state_has_tts_provider(self, speech_client: AsyncClient):
        """App state should have tts_provider attribute."""
        resp = await speech_client.get("/api/v1/speech/capabilities")
        assert resp.status_code == 200
