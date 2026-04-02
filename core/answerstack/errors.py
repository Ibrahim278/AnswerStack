"""Core exception hierarchy for answerstack.

All exceptions inherit from AnswerStackError. No FastAPI, SQLAlchemy, or
backend-specific imports are allowed in this module.
"""


class AnswerStackError(Exception):
    """Base exception for all answerstack errors."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ProviderError(AnswerStackError):
    """Raised when the LLM/embedding provider is unavailable or misconfigured."""

    def __init__(self, message: str, *, retryable: bool = True) -> None:
        self.retryable = retryable
        super().__init__(message)


class ParsingError(AnswerStackError):
    """Raised when document parsing fails."""

    pass


class EmbeddingError(AnswerStackError):
    """Raised when embedding generation fails."""

    pass


class VectorStoreError(AnswerStackError):
    """Raised when vector storage operations fail."""

    pass
