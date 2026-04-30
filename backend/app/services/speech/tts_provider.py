"""Port: Text-to-Speech provider interface."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass
class VoiceInfo:
    """Information about an available TTS voice."""

    voice_id: str
    name: str
    labels: dict[str, str] | None = None


class TTSProvider(ABC):
    """Port: Text-to-Speech provider interface.

    Implementations proxy text to a backend TTS service and stream
    audio bytes back. The API key never leaves the server.
    """

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        """Stream audio bytes from text.

        Args:
            text: Text to synthesize.
            voice_id: Voice identifier. If None, uses default_voice_id.
            output_format: Audio format specifier (provider-specific).

        Yields:
            Chunks of audio data (typically MP3).
        """
        ...

    @abstractmethod
    async def list_voices(self) -> list[VoiceInfo]:
        """List available voices from the provider."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is configured and reachable."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name."""
        ...

    @property
    @abstractmethod
    def default_voice_id(self) -> str | None:
        """Default voice ID, or None if voices must be explicitly selected."""
        ...
