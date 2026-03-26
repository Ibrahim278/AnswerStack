import pymupdf
import pymupdf4llm

from app.parsers import DocumentParser, ParseResult


class PdfParser(DocumentParser):
    """Parser for PDF (.pdf) files using pymupdf4llm."""

    def parse(self, content: bytes, filename: str) -> ParseResult:
        """Parse PDF content and extract text as Markdown.

        Uses pymupdf4llm to convert PDF pages to clean Markdown text
        optimized for LLM/RAG use cases.

        Args:
            content: Raw PDF file bytes.
            filename: Original filename (for error messages).

        Returns:
            ParseResult with extracted text and page count.

        Raises:
            ValueError: If the PDF cannot be parsed.
        """
        try:
            doc = pymupdf.open(stream=content, filetype="pdf")
            try:
                page_chunks = pymupdf4llm.to_markdown(doc, page_chunks=True)
                texts = [chunk["text"] for chunk in page_chunks]
                full_text = "\n\n".join(texts)
                page_count = len(page_chunks)
            finally:
                doc.close()
            return ParseResult(text=full_text, page_count=page_count)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Failed to parse PDF '{filename}': {exc}") from exc

    def supported_extensions(self) -> set[str]:
        return {".pdf"}
