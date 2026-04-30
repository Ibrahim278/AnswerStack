from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env paths relative to the project root, not the working directory.
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
_PROJECT_ROOT = _BACKEND_DIR.parent
_ENV_FILES = tuple(
    str(p) for p in (_PROJECT_ROOT / ".env", _BACKEND_DIR / ".env") if p.exists()
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
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

    # ChromaDB
    chromadb_path: str = "data/chromadb"

    # Speech providers
    elevenlabs_api_key: str = Field("", validation_alias=AliasChoices("ELEVEN_LABS_KEY", "ELEVENLABS_API_KEY"))
    tts_provider: str = "piper"  # "piper" | "elevenlabs" | "kokoro" | "none"
    stt_provider: str = "elevenlabs"  # "elevenlabs" | "none"
    elevenlabs_tts_model: str = "eleven_multilingual_v2"
    elevenlabs_tts_voice_id: str = ""  # empty = use first available
    elevenlabs_stt_model: str = "scribe_v2"
    kokoro_base_url: str = ""  # e.g. "http://localhost:8880"
    kokoro_voice: str = "af_bella"
    piper_model_dir: str = "data/piper"
    piper_voice: str = "en_US-lessac-medium"


@lru_cache
def get_settings() -> Settings:
    return Settings()
