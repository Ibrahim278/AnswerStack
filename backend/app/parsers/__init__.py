"""Re-export parsers from answerstack core package.

Existing backend code continues to use ``from app.parsers import ...``
while the implementation lives in answerstack.parsers.
"""

from answerstack.parsers import DocumentParser, ParseResult, get_parser_for_extension

__all__ = ["DocumentParser", "ParseResult", "get_parser_for_extension"]
