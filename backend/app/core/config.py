from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
    )

    # Application
    app_name: str = "AnswerStack"
    debug: bool = False
    log_json: bool = True

    # Database
    database_url: str = "sqlite+aiosqlite:///data/answerstack.db"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Document processing
    chunk_size: int = 2200
    chunk_overlap: int = 250
    max_upload_size_mb: int = 50
    document_storage_path: str = "data/documents"

    # Provider defaults (overridden at runtime via DB settings table)
    default_provider_url: str = "http://192.168.144.39:1234/v1"
    default_provider_api_key: str = "sk-lm-aHharLT6:S8j7cVihb8pl99jesQk7"
    default_provider_model: str = "zai-org/glm-4.7-flash"
    default_embedding_model: str = "text-embedding-qwen3-embedding-4b@q8_0"

    # Speech providers
    elevenlabs_api_key: str = Field("", validation_alias=AliasChoices("ELEVEN_LABS_KEY", "ELEVENLABS_API_KEY"))
    tts_provider: str = "elevenlabs"  # "elevenlabs" | "kokoro" | "none"
    stt_provider: str = "elevenlabs"  # "elevenlabs" | "none"
    elevenlabs_tts_model: str = "eleven_multilingual_v2"
    elevenlabs_tts_voice_id: str = ""  # empty = use first available
    elevenlabs_stt_model: str = "scribe_v2"
    kokoro_base_url: str = ""  # e.g. "http://localhost:8880"
    kokoro_voice: str = "af_bella"


@lru_cache
def get_settings() -> Settings:
    return Settings()
