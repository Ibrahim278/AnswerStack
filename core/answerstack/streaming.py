"""Utilities for processing LLM streaming output.

Provides filtering for model reasoning/thinking blocks that should
not be shown to users (e.g. <think>...</think>, <|channel>thought...<channel|>).
"""

import re

# Supported thinking block delimiters: (open_tag, close_tag)
# DeepSeek/Qwen use <think>, Gemma 4 uses <|channel>thought
THINKING_DELIMITERS: list[tuple[str, str]] = [
    ("<think>", "</think>"),
    ("<|channel>thought", "<channel|>"),
]

# Precompiled regex for stripping thinking blocks from complete text
_STRIP_PATTERNS = [
    re.compile(r"<think>[\s\S]*?</think>"),
    re.compile(r"<\|channel>thought[\s\S]*?<channel\|>"),
]


def strip_thinking_blocks(text: str) -> str:
    """Remove all thinking/reasoning blocks from a complete text string."""
    for pattern in _STRIP_PATTERNS:
        text = pattern.sub("", text)
    return text.strip()


class ThinkingFilter:
    """Stateful filter that strips thinking blocks from a token stream.

    Tracks state across tokens so it can handle thinking tags that are
    split across multiple streamed chunks.

    Args:
        enabled: When False, all tokens pass through unmodified.
    """

    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled
        self._in_thinking = False
        self._close_tag = ""
        self._buffer = ""

    def process(self, token: str) -> str | None:
        """Process a single token from the LLM stream.

        Returns the text to emit, or None if the token should be suppressed.
        """
        if not self.enabled:
            return token

        if self._in_thinking:
            self._buffer += token
            if self._close_tag in self._buffer:
                after = self._buffer.split(self._close_tag, 1)[1]
                self._in_thinking = False
                self._buffer = ""
                return after if after else None
            return None

        for open_tag, close_tag in THINKING_DELIMITERS:
            if open_tag in token:
                parts = token.split(open_tag, 1)
                before = parts[0]
                self._buffer = parts[1]
                self._close_tag = close_tag
                self._in_thinking = True
                # Check if closing tag is in the same token
                if close_tag in self._buffer:
                    after = self._buffer.split(close_tag, 1)[1]
                    self._in_thinking = False
                    self._buffer = ""
                    before += after
                return before if before else None

        return token
