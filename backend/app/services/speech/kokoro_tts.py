"""Concrete implementation: local Kokoro TTS runtime."""

from collections.abc import AsyncIterator
from io import BytesIO
from pathlib import Path
import subprocess
from typing import BinaryIO
import wave

import numpy as np
from kokoro import KPipeline

from app.services.speech._streaming import pcm_to_mp3_stream
from app.services.speech.tts_provider import TTSProvider, VoiceInfo

_SAMPLE_RATE = 24000


class KokoroTTSProvider(TTSProvider):
    """Kokoro TTS provider backed by the local Python runtime."""

    def __init__(
        self,
        model_dir: str,
        default_voice: str = "af_bella",
        streaming: bool = True,
    ) -> None:
        self._model_dir = Path(model_dir)
        self._default_voice = default_voice
        self._streaming = streaming
        self._pipelines: dict[str, KPipeline] = {}

    @staticmethod
    def _voice_language_code(voice_id: str) -> str:
        return voice_id[0].lower()

    def _get_pipeline(self, voice_id: str) -> KPipeline:
        lang_code = self._voice_language_code(voice_id)
        pipeline = self._pipelines.get(lang_code)
        if pipeline is None:
            self._model_dir.mkdir(parents=True, exist_ok=True)
            pipeline = KPipeline(lang_code=lang_code, device="cpu")
            self._pipelines[lang_code] = pipeline
        return pipeline

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
        pipeline = self._get_pipeline(selected_voice)

        wav_buffer = BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(_SAMPLE_RATE)

            for result in pipeline(text, voice=selected_voice, speed=1, split_pattern=r"\n+"):
                if result.audio is None:
                    continue
                audio_bytes = (result.audio.numpy() * 32767).astype(np.int16).tobytes()
                wav_file.writeframes(audio_bytes)

        mp3_bytes = self._wav_to_mp3_bytes(wav_buffer.getvalue())
        chunk_size = 4096
        for idx in range(0, len(mp3_bytes), chunk_size):
            yield mp3_bytes[idx : idx + chunk_size]

    async def _synthesize_streaming(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Streaming implementation: yield MP3 chunks as segments are synthesized."""
        selected_voice = voice_id or self._default_voice
        pipeline = self._get_pipeline(selected_voice)

        def feed_pcm(stdin: BinaryIO) -> None:
            for result in pipeline(
                text,
                voice=selected_voice,
                speed=1,
                split_pattern=r"[.!?;:,\n]+\s*",
            ):
                if result.audio is None:
                    continue
                pcm = (result.audio.numpy() * 32767).astype(np.int16).tobytes()
                stdin.write(pcm)
                stdin.flush()

        async for chunk in pcm_to_mp3_stream(feed_pcm, sample_rate=_SAMPLE_RATE):
            yield chunk

    # Language code prefixes for human-readable labels
    _LANG_LABELS = {
        "a": "American English",
        "b": "British English",
        "e": "Spanish",
        "f": "French",
        "h": "Hindi",
        "i": "Italian",
        "j": "Japanese",
        "p": "Portuguese",
        "z": "Chinese",
    }

    async def list_voices(self) -> list[VoiceInfo]:
        """List all known Kokoro-82M voices.

        Voices are downloaded on demand when first used for synthesis, so
        this returns the full catalog regardless of what's locally cached.
        """
        known_voices = [
            "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica",
            "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
            "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam",
            "am_michael", "am_onyx", "am_puck", "am_santa",
            "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
            "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
            "ef_dora", "em_alex", "em_santa",
            "ff_siwis",
            "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
            "if_sara", "im_nicola",
            "jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro", "jm_kumo",
            "pf_dora", "pm_alex", "pm_santa",
            "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi",
            "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
        ]
        return [self._voice_info(vid) for vid in known_voices]

    def _voice_info(self, voice_id: str) -> VoiceInfo:
        """Create a VoiceInfo with a human-readable name from a voice_id."""
        # voice_id format: {lang_code}{gender}_{name}
        # e.g., "af_bella" -> lang_code="a", gender="f", name="bella"
        parts = voice_id.split("_", 1)
        if len(parts) == 2 and len(parts[0]) >= 2:
            prefix = parts[0]
            raw_name = parts[1].replace("_", " ").title()
            lang = self._LANG_LABELS.get(prefix[0], "")
            gender = "Female" if prefix[1] == "f" else "Male" if prefix[1] == "m" else ""
            label_parts = [s for s in [lang, gender] if s]
            labels = {"language": lang, "gender": gender} if label_parts else None
            display = f"{raw_name} ({', '.join(label_parts)})" if label_parts else raw_name
            return VoiceInfo(voice_id=voice_id, name=display, labels=labels)
        return VoiceInfo(voice_id=voice_id, name=voice_id.replace("_", " ").title())

    async def is_available(self) -> bool:
        """Available when the local Kokoro runtime can initialize."""
        try:
            self._get_pipeline(self._default_voice)
            return True
        except Exception:
            return False

    @property
    def provider_name(self) -> str:
        return "Kokoro TTS"

    @property
    def default_voice_id(self) -> str | None:
        return self._default_voice
