"""Speech API endpoints: transcribe, synthesize, voices, capabilities.

These endpoints proxy speech requests to backend-configured providers
(ElevenLabs, Piper, Kokoro) so credentials stay server-side and speech works
cross-browser.
"""

import time
import uuid

import structlog
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import httpx

from app.core.errors import AppError

logger = structlog.get_logger()

router = APIRouter(prefix="/speech", tags=["speech"])

# Short-lived token store for GET-based streaming.
# Tokens are single-use and expire after _TOKEN_TTL seconds.
_synthesis_tokens: dict[str, dict] = {}
_TOKEN_TTL = 60


class SynthesizeRequest(BaseModel):
    """Request body for text-to-speech synthesis."""

    text: str
    voice_id: str | None = None


def _extract_provider_error_message(exc: httpx.HTTPStatusError) -> str:
    try:
        body = exc.response.json()
    except Exception:
        body = None

    if isinstance(body, dict):
        detail = body.get("detail")
        if isinstance(detail, dict):
            message = detail.get("message")
            if message:
                return str(message)
        message = body.get("message")
        if message:
            return str(message)

    return f"Speech provider returned error: {exc.response.status_code}"


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
# POST /speech/synthesize/prepare  +  GET /speech/synthesize/stream/{token}
#
# Two-step flow for progressive <audio> playback:
#   1. POST the text → get a short-lived token + GET URL
#   2. Set <audio src="{url}"> → browser streams and plays incrementally
# ---------------------------------------------------------------------------


@router.post("/synthesize/prepare")
async def prepare_synthesis(
    request: Request,
    body: SynthesizeRequest,
):
    """Create a short-lived token for GET-based audio streaming.

    Returns a token and the GET URL the client can assign to an <audio>
    element's src for progressive playback.
    """
    tts_provider = getattr(request.app.state, "tts_provider", None)
    if tts_provider is None:
        raise AppError(
            error_code="speech_not_configured",
            message="Text-to-speech is not configured. Set a TTS provider in environment variables.",
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

    # Evict expired tokens
    now = time.time()
    expired = [k for k, v in _synthesis_tokens.items() if now - v["created_at"] > _TOKEN_TTL]
    for k in expired:
        del _synthesis_tokens[k]

    # Use explicit voice_id from request, fall back to persisted setting
    voice_id = body.voice_id
    if not voice_id:
        voice_id = getattr(request.app.state, "tts_default_voice_id", "") or None

    token = uuid.uuid4().hex
    _synthesis_tokens[token] = {
        "text": body.text,
        "voice_id": voice_id,
        "created_at": now,
    }

    return {"token": token, "url": f"/api/v1/speech/synthesize/stream/{token}"}


@router.get("/synthesize/stream/{token}")
async def stream_synthesis(request: Request, token: str):
    """Stream synthesized audio for a previously prepared token.

    Designed to be used as <audio src="..."> so the browser handles
    progressive MP3 buffering and playback natively.
    """
    params = _synthesis_tokens.pop(token, None)
    if params is None:
        raise AppError(
            error_code="speech_token_invalid",
            message="Synthesis token is invalid or expired.",
            status_code=404,
            retryable=False,
            suggested_action="Request a new synthesis token.",
        )

    tts_provider = getattr(request.app.state, "tts_provider", None)
    if tts_provider is None:
        raise AppError(
            error_code="speech_not_configured",
            message="Text-to-speech is not configured.",
            status_code=503,
            retryable=False,
            suggested_action="Configure a TTS provider in environment variables.",
        )

    stream = tts_provider.synthesize_stream(
        text=params["text"], voice_id=params["voice_id"]
    )
    iterator = stream.__aiter__()

    try:
        first_chunk = await anext(iterator)
    except StopAsyncIteration:
        raise AppError(
            error_code="speech_provider_error",
            message="Speech provider returned no audio data.",
            status_code=502,
            retryable=True,
            suggested_action="Try again.",
        )
    except httpx.HTTPStatusError as exc:
        message = _extract_provider_error_message(exc)
        raise AppError(
            error_code="speech_provider_error",
            message=message,
            status_code=502,
            retryable=exc.response.status_code >= 500,
            suggested_action="Check TTS provider configuration.",
        )
    except Exception as exc:
        logger.exception("Speech synthesis failed", error=str(exc))
        raise AppError(
            error_code="speech_provider_error",
            message="Speech synthesis failed unexpectedly.",
            status_code=502,
            retryable=True,
            suggested_action="Try again.",
        )

    async def audio_stream():
        yield first_chunk
        async for chunk in iterator:
            yield chunk

    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline"},
    )


# ---------------------------------------------------------------------------
# GET /speech/voices
# ---------------------------------------------------------------------------


@router.get("/voices")
async def list_voices(request: Request, provider: str | None = None):
    """List available TTS voices.

    If ``provider`` is given (e.g. ``?provider=kokoro``), creates a temporary
    provider to list its voices — useful when the user is previewing a
    provider switch that hasn't been saved yet.  Otherwise lists voices from
    the currently active provider.
    """
    from app.services.speech.tts_factory import create_tts_provider

    target_provider = None

    if provider:
        env_settings = getattr(request.app.state, "settings", None)
        if env_settings is not None:
            target_provider = create_tts_provider(provider, env_settings)

    if target_provider is None and not provider:
        target_provider = getattr(request.app.state, "tts_provider", None)

    if target_provider is None:
        raise AppError(
            error_code="speech_not_configured",
            message="Text-to-speech is not configured. Set a TTS provider in environment variables.",
            status_code=503,
            retryable=False,
            suggested_action="Configure a TTS provider in environment variables.",
        )

    voices = await target_provider.list_voices()
    return {
        "voices": [
            {"voice_id": v.voice_id, "name": v.name, "labels": v.labels}
            for v in voices
        ]
    }


# ---------------------------------------------------------------------------
# GET /speech/providers
# ---------------------------------------------------------------------------


@router.get("/providers")
async def list_providers(request: Request):
    """List available TTS providers and which one is active.

    Returns providers that can be initialized based on current server config
    (installed packages, API keys, etc.) and the currently active provider.
    """
    from app.services.speech.tts_factory import list_available_providers

    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        return {"providers": [], "active": None}

    providers = list_available_providers(settings)
    tts_provider = getattr(request.app.state, "tts_provider", None)
    active = tts_provider.provider_name if tts_provider else None

    return {"providers": providers, "active": active}


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
