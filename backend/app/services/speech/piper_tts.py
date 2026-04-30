"""Concrete implementation: local Piper TTS runtime."""

import json
import time
from collections.abc import AsyncIterator
from io import BytesIO
from pathlib import Path
import subprocess
from typing import BinaryIO
from urllib.request import urlopen
import wave

import numpy as np
from piper.download_voices import download_voice, VOICES_JSON
from piper.voice import PiperVoice

import structlog

from app.services.speech._streaming import pcm_to_mp3_stream
from app.services.speech.tts_provider import TTSProvider, VoiceInfo

# Module-level cache for the Piper voice catalog (fetched from URL).
# Avoids hitting the network on every list_voices() call.
_catalog_cache: dict | None = None
_catalog_cache_time: float = 0
_CATALOG_TTL = 3600  # 1 hour

logger = structlog.get_logger()


class PiperTTSProvider(TTSProvider):
    """Piper TTS provider backed by a local ONNX voice model."""

    def __init__(
        self,
        model_dir: str,
        default_voice: str = "en_US-lessac-medium",
        streaming: bool = True,
    ) -> None:
        self._model_dir = Path(model_dir)
        self._default_voice = default_voice
        self._streaming = streaming
        self._voice_cache: dict[str, PiperVoice] = {}

    def _voice_paths(self, voice_id: str) -> tuple[Path, Path]:
        model_path = self._model_dir / f"{voice_id}.onnx"
        config_path = self._model_dir / f"{voice_id}.onnx.json"
        return model_path, config_path

    def _ensure_voice_downloaded(self, voice_id: str) -> tuple[Path, Path]:
        self._model_dir.mkdir(parents=True, exist_ok=True)
        model_path, config_path = self._voice_paths(voice_id)
        if not model_path.exists() or not config_path.exists():
            download_voice(voice_id, self._model_dir)
        return model_path, config_path

    def _load_voice(self, voice_id: str) -> PiperVoice:
        voice = self._voice_cache.get(voice_id)
        if voice is not None:
            return voice

        model_path, config_path = self._ensure_voice_downloaded(voice_id)
        voice = PiperVoice.load(
            model_path=model_path,
            config_path=config_path,
            download_dir=self._model_dir,
        )
        self._voice_cache[voice_id] = voice
        return voice

    @staticmethod
    def _wav_to_mp3_bytes(wav_bytes: bytes) -> bytes:
        result = subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "mp3",
                "pipe:1",
            ],
            input=wav_bytes,
            capture_output=True,
            check=True,
        )
        return result.stdout

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
        output_format: str = "mp3_44100_128",
    ) -> AsyncIterator[bytes]:
        if self._streaming:
            async for chunk in self._synthesize_streaming(text, voice_id):
                yield chunk
        else:
            async for chunk in self._synthesize_batch(text, voice_id):
                yield chunk

    async def _synthesize_batch(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Original batch implementation: generate all audio, then convert."""
        selected_voice = voice_id or self._default_voice
        voice = self._load_voice(selected_voice)

        wav_buffer = BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)

        mp3_bytes = self._wav_to_mp3_bytes(wav_buffer.getvalue())
        chunk_size = 4096
        for idx in range(0, len(mp3_bytes), chunk_size):
            yield mp3_bytes[idx : idx + chunk_size]

    async def _synthesize_streaming(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Streaming implementation: yield MP3 chunks as sentences are synthesized."""
        selected_voice = voice_id or self._default_voice
        voice = self._load_voice(selected_voice)
        sample_rate = voice.config.sample_rate

        def feed_pcm(stdin: BinaryIO) -> None:
            for chunk in voice.synthesize(text):
                pcm = np.clip(
                    chunk.audio_float_array * 32767, -32768, 32767
                ).astype(np.int16).tobytes()
                stdin.write(pcm)
                stdin.flush()

        async for chunk in pcm_to_mp3_stream(feed_pcm, sample_rate=sample_rate):
            yield chunk

    @staticmethod
    def _get_catalog() -> dict | None:
        """Fetch and cache the Piper voice catalog from the network."""
        global _catalog_cache, _catalog_cache_time
        now = time.time()
        if _catalog_cache is not None and now - _catalog_cache_time < _CATALOG_TTL:
            return _catalog_cache
        try:
            with urlopen(VOICES_JSON, timeout=5) as response:
                _catalog_cache = json.load(response)
            _catalog_cache_time = now
            return _catalog_cache
        except Exception:
            logger.debug("Failed to fetch Piper voice catalog")
            # Return stale cache if available
            if _catalog_cache is not None:
                return _catalog_cache
            return None

    @staticmethod
    def _format_voice_name(voice_id: str) -> str:
        """Turn 'en_US-lessac-medium' into 'Lessac (en_US, medium)'."""
        parts = voice_id.split("-")
        if len(parts) >= 2:
            locale = parts[0]
            name = parts[1].replace("_", " ").title()
            quality = parts[2] if len(parts) >= 3 else ""
            suffix = f" ({locale}, {quality})" if quality else f" ({locale})"
            return f"{name}{suffix}"
        return voice_id

    async def list_voices(self) -> list[VoiceInfo]:
        """List all available Piper voices from the online catalog.

        Falls back to local .onnx files if the catalog can't be fetched.
        Downloaded voices are marked in labels for the UI to distinguish.
        """
        local_ids: set[str] = set()
        if self._model_dir.exists():
            for path in self._model_dir.glob("*.onnx"):
                local_ids.add(path.stem)

        # Try to get the catalog (cached for 1 hour)
        catalog = self._get_catalog()
        if catalog is not None:
            voices = []
            for voice_id in sorted(catalog.keys()):
                downloaded = voice_id in local_ids
                voices.append(VoiceInfo(
                    voice_id=voice_id,
                    name=self._format_voice_name(voice_id),
                    labels={"downloaded": "true"} if downloaded else None,
                ))
            return voices

        # Fallback: list local voices only
        voices = []
        for voice_id in sorted(local_ids):
            voices.append(VoiceInfo(
                voice_id=voice_id,
                name=self._format_voice_name(voice_id),
                labels={"downloaded": "true"},
            ))
        return voices or [VoiceInfo(
            voice_id=self._default_voice,
            name=self._format_voice_name(self._default_voice),
        )]

    async def is_available(self) -> bool:
        """Available when the local Piper runtime can load the configured voice."""
        try:
            self._load_voice(self._default_voice)
            return True
        except Exception:
            return False

    @property
    def provider_name(self) -> str:
        return "Piper TTS"

    @property
    def default_voice_id(self) -> str | None:
        return self._default_voice
