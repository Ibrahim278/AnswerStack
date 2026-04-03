"""RAGConfig dataclass — central configuration for the AnswerStack RAG pipeline."""

from dataclasses import dataclass, field


@dataclass
class RAGConfig:
    """Configuration for the AnswerStack RAG pipeline.

    Only provider_url and data_dir are required. All other fields
    have sensible defaults matching the web app's production values.
    """

    provider_url: str
    data_dir: str
    provider_api_key: str = "not-needed"
    provider_model: str = ""
    embedding_model: str = ""
    chunk_size: int = 2200
    chunk_overlap: int = 250
    top_k: int = 5
    initial_k: int = 20
    similarity_threshold: float = 0.3
    temperature: float = 0.7
    reranker_enabled: bool = True
    reasoning_effort: str | None = None
    max_completion_tokens: int | None = None
    system_prompt: str = field(
        default=(
            "You are a helpful assistant that answers questions based on the provided context. "
            "Always cite your sources using [Source N] notation."
        )
    )
