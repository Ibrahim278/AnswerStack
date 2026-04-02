"""AnswerStack core RAG library."""

from answerstack.config import RAGConfig
from answerstack.errors import AnswerStackError, EmbeddingError, ParsingError, ProviderError, VectorStoreError
from answerstack.knowledge_base import KnowledgeBase
from answerstack.rag_pipeline import RAGPipeline
from answerstack.types import CompleteEvent, ErrorEvent, RerankerProtocol, SourcesEvent, TokenEvent

__all__ = [
    "RAGConfig",
    "KnowledgeBase",
    "RAGPipeline",
    "AnswerStackError",
    "ProviderError",
    "ParsingError",
    "EmbeddingError",
    "VectorStoreError",
    "RerankerProtocol",
    "TokenEvent",
    "SourcesEvent",
    "CompleteEvent",
    "ErrorEvent",
]
