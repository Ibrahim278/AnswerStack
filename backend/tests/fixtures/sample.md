# Test Document

This is a **markdown** document used for testing the AnswerStack document parsers.

## Section 1: Introduction

The document processing pipeline handles multiple file formats:

- Plain text files (`.txt`)
- Markdown files (`.md`)
- PDF documents (`.pdf`)

Each format has a dedicated parser that implements the `DocumentParser` interface.

## Section 2: Architecture

The parser system follows the ports-and-adapters pattern:

1. `DocumentParser` is the abstract port (interface)
2. `TextParser`, `MarkdownParser`, and `PdfParser` are concrete adapters
3. `get_parser_for_extension()` is the factory function

### Key Design Decisions

The markdown parser treats Markdown as plain text for RAG purposes. There is no
conversion to HTML or stripping of Markdown syntax, because:

- Markdown formatting provides useful structural signals for the LLM
- Headers, lists, and emphasis help the model understand document organization
- The raw Markdown is more informative than stripped plain text

## Section 3: Code Example

Here is an example of using the parser:

```python
from app.parsers import get_parser_for_extension

parser = get_parser_for_extension(".md")
result = parser.parse(content_bytes, "document.md")
print(f"Extracted {len(result.text)} characters")
```

## Section 4: Testing

Unit tests cover the following scenarios:

- Basic text parsing with ASCII content
- UTF-8 handling with special characters
- Markdown content preservation
- Parser factory function routing
- Invalid extension error handling

### Test Fixtures

This file serves as a test fixture for the markdown parser tests. It includes
various Markdown elements to verify that the parser preserves all content:

| Feature | Supported |
|---------|-----------|
| Headers | Yes |
| Lists | Yes |
| Code | Yes |
| Tables | Yes |
| Links | Yes |

> **Note:** The markdown parser does not validate Markdown syntax. It simply
> reads the raw bytes and decodes them as UTF-8 text.

---

*End of test document.*
