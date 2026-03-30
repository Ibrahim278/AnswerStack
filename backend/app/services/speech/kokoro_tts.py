"""Concrete implementation: Kokoro TTS via OpenAI-compatible API."""

from collections.abc import AsyncIterator

import httpx

from app.services.speech.tts_provider import TTSProvider, VoiceInfo


class KokoroTTSProvider(TTSProvider):
    """Kokoro TTS provider (OpenAI-compatible /v1/audio/speech endpoint).

    Connects to a locally-running Kokoro TTS server. No API key required.
    Always outputs MP3 for universal browser playback compatibility.
    """

    def __init__(
        self,
        base_url: str,
        default_voice: str = "af_bella",
    ) -> None:
        self._base_url = base_url.rstrip("/") if base_url else ""
        self._default_voice = default_voice
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        """Stream TTS audio from Kokoro.

        POSTs JSON to {base_url}/v1/audio/speech using the OpenAI-compatible
        audio speech API. Always requests MP3 output.
        """
        voice = voice_id or self._default_voice
        url = f"{self._base_url}/v1/audio/speech"
        payload = {
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
        }

        async with self._client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(4096):
                yield chunk

    async def list_voices(self) -> list[VoiceInfo]:
        """List available voices from Kokoro API.

        Falls back to a single default voice if the API is unreachable.
        """
        if not self._base_url:
            return [VoiceInfo(voice_id="af_bella", name="Bella")]

        try:
            response = await self._client.get(f"{self._base_url}/v1/audio/voices")
            response.raise_for_status()
            data = response.json()
            voices = []
            for v in data.get("voices", []):
                voices.append(
                    VoiceInfo(
                        voice_id=v.get("voice_id", v.get("id", "")),
                        name=v.get("name", ""),
                    )
                )
            return voices if voices else [VoiceInfo(voice_id="af_bella", name="Bella")]
        except Exception:
            return [VoiceInfo(voice_id="af_bella", name="Bella")]

    async def is_available(self) -> bool:
        """Available when the Kokoro server is reachable."""
        if not self._base_url:
            return False
        try:
            response = await self._client.get(f"{self._base_url}/v1/audio/voices")
            return response.status_code == 200
        except Exception:
            return False

    @property
    def provider_name(self) -> str:
        return "Kokoro TTS"

    @property
    def default_voice_id(self) -> str | None:
        return self._default_voice
