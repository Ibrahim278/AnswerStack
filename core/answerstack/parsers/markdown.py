"""Markdown (.md) parser and shared markdown cleaning utilities.

Markdown is treated as plain text for RAG purposes.
No Markdown-to-HTML conversion is performed; the text splitter
handles chunking of the raw Markdown content.
"""

import re

from answerstack.parsers import DocumentParser, ParseResult

_MERMAID_BLOCK_RE = re.compile(r"```mermaid\s*\n.*?```", re.DOTALL)
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")
_HORIZONTAL_RULE_RE = re.compile(r"^[ ]{0,3}(?:[-*_][ ]*){3,}$", re.MULTILINE)
_HEADER_PREFIX_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_EXCESS_BLANK_LINES_RE = re.compile(r"\n{3,}")


def clean_markdown(
    text: str,
    *,
    strip_mermaid: bool = True,
    strip_header_markers: bool = True,
    strip_html_comments: bool = True,
    strip_images: bool = True,
    strip_horizontal_rules: bool = True,
    collapse_blank_lines: bool = True,
) -> str:
    """Strip markdown formatting noise for RAG ingestion."""
    if strip_mermaid:
        text = _MERMAID_BLOCK_RE.sub("", text)

    if strip_html_comments:
        text = _HTML_COMMENT_RE.sub("", text)

    if strip_images:
        text = _IMAGE_RE.sub(r"\1", text)

    if strip_horizontal_rules:
        text = _HORIZONTAL_RULE_RE.sub("", text)

    if strip_header_markers:
        text = _HEADER_PREFIX_RE.sub("", text)

    if collapse_blank_lines:
        text = _EXCESS_BLANK_LINES_RE.sub("\n\n", text)

    return text


class MarkdownParser(DocumentParser):
    """Parser for Markdown (.md) files."""

    def __init__(
        self,
        *,
        strip_mermaid: bool = True,
        strip_header_markers: bool = True,
        strip_html_comments: bool = True,
        strip_images: bool = True,
        strip_horizontal_rules: bool = True,
        collapse_blank_lines: bool = True,
    ) -> None:
        self.strip_mermaid = strip_mermaid
        self.strip_header_markers = strip_header_markers
        self.strip_html_comments = strip_html_comments
        self.strip_images = strip_images
        self.strip_horizontal_rules = strip_horizontal_rules
        self.collapse_blank_lines = collapse_blank_lines

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """Parse Markdown content by decoding as UTF-8."""
        text = content.decode("utf-8", errors="replace")
        text = clean_markdown(
            text,
            strip_mermaid=self.strip_mermaid,
            strip_header_markers=self.strip_header_markers,
            strip_html_comments=self.strip_html_comments,
            strip_images=self.strip_images,
            strip_horizontal_rules=self.strip_horizontal_rules,
            collapse_blank_lines=self.collapse_blank_lines,
        )
        return ParseResult(text=text, page_count=None)

    def supported_extensions(self) -> set[str]:
        return {".md"}
