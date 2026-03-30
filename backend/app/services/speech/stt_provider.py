"""Port: Speech-to-Text provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class TranscriptionResult:
    """Result of a speech-to-text transcription."""

    text: str
    language_code: str | None = None
    confidence: float | None = None


class STTProvider(ABC):
    """Port: Speech-to-Text provider interface.

    Implementations proxy audio to a backend service (e.g. ElevenLabs)
    and return a text transcription. The API key never leaves the server.
    """

    @abstractmethod
    async def transcribe(
        self,
        audio_data: bytes,
        content_type: str,
        language_code: str = "en",
    ) -> TranscriptionResult:
        """Transcribe audio bytes to text.

        Args:
            audio_data: Raw audio bytes (webm, mp4, ogg, wav, mp3).
            content_type: MIME type of the audio (e.g. "audio/webm").
            language_code: BCP-47 language code hint (e.g. "en").

        Returns:
            TranscriptionResult with transcribed text and metadata.
        """
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is configured and reachable."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name for status display."""
        ...
