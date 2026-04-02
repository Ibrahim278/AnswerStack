"""Tests for answerstack parsers.

Covers happy path, edge cases, error scenarios, and the factory function.
"""

import pytest

from answerstack.parsers import DocumentParser, ParseResult, get_parser_for_extension
from answerstack.parsers.text import TextParser
from answerstack.parsers.markdown import MarkdownParser
from answerstack.parsers.pdf import PdfParser


class TestTextParser:
    def test_text_parser_basic(self):
        parser = TextParser()
        result = parser.parse(b"Hello world", "test.txt")
        assert isinstance(result, ParseResult)
        assert result.text == "Hello world"
        assert result.page_count is None

    def test_text_parser_utf8(self):
        parser = TextParser()
        content = "Hello, world! Caf\u00e9 \u2603".encode("utf-8")
        result = parser.parse(content, "test.txt")
        assert "Caf\u00e9" in result.text
        assert "\u2603" in result.text

    def test_text_parser_invalid_utf8(self):
        """Invalid UTF-8 bytes are replaced, not raised."""
        parser = TextParser()
        content = b"Hello \xff\xfe world"
        result = parser.parse(content, "test.txt")
        assert "Hello" in result.text
        assert "world" in result.text

    def test_text_parser_empty_content(self):
        """Empty bytes produce empty string."""
        parser = TextParser()
        result = parser.parse(b"", "empty.txt")
        assert result.text == ""
        assert result.page_count is None

    def test_text_parser_supported_extensions(self):
        parser = TextParser()
        assert parser.supported_extensions() == {".txt"}

    def test_text_parser_is_document_parser(self):
        parser = TextParser()
        assert isinstance(parser, DocumentParser)


class TestMarkdownParser:
    def test_markdown_parser_basic(self):
        parser = MarkdownParser()
        content = b"# Hello\n\nThis is **bold** text."
        result = parser.parse(content, "test.md")
        assert isinstance(result, ParseResult)
        assert "# Hello" in result.text
        assert "**bold**" in result.text
        assert result.page_count is None

    def test_markdown_parser_empty_content(self):
        """Empty bytes produce empty string."""
        parser = MarkdownParser()
        result = parser.parse(b"", "empty.md")
        assert result.text == ""

    def test_markdown_parser_supported_extensions(self):
        parser = MarkdownParser()
        assert parser.supported_extensions() == {".md"}

    def test_markdown_parser_is_document_parser(self):
        parser = MarkdownParser()
        assert isinstance(parser, DocumentParser)

    def test_markdown_preserves_structure(self):
        """Markdown structural signals (headers, lists) are preserved."""
        parser = MarkdownParser()
        content = b"# Title\n\n- Item 1\n- Item 2\n\n## Section\n\nParagraph."
        result = parser.parse(content, "structure.md")
        assert "# Title" in result.text
        assert "- Item 1" in result.text
        assert "## Section" in result.text


class TestPdfParser:
    def test_pdf_parser_is_document_parser(self):
        """Verify PdfParser can be imported and instantiated."""
        parser = PdfParser()
        assert isinstance(parser, DocumentParser)
        assert ".pdf" in parser.supported_extensions()

    def test_pdf_parser_minimal(self):
        """Test PDF parsing with a programmatically-created minimal PDF."""
        try:
            import pymupdf
        except ImportError:
            pytest.skip("pymupdf not available")

        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text((72, 72), "Hello from a test PDF document.")
        pdf_bytes = doc.tobytes()
        doc.close()

        parser = PdfParser()
        result = parser.parse(pdf_bytes, "test.pdf")
        assert isinstance(result, ParseResult)
        assert "Hello from a test PDF document" in result.text
        assert result.page_count == 1

    def test_pdf_parser_invalid_content(self):
        """PdfParser raises ValueError for invalid content."""
        parser = PdfParser()
        with pytest.raises(ValueError, match="Failed to parse PDF"):
            parser.parse(b"not a pdf", "bad.pdf")

    def test_pdf_parser_empty_bytes(self):
        """PdfParser raises ValueError for empty bytes."""
        parser = PdfParser()
        with pytest.raises(ValueError):
            parser.parse(b"", "empty.pdf")

    def test_pdf_parser_supported_extensions(self):
        parser = PdfParser()
        assert parser.supported_extensions() == {".pdf"}


class TestGetParserForExtension:
    def test_get_parser_for_extension_txt(self):
        parser = get_parser_for_extension(".txt")
        assert isinstance(parser, TextParser)

    def test_get_parser_for_extension_md(self):
        parser = get_parser_for_extension(".md")
        assert isinstance(parser, MarkdownParser)

    def test_get_parser_for_extension_pdf(self):
        parser = get_parser_for_extension(".pdf")
        assert isinstance(parser, PdfParser)

    def test_get_parser_for_extension_case_insensitive(self):
        parser = get_parser_for_extension(".TXT")
        assert isinstance(parser, TextParser)

    def test_get_parser_for_extension_mixed_case(self):
        parser = get_parser_for_extension(".Md")
        assert isinstance(parser, MarkdownParser)

    def test_get_parser_for_extension_invalid(self):
        with pytest.raises(ValueError, match="Unsupported file extension"):
            get_parser_for_extension(".exe")

    def test_get_parser_for_extension_empty(self):
        with pytest.raises(ValueError, match="Unsupported file extension"):
            get_parser_for_extension("")

    def test_get_parser_for_extension_no_dot(self):
        """Extension without dot is not supported."""
        with pytest.raises(ValueError, match="Unsupported file extension"):
            get_parser_for_extension("txt")
