"""Speech API endpoints: transcribe, synthesize, voices, capabilities.

These endpoints proxy speech requests to backend-configured providers
(ElevenLabs, Kokoro) so the API key stays server-side and speech works
cross-browser.
"""

import structlog
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import httpx

from app.core.errors import AppError

logger = structlog.get_logger()

router = APIRouter(prefix="/speech", tags=["speech"])


class SynthesizeRequest(BaseModel):
    """Request body for text-to-speech synthesis."""

    text: str
    voice_id: str | None = None


# ---------------------------------------------------------------------------
# POST /speech/transcribe
# ---------------------------------------------------------------------------


@router.post("/transcribe")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    language_code: str = Form("en"),
):
    """Transcribe uploaded audio to text via the configured STT provider.

    Accepts multipart file upload (webm, mp4, ogg, wav, mp3) and returns
    JSON with the transcribed text.
    """
    stt_provider = getattr(request.app.state, "stt_provider", None)
    if stt_provider is None:
        raise AppError(
            error_code="speech_not_configured",
            message="Speech-to-text is not configured. Set ELEVENLABS_API_KEY to enable.",
            status_code=503,
            retryable=False,
            suggested_action="Configure an ElevenLabs API key in environment variables.",
        )

    audio_data = await file.read()
    content_type = file.content_type or "audio/webm"

    try:
        result = await stt_provider.transcribe(
            audio_data=audio_data,
            content_type=content_type,
            language_code=language_code,
        )
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Speech provider HTTP error",
            provider=stt_provider.provider_name,
            status_code=exc.response.status_code,
        )
        raise AppError(
            error_code="speech_provider_error",
            message=f"Speech provider returned error: {exc.response.status_code}",
            status_code=502,
            retryable=True,
            suggested_action="Check ElevenLabs API key and quota.",
        )
    except Exception as exc:
        logger.exception(
            "Speech transcription failed",
            provider=stt_provider.provider_name,
            error=str(exc),
        )
        raise AppError(
            error_code="speech_provider_error",
            message="Speech transcription failed unexpectedly.",
            status_code=502,
            retryable=True,
            suggested_action="Try again. If the problem persists, check provider configuration.",
        )

    return {"text": result.text, "language_code": result.language_code}


# ---------------------------------------------------------------------------
# POST /speech/synthesize
# ---------------------------------------------------------------------------


@router.post("/synthesize")
async def synthesize_speech(
    request: Request,
    body: SynthesizeRequest,
):
    """Synthesize text to speech via the configured TTS provider.

    Returns a streaming audio/mpeg response.
    """
    tts_provider = getattr(request.app.state, "tts_provider", None)
    if tts_provider is None:
        raise AppError(
            error_code="speech_not_configured",
            message="Text-to-speech is not configured. Set ELEVENLABS_API_KEY to enable.",
            status_code=503,
            retryable=False,
            suggested_action="Configure a TTS provider in environment variables.",
        )

    if not body.text.strip():
        raise AppError(
            error_code="speech_validation_error",
            message="Text is required for synthesis.",
            status_code=400,
            retryable=False,
            suggested_action="Provide non-empty text to synthesize.",
        )

    return StreamingResponse(
        tts_provider.synthesize_stream(text=body.text, voice_id=body.voice_id),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline"},
    )


# ---------------------------------------------------------------------------
# GET /speech/voices
# ---------------------------------------------------------------------------


@router.get("/voices")
async def list_voices(request: Request):
    """List available TTS voices from the configured provider."""
    tts_provider = getattr(request.app.state, "tts_provider", None)
    if tts_provider is None:
        raise AppError(
            error_code="speech_not_configured",
            message="Text-to-speech is not configured. Set ELEVENLABS_API_KEY to enable.",
            status_code=503,
            retryable=False,
            suggested_action="Configure a TTS provider in environment variables.",
        )

    voices = await tts_provider.list_voices()
    return {
        "voices": [
            {"voice_id": v.voice_id, "name": v.name, "labels": v.labels}
            for v in voices
        ]
    }


# ---------------------------------------------------------------------------
# GET /speech/capabilities
# ---------------------------------------------------------------------------


@router.get("/capabilities")
async def get_capabilities(request: Request):
    """Return STT/TTS availability based on configured providers.

    This endpoint always returns 200 -- it reports the system's speech
    capability state rather than failing.
    """
    stt_provider = getattr(request.app.state, "stt_provider", None)
    tts_provider = getattr(request.app.state, "tts_provider", None)

    stt_info: dict = {"available": False, "provider": None}
    tts_info: dict = {"available": False, "provider": None, "voices_count": 0}

    if stt_provider is not None:
        try:
            if await stt_provider.is_available():
                stt_info = {"available": True, "provider": stt_provider.provider_name}
        except Exception:
            pass

    if tts_provider is not None:
        try:
            if await tts_provider.is_available():
                try:
                    voices = await tts_provider.list_voices()
                    voices_count = len(voices)
                except Exception:
                    voices_count = 0
                tts_info = {
                    "available": True,
                    "provider": tts_provider.provider_name,
                    "voices_count": voices_count,
                }
        except Exception:
            pass

    return {"stt": stt_info, "tts": tts_info}
