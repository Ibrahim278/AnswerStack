"""Factory for creating TTS providers by name.

Centralizes provider initialization logic used by the app lifespan
and by the settings API when switching providers at runtime.
"""

from pathlib import Path

import structlog

from app.core.config import Settings
from app.services.speech.tts_provider import TTSProvider

logger = structlog.get_logger()

# Provider name constants matching the config/DB values
PROVIDER_PIPER = "piper"
PROVIDER_KOKORO = "kokoro"
PROVIDER_ELEVENLABS = "elevenlabs"
PROVIDER_NONE = "none"


def create_tts_provider(
    provider_name: str,
    settings: Settings,
) -> TTSProvider | None:
    """Create a TTS provider instance by name.

    Returns None if the provider cannot be initialized (missing config, etc.).
    """
    if provider_name == PROVIDER_PIPER:
        from app.services.speech.piper_tts import PiperTTSProvider

        return PiperTTSProvider(
            model_dir=settings.piper_model_dir,
            default_voice=settings.piper_voice,
        )

    if provider_name == PROVIDER_ELEVENLABS:
        if not settings.elevenlabs_api_key:
            logger.warning("ElevenLabs TTS requested but no API key configured")
            return None

        from app.services.speech.elevenlabs_tts import ElevenLabsTTSProvider

        return ElevenLabsTTSProvider(
            api_key=settings.elevenlabs_api_key,
            model_id=settings.elevenlabs_tts_model,
            default_voice=settings.elevenlabs_tts_voice_id,
        )

    if provider_name == PROVIDER_KOKORO:
        try:
            import kokoro  # noqa: F401
        except ImportError:
            logger.warning("Kokoro TTS requested but kokoro package is not installed (pip install kokoro)")
            return None

        from app.services.speech.kokoro_tts import KokoroTTSProvider

        return KokoroTTSProvider(
            model_dir="data/kokoro",
            default_voice=settings.kokoro_voice,
        )

    return None


def list_available_providers(settings: Settings) -> list[dict]:
    """Return a list of TTS providers that can be initialized.

    Each entry has: id, name, available (bool), reason (if not available).
    """
    providers = []

    # Piper — always available (downloads voices on demand)
    providers.append({
        "id": PROVIDER_PIPER,
        "name": "Piper TTS",
        "available": True,
    })

    # Kokoro — hidden from UI selection due to high memory cost (~1 GB PyTorch).
    # Uncomment to re-enable in the settings UI.
    # kokoro_available = False
    # try:
    #     import kokoro  # noqa: F401
    #     kokoro_available = True
    # except ImportError:
    #     pass
    # providers.append({
    #     "id": PROVIDER_KOKORO,
    #     "name": "Kokoro TTS",
    #     "available": kokoro_available,
    #     **({"reason": "kokoro package not installed"} if not kokoro_available else {}),
    # })

    # ElevenLabs — available if API key is configured
    has_key = bool(settings.elevenlabs_api_key)
    providers.append({
        "id": PROVIDER_ELEVENLABS,
        "name": "ElevenLabs TTS",
        "available": has_key,
        **({"reason": "ELEVENLABS_API_KEY not configured"} if not has_key else {}),
    })

    return providers


def wrap_with_caching(provider: TTSProvider) -> TTSProvider:
    """Wrap a TTS provider with the caching decorator."""
    from app.services.speech.caching_tts import CachingTTSProvider

    return CachingTTSProvider(provider)
