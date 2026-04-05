"""AnswerStack core RAG library."""

from answerstack.config import RAGConfig
from answerstack.errors import AnswerStackError, EmbeddingError, ParsingError, ProviderError, VectorStoreError
from answerstack.knowledge_base import KnowledgeBase
from answerstack.prompts import build_followup_prompt, build_rag_prompt
from answerstack.rag_pipeline import RAGPipeline
from answerstack.streaming import ThinkingFilter, strip_thinking_blocks
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
    "build_rag_prompt",
    "build_followup_prompt",
    "ThinkingFilter",
    "strip_thinking_blocks",
]
