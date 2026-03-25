from app.parsers import DocumentParser, ParseResult


class MarkdownParser(DocumentParser):
    """Parser for Markdown (.md) files.

    Markdown is treated as plain text for RAG purposes.
    No Markdown-to-HTML conversion is performed; the text splitter
    handles chunking of the raw Markdown content.
    """

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """Parse Markdown content by decoding as UTF-8."""
        text = content.decode("utf-8", errors="replace")
        return ParseResult(text=text, page_count=None)

    def supported_extensions(self) -> set[str]:
        return {".md"}
