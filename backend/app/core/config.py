from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
