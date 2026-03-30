"""Concrete implementation: ElevenLabs Text-to-Speech via HTTP streaming API."""

from collections.abc import AsyncIterator

import httpx

from app.services.speech.tts_provider import TTSProvider, VoiceInfo

# ElevenLabs API base URL
_BASE_URL = "https://api.elevenlabs.io"

# Well-known ElevenLabs voice IDs — used as fallback when no default is configured
# and list_voices() is unavailable (e.g. restricted API key permissions).
_FALLBACK_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # "George" — clear male English voice


class ElevenLabsTTSProvider(TTSProvider):
    """ElevenLabs TTS provider.

    Streams audio from the ElevenLabs text-to-speech endpoint.
    The API key is sent as xi-api-key header and never exposed to the client.
    """

    def __init__(
        self,
        api_key: str,
        model_id: str = "eleven_multilingual_v2",
        default_voice: str = "",
    ) -> None:
        self._api_key = api_key
        self._model_id = model_id
        self._default_voice = default_voice
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={"xi-api-key": self._api_key},
        )

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        """Stream TTS audio from ElevenLabs.

        POSTs JSON to /v1/text-to-speech/{voice_id}/stream and yields
        audio chunks as they arrive.
        """
        vid = voice_id or self._default_voice
        if not vid:
            # Auto-select first available voice, fall back to well-known ID
            try:
                voices = await self.list_voices()
                if voices:
                    vid = voices[0].voice_id
            except Exception:
                pass
            if not vid:
                vid = _FALLBACK_VOICE_ID

        url = f"{_BASE_URL}/v1/text-to-speech/{vid}/stream"
        payload = {
            "text": text,
            "model_id": self._model_id,
        }
        params = {"output_format": output_format}

        async with self._client.stream(
            "POST",
            url,
            json=payload,
            params=params,
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(4096):
                yield chunk

    async def list_voices(self) -> list[VoiceInfo]:
        """List available voices from ElevenLabs API.

        GETs /v1/voices and returns a list of VoiceInfo objects.
        Returns empty list if the API key lacks voices_read permission.
        """
        response = await self._client.get(f"{_BASE_URL}/v1/voices")
        response.raise_for_status()

        data = response.json()
        voices = []
        for v in data.get("voices", []):
            voices.append(
                VoiceInfo(
                    voice_id=v["voice_id"],
                    name=v["name"],
                    labels=v.get("labels"),
                )
            )
        return voices

    async def is_available(self) -> bool:
        """Available when an API key is configured."""
        return bool(self._api_key)

    @property
    def provider_name(self) -> str:
        return "ElevenLabs TTS"

    @property
    def default_voice_id(self) -> str | None:
        return self._default_voice or None
