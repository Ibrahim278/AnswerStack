from pathlib import Path

import pytest

from app.parsers import DocumentParser, ParseResult, get_parser_for_extension
from app.parsers.markdown_parser import MarkdownParser
from app.parsers.text_parser import TextParser

FIXTURES_DIR = Path(__file__).parent / "fixtures"


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
        parser = TextParser()
        # Invalid UTF-8 sequence
        content = b"Hello \xff\xfe world"
        result = parser.parse(content, "test.txt")
        assert "Hello" in result.text
        assert "world" in result.text

    def test_text_parser_fixture(self):
        parser = TextParser()
        content = (FIXTURES_DIR / "sample.txt").read_bytes()
        result = parser.parse(content, "sample.txt")
        assert len(result.text) > 500
        assert "AnswerStack" in result.text

    def test_text_parser_supported_extensions(self):
        parser = TextParser()
        assert parser.supported_extensions() == {".txt"}


class TestMarkdownParser:
    def test_markdown_parser_basic(self):
        parser = MarkdownParser()
        content = b"# Hello\n\nThis is **bold** text."
        result = parser.parse(content, "test.md")
        assert isinstance(result, ParseResult)
        assert "# Hello" in result.text
        assert "**bold**" in result.text
        assert result.page_count is None

    def test_markdown_parser_fixture(self):
        parser = MarkdownParser()
        content = (FIXTURES_DIR / "sample.md").read_bytes()
        result = parser.parse(content, "sample.md")
        assert "# Test Document" in result.text
        assert "## Section 1" in result.text
        assert len(result.text) > 500

    def test_markdown_parser_supported_extensions(self):
        parser = MarkdownParser()
        assert parser.supported_extensions() == {".md"}


class TestGetParserForExtension:
    def test_get_parser_for_extension_txt(self):
        parser = get_parser_for_extension(".txt")
        assert isinstance(parser, TextParser)

    def test_get_parser_for_extension_md(self):
        parser = get_parser_for_extension(".md")
        assert isinstance(parser, MarkdownParser)

    def test_get_parser_for_extension_pdf(self):
        from app.parsers.pdf_parser import PdfParser

        parser = get_parser_for_extension(".pdf")
        assert isinstance(parser, PdfParser)

    def test_get_parser_for_extension_case_insensitive(self):
        parser = get_parser_for_extension(".TXT")
        assert isinstance(parser, TextParser)

    def test_get_parser_for_extension_invalid(self):
        with pytest.raises(ValueError, match="Unsupported file extension"):
            get_parser_for_extension(".exe")


class TestPdfParser:
    def test_pdf_parser_import(self):
        """Verify PdfParser can be imported and instantiated."""
        from app.parsers.pdf_parser import PdfParser

        parser = PdfParser()
        assert isinstance(parser, DocumentParser)
        assert ".pdf" in parser.supported_extensions()

    def test_pdf_parser_minimal(self):
        """Test PDF parsing with a programmatically-created minimal PDF."""
        try:
            import pymupdf
        except ImportError:
            pytest.skip("pymupdf not available")

        from app.parsers.pdf_parser import PdfParser

        # Create a minimal PDF in memory
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
        """Test that PdfParser raises ValueError for invalid content."""
        from app.parsers.pdf_parser import PdfParser

        parser = PdfParser()
        with pytest.raises(ValueError, match="Failed to parse PDF"):
            parser.parse(b"not a pdf", "bad.pdf")
