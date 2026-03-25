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
    chunk_size: int = 4000
    chunk_overlap: int = 800
    max_upload_size_mb: int = 50
    document_storage_path: str = "data/documents"


@lru_cache
def get_settings() -> Settings:
    return Settings()
