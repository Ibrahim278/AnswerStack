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
        assert config.reranker_enabled is True
        assert "helpful assistant" in config.system_prompt
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
