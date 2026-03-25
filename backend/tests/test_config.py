from app.core.config import Settings


def test_settings_from_env():
    """SEC-01: Settings load from environment variables, not hardcoded."""
    # Settings should load with defaults when no env vars set
    settings = Settings()
    assert settings.app_name == "AnswerStack"
    assert settings.database_url == "sqlite+aiosqlite:///data/answerstack.db"


def test_settings_override_from_env(monkeypatch):
    """SEC-01: Environment variables override default settings."""
    monkeypatch.setenv("APP_NAME", "CustomName")
    monkeypatch.setenv("DEBUG", "true")
    settings = Settings()
    assert settings.app_name == "CustomName"
    assert settings.debug is True


def test_settings_fields_exist():
    """SEC-01: All expected configuration fields are present."""
    settings = Settings()
    assert hasattr(settings, "app_name")
    assert hasattr(settings, "debug")
    assert hasattr(settings, "log_json")
    assert hasattr(settings, "database_url")
    assert hasattr(settings, "host")
    assert hasattr(settings, "port")
