"""Concrete implementation: ElevenLabs Speech-to-Text via batch HTTP API."""

import httpx

from app.services.speech.stt_provider import STTProvider, TranscriptionResult

# ElevenLabs API base URL
_BASE_URL = "https://api.elevenlabs.io/v1"


class ElevenLabsSTTProvider(STTProvider):
    """ElevenLabs Scribe STT provider.

    Sends audio to the ElevenLabs batch speech-to-text endpoint via HTTP POST.
    The API key is sent as xi-api-key header and never exposed to the client.
    """

    def __init__(self, api_key: str, model_id: str = "scribe_v2") -> None:
        self._api_key = api_key
        self._model_id = model_id
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={"xi-api-key": self._api_key},
        )

    @staticmethod
    def _content_type_to_ext(content_type: str) -> str:
        """Map MIME content type to file extension for multipart upload."""
        mapping = {
            "audio/webm": "webm",
            "audio/mp4": "mp4",
            "audio/ogg": "ogg",
            "audio/wav": "wav",
            "audio/mpeg": "mp3",
        }
        return mapping.get(content_type, "webm")

    async def transcribe(
        self,
        audio_data: bytes,
        content_type: str,
        language_code: str = "en",
    ) -> TranscriptionResult:
        """Transcribe audio via ElevenLabs batch STT API.

        POSTs multipart form data to /v1/speech-to-text with the audio file,
        model ID, language code, and no timestamps.
        """
        ext = self._content_type_to_ext(content_type)
        filename = f"audio.{ext}"

        files = {
            "file": (filename, audio_data, content_type),
        }
        data = {
            "model_id": self._model_id,
            "language_code": language_code,
            "timestamps_granularity": "none",
        }

        response = await self._client.post(
            f"{_BASE_URL}/speech-to-text",
            files=files,
            data=data,
        )
        response.raise_for_status()

        result = response.json()
        return TranscriptionResult(
            text=result.get("text", ""),
            language_code=result.get("language_code"),
            confidence=result.get("confidence"),
        )

    async def is_available(self) -> bool:
        """Available when an API key is configured."""
        return bool(self._api_key)

    @property
    def provider_name(self) -> str:
        return "ElevenLabs Scribe"
