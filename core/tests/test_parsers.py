"""Tests for answerstack parsers.

Covers happy path, edge cases, error scenarios, and the factory function.
"""

import pytest

from answerstack.parsers import DocumentParser, ParseResult, get_parser_for_extension
from answerstack.parsers.text import TextParser
from answerstack.parsers.markdown import MarkdownParser, clean_markdown
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
        assert "Hello" in result.text
        assert "# Hello" not in result.text
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

    def test_markdown_preserves_lists(self):
        parser = MarkdownParser()
        content = b"# Title\n\n- Item 1\n- Item 2\n\nParagraph."
        result = parser.parse(content, "structure.md")
        assert "- Item 1" in result.text

    def test_strip_header_markers(self):
        """Header # prefixes are removed but header text is kept."""
        parser = MarkdownParser()
        content = b"# Title\n\n## Section\n\n### Sub\n\nBody text"
        result = parser.parse(content, "headers.md")
        assert "Title" in result.text
        assert "Section" in result.text
        assert "Sub" in result.text
        assert "Body text" in result.text
        assert "# " not in result.text
        assert "## " not in result.text
        assert "### " not in result.text

    def test_strip_header_markers_h6(self):
        parser = MarkdownParser()
        result = parser.parse(b"###### Deep heading", "h6.md")
        assert result.text.strip() == "Deep heading"

    def test_header_hash_in_non_header_context_preserved(self):
        """A # inside a line (not at start) is not stripped."""
        parser = MarkdownParser()
        result = parser.parse(b"Issue #42 is open", "inline.md")
        assert result.text.strip() == "Issue #42 is open"

    def test_strip_mermaid_blocks(self):
        """Mermaid fenced code blocks are fully removed."""
        parser = MarkdownParser()
        content = b"Before\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter"
        result = parser.parse(content, "mermaid.md")
        assert "Before" in result.text
        assert "After" in result.text
        assert "mermaid" not in result.text
        assert "graph TD" not in result.text

    def test_strip_mermaid_multiple_blocks(self):
        parser = MarkdownParser()
        content = b"A\n```mermaid\nfoo\n```\nB\n```mermaid\nbar\n```\nC"
        result = parser.parse(content, "multi.md")
        assert "A" in result.text
        assert "B" in result.text
        assert "C" in result.text
        assert "foo" not in result.text
        assert "bar" not in result.text

    def test_non_mermaid_code_blocks_preserved(self):
        parser = MarkdownParser()
        content = b"```python\nprint('hi')\n```"
        result = parser.parse(content, "code.md")
        assert "print('hi')" in result.text

    def test_disable_strip_mermaid(self):
        parser = MarkdownParser(strip_mermaid=False)
        content = b"```mermaid\ngraph TD\n```"
        result = parser.parse(content, "keep.md")
        assert "mermaid" in result.text

    def test_disable_strip_header_markers(self):
        parser = MarkdownParser(strip_header_markers=False)
        content = b"# Keep this header"
        result = parser.parse(content, "keep.md")
        assert "# Keep this header" in result.text

    def test_strip_html_comments(self):
        parser = MarkdownParser()
        content = b"Before <!-- this is hidden --> After"
        result = parser.parse(content, "comments.md")
        assert "Before" in result.text
        assert "After" in result.text
        assert "hidden" not in result.text
        assert "<!--" not in result.text

    def test_strip_multiline_html_comment(self):
        parser = MarkdownParser()
        content = b"A\n<!-- TODO:\nfix this\nlater -->\nB"
        result = parser.parse(content, "multi_comment.md")
        assert "A" in result.text
        assert "B" in result.text
        assert "TODO" not in result.text

    def test_disable_strip_html_comments(self):
        parser = MarkdownParser(strip_html_comments=False)
        content = b"<!-- keep me -->"
        result = parser.parse(content, "keep.md")
        assert "<!-- keep me -->" in result.text

    def test_strip_images_keeps_alt_text(self):
        parser = MarkdownParser()
        content = b"See ![architecture diagram](img/arch.png) for details"
        result = parser.parse(content, "images.md")
        assert "architecture diagram" in result.text
        assert "img/arch.png" not in result.text
        assert "![" not in result.text

    def test_strip_image_no_alt_text(self):
        parser = MarkdownParser()
        content = b"A ![](badge.svg) B"
        result = parser.parse(content, "badge.md")
        assert "A" in result.text
        assert "B" in result.text
        assert "badge.svg" not in result.text

    def test_disable_strip_images(self):
        parser = MarkdownParser(strip_images=False)
        content = b"![alt](url.png)"
        result = parser.parse(content, "keep.md")
        assert "![alt](url.png)" in result.text

    def test_strip_horizontal_rules(self):
        parser = MarkdownParser()
        content = b"Above\n\n---\n\nBelow"
        result = parser.parse(content, "hr.md")
        assert "Above" in result.text
        assert "Below" in result.text
        assert "---" not in result.text

    def test_strip_horizontal_rule_variants(self):
        parser = MarkdownParser()
        for rule in [b"---", b"***", b"___", b"- - -", b"* * *"]:
            result = parser.parse(b"A\n" + rule + b"\nB", "hr.md")
            assert "A" in result.text
            assert "B" in result.text
            assert rule.decode() not in result.text, f"Failed to strip: {rule}"

    def test_disable_strip_horizontal_rules(self):
        parser = MarkdownParser(strip_horizontal_rules=False)
        content = b"A\n---\nB"
        result = parser.parse(content, "keep.md")
        assert "---" in result.text

    def test_collapse_blank_lines(self):
        parser = MarkdownParser()
        content = b"A\n\n\n\n\nB\n\n\n\n\n\nC"
        result = parser.parse(content, "blanks.md")
        assert "A\n\nB\n\nC" == result.text

    def test_collapse_blank_lines_preserves_single_and_double(self):
        parser = MarkdownParser()
        content = b"A\nB\n\nC"
        result = parser.parse(content, "normal.md")
        assert result.text == "A\nB\n\nC"

    def test_disable_collapse_blank_lines(self):
        parser = MarkdownParser(collapse_blank_lines=False)
        content = b"A\n\n\n\n\nB"
        result = parser.parse(content, "keep.md")
        assert "\n\n\n\n\n" in result.text

    def test_disable_all(self):
        parser = MarkdownParser(
            strip_mermaid=False,
            strip_header_markers=False,
            strip_html_comments=False,
            strip_images=False,
            strip_horizontal_rules=False,
            collapse_blank_lines=False,
        )
        content = b"# Title\n```mermaid\nfoo\n```\n<!-- hi -->\n![a](b)\n---"
        result = parser.parse(content, "raw.md")
        assert "# Title" in result.text
        assert "mermaid" in result.text
        assert "<!-- hi -->" in result.text
        assert "![a](b)" in result.text
        assert "---" in result.text


class TestCleanMarkdown:
    def test_clean_markdown_default(self):
        text = "# Title\n\n```mermaid\ngraph\n```\n\n<!-- hi -->\n\n![a](b)\n\n---\n\nBody"
        result = clean_markdown(text)
        assert "# " not in result
        assert "mermaid" not in result
        assert "<!--" not in result
        assert "![" not in result
        assert "---" not in result
        assert "Title" in result
        assert "Body" in result

    def test_clean_markdown_all_disabled(self):
        text = "# Title\n<!-- hi -->"
        result = clean_markdown(
            text,
            strip_mermaid=False,
            strip_header_markers=False,
            strip_html_comments=False,
            strip_images=False,
            strip_horizontal_rules=False,
            collapse_blank_lines=False,
        )
        assert result == text

    def test_clean_markdown_collapses_blank_lines_from_stripping(self):
        """Stripping elements can leave runs of blank lines; these get collapsed."""
        text = "A\n\n```mermaid\ngraph\n```\n\n\n\nB"
        result = clean_markdown(text)
        assert "\n\n\n" not in result
        assert "A" in result
        assert "B" in result


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
