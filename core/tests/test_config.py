"""Tests for RAGConfig dataclass.

Covers required fields, defaults, and custom overrides.
"""

import pytest

from answerstack.config import RAGConfig


class TestRAGConfig:
    def test_minimal_construction(self):
        """RAGConfig can be created with only required fields."""
        config = RAGConfig(provider_url="http://localhost:1234/v1", data_dir="./data")
        assert config.provider_url == "http://localhost:1234/v1"
        assert config.data_dir == "./data"

    def test_missing_provider_url_raises(self):
        """provider_url is required -- omitting it raises TypeError."""
        with pytest.raises(TypeError):
            RAGConfig(data_dir="./data")  # type: ignore[call-arg]

    def test_missing_data_dir_raises(self):
        """data_dir is required -- omitting it raises TypeError."""
        with pytest.raises(TypeError):
            RAGConfig(provider_url="http://localhost:1234/v1")  # type: ignore[call-arg]

    def test_missing_both_required_raises(self):
        """Both required fields missing raises TypeError."""
        with pytest.raises(TypeError):
            RAGConfig()  # type: ignore[call-arg]

    def test_default_values(self):
        """All optional fields have expected default values."""
        config = RAGConfig(provider_url="http://localhost:1234/v1", data_dir="./data")
        assert config.provider_api_key == "not-needed"
        assert config.provider_model == ""
        assert config.embedding_model == ""
        assert config.chunk_size == 2200
        assert config.chunk_overlap == 250
        assert config.top_k == 5
        assert config.initial_k == 20
        assert config.similarity_threshold == 0.3
        assert config.temperature == 0.7
        assert config.reranker_enabled is False
        assert config.reasoning_effort == "none"
        assert config.max_completion_tokens is None
        assert "research assistant" in config.system_prompt
        assert "[Source N]" in config.system_prompt

    def test_custom_overrides(self):
        """All fields can be set to non-default values."""
        config = RAGConfig(
            provider_url="http://remote:8080/v1",
            data_dir="/tmp/chromadb",
            provider_api_key="sk-test-key",
            provider_model="gpt-4",
            embedding_model="text-embedding-3-small",
            chunk_size=1000,
            chunk_overlap=100,
            top_k=10,
            initial_k=50,
            similarity_threshold=0.5,
            temperature=0.2,
            reranker_enabled=False,
            reasoning_effort="high",
            max_completion_tokens=4096,
            system_prompt="Custom system prompt",
        )
        assert config.provider_url == "http://remote:8080/v1"
        assert config.data_dir == "/tmp/chromadb"
        assert config.provider_api_key == "sk-test-key"
        assert config.provider_model == "gpt-4"
        assert config.embedding_model == "text-embedding-3-small"
        assert config.chunk_size == 1000
        assert config.chunk_overlap == 100
        assert config.top_k == 10
        assert config.initial_k == 50
        assert config.similarity_threshold == 0.5
        assert config.temperature == 0.2
        assert config.reranker_enabled is False
        assert config.reasoning_effort == "high"
        assert config.max_completion_tokens == 4096
        assert config.system_prompt == "Custom system prompt"

    def test_is_dataclass(self):
        """RAGConfig is a proper dataclass."""
        import dataclasses
        assert dataclasses.is_dataclass(RAGConfig)

    def test_equality(self):
        """Two configs with same values are equal."""
        a = RAGConfig(provider_url="http://x/v1", data_dir="./d")
        b = RAGConfig(provider_url="http://x/v1", data_dir="./d")
        assert a == b

    def test_inequality(self):
        """Two configs with different values are not equal."""
        a = RAGConfig(provider_url="http://x/v1", data_dir="./d")
        b = RAGConfig(provider_url="http://y/v1", data_dir="./d")
        assert a != b

    def test_repr_contains_fields(self):
        """repr() includes key field values."""
        config = RAGConfig(provider_url="http://localhost:1234/v1", data_dir="./data")
        r = repr(config)
        assert "provider_url" in r
        assert "data_dir" in r


class TestRAGConfigFromEnv:
    """Tests for RAGConfig.from_env() classmethod."""

    def test_from_env_reads_env_vars(self, monkeypatch):
        """from_env() reads PROVIDER_URL and DATA_DIR from environment."""
        monkeypatch.setenv("PROVIDER_URL", "http://env-host:1234/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/env-data")
        config = RAGConfig.from_env()
        assert config.provider_url == "http://env-host:1234/v1"
        assert config.data_dir == "/tmp/env-data"

    def test_from_env_reads_optional_fields(self, monkeypatch):
        """from_env() reads optional fields like CHUNK_SIZE, TEMPERATURE."""
        monkeypatch.setenv("PROVIDER_URL", "http://x/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/d")
        monkeypatch.setenv("CHUNK_SIZE", "500")
        monkeypatch.setenv("TEMPERATURE", "0.1")
        monkeypatch.setenv("TOP_K", "10")
        monkeypatch.setenv("RERANKER_ENABLED", "true")
        config = RAGConfig.from_env()
        assert config.chunk_size == 500
        assert config.temperature == 0.1
        assert config.top_k == 10
        assert config.reranker_enabled is True

    def test_from_env_overrides_beat_env_vars(self, monkeypatch):
        """Explicit overrides take priority over env vars."""
        monkeypatch.setenv("PROVIDER_URL", "http://env/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/env")
        monkeypatch.setenv("CHUNK_SIZE", "500")
        config = RAGConfig.from_env(chunk_size=999)
        assert config.chunk_size == 999
        assert config.provider_url == "http://env/v1"

    def test_from_env_overrides_can_supply_required_fields(self):
        """Required fields can come from overrides instead of env vars."""
        config = RAGConfig.from_env(
            provider_url="http://override/v1",
            data_dir="/tmp/override",
        )
        assert config.provider_url == "http://override/v1"

    def test_from_env_missing_required_raises(self, monkeypatch):
        """from_env() raises ValueError when required fields are missing."""
        monkeypatch.delenv("PROVIDER_URL", raising=False)
        monkeypatch.delenv("DATA_DIR", raising=False)
        with pytest.raises(ValueError, match="PROVIDER_URL"):
            RAGConfig.from_env()

    def test_from_env_missing_one_required_raises(self, monkeypatch):
        """from_env() raises ValueError listing only the missing field."""
        monkeypatch.setenv("PROVIDER_URL", "http://x/v1")
        monkeypatch.delenv("DATA_DIR", raising=False)
        with pytest.raises(ValueError, match="DATA_DIR"):
            RAGConfig.from_env()

    def test_from_env_empty_reasoning_effort_stays_none(self, monkeypatch):
        """Empty REASONING_EFFORT env var doesn't set the field."""
        monkeypatch.setenv("PROVIDER_URL", "http://x/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/d")
        monkeypatch.setenv("REASONING_EFFORT", "")
        config = RAGConfig.from_env()
        assert config.reasoning_effort == "none"

    def test_from_env_reasoning_effort_set(self, monkeypatch):
        """Non-empty REASONING_EFFORT is passed through."""
        monkeypatch.setenv("PROVIDER_URL", "http://x/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/d")
        monkeypatch.setenv("REASONING_EFFORT", "none")
        config = RAGConfig.from_env()
        assert config.reasoning_effort == "none"

    def test_from_env_invalid_int_ignored(self, monkeypatch):
        """Non-numeric CHUNK_SIZE is silently ignored (uses default)."""
        monkeypatch.setenv("PROVIDER_URL", "http://x/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/d")
        monkeypatch.setenv("CHUNK_SIZE", "not-a-number")
        config = RAGConfig.from_env()
        assert config.chunk_size == 2200

    def test_from_env_reranker_false_values(self, monkeypatch):
        """RERANKER_ENABLED=false/0/no all resolve to False."""
        monkeypatch.setenv("PROVIDER_URL", "http://x/v1")
        monkeypatch.setenv("DATA_DIR", "/tmp/d")
        for val in ("false", "0", "no"):
            monkeypatch.setenv("RERANKER_ENABLED", val)
            config = RAGConfig.from_env()
            assert config.reranker_enabled is False
