"""Shared types and protocols for answerstack."""

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class RerankerProtocol(Protocol):
    """Structural protocol for rerankers.

    Both FlashRank Ranker and QwenRerankerAdapter satisfy this
    protocol without needing to inherit from it.
    """

    def rerank(self, request: Any) -> list[dict[str, Any]]: ...


@dataclass
class TokenEvent:
    """A single token from the LLM stream."""

    text: str


@dataclass
class SourcesEvent:
    """Retrieved source chunks for the answer."""

    sources: list[dict]


@dataclass
class CompleteEvent:
    """Stream completed successfully."""

    full_text: str
    token_count: int


@dataclass
class ErrorEvent:
    """An error occurred during generation."""

    message: str
