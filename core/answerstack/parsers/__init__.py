"""Document parsing: ABC, result type, and parser factory."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ParseResult:
    """Result of parsing a document."""

    text: str
    page_count: int | None = None
    metadata: dict | None = field(default=None)


class DocumentParser(ABC):
    """Abstract base class for document parsers."""

    @abstractmethod
    def parse(self, content: bytes, filename: str) -> ParseResult:
        """Parse document content and return extracted text.

        Args:
            content: Raw file bytes.
            filename: Original filename (used for error messages).

        Returns:
            ParseResult with extracted text and optional metadata.
        """

    @abstractmethod
    def supported_extensions(self) -> set[str]:
        """Return the set of file extensions this parser supports.

        Extensions include the leading dot, e.g. {".txt"}.
        """


def get_parser_for_extension(extension: str) -> DocumentParser:
    """Factory function that returns the appropriate parser for a file extension.

    Args:
        extension: File extension including dot, e.g. ".txt", ".md", ".pdf".
                   Will be lowercased internally.

    Returns:
        An instance of the appropriate DocumentParser.

    Raises:
        ValueError: If the extension is not supported.
    """
    from answerstack.parsers.markdown import MarkdownParser
    from answerstack.parsers.pdf import PdfParser
    from answerstack.parsers.text import TextParser

    ext = extension.lower()
    parsers: dict[str, DocumentParser] = {
        ".txt": TextParser(),
        ".md": MarkdownParser(),
        ".pdf": PdfParser(),
    }

    if ext not in parsers:
        raise ValueError(f"Unsupported file extension: {extension}. Supported: {', '.join(sorted(parsers.keys()))}")

    return parsers[ext]
