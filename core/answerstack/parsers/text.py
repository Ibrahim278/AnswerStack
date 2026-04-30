"""Plain text (.txt) parser."""

from answerstack.parsers import DocumentParser, ParseResult


class TextParser(DocumentParser):
    """Parser for plain text (.txt) files."""

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """Parse plain text content by decoding as UTF-8."""
        text = content.decode("utf-8", errors="replace")
        return ParseResult(text=text, page_count=None)

    def supported_extensions(self) -> set[str]:
        return {".txt"}
