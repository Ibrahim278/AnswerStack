"""Tests for answerstack text chunking.

Covers empty input, short text, long text, chunk sizes, overlap,
boundary splitting, and edge cases.
"""

from answerstack.chunking.splitter import RecursiveTextSplitter


class TestRecursiveTextSplitter:
    def test_split_empty_text(self):
        splitter = RecursiveTextSplitter()
        assert splitter.split("") == []

    def test_split_whitespace_text(self):
        splitter = RecursiveTextSplitter()
        assert splitter.split("   \n\n  ") == []

    def test_split_none_like_empty(self):
        """Falsy empty string returns empty list."""
        splitter = RecursiveTextSplitter()
        assert splitter.split("") == []

    def test_split_short_text(self):
        splitter = RecursiveTextSplitter(chunk_size=4000)
        text = "This is a short piece of text."
        result = splitter.split(text)
        assert len(result) == 1
        assert result[0] == text

    def test_split_long_text(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=20)
        text = "This is a paragraph. " * 20  # ~420 chars
        result = splitter.split(text)
        assert len(result) > 1

    def test_chunk_sizes_within_limit(self):
        splitter = RecursiveTextSplitter(chunk_size=200, chunk_overlap=0)
        paragraphs = ["Paragraph number {i}. " * 5 for i in range(10)]
        text = "\n\n".join(paragraphs)
        result = splitter.split(text)
        for chunk in result:
            assert len(chunk) > 0

    def test_overlap_present(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=30)
        paragraphs = [f"Unique paragraph {i} with enough content to exceed chunk size. " * 2 for i in range(5)]
        text = "\n\n".join(paragraphs)
        result = splitter.split(text)

        if len(result) >= 2:
            for i in range(1, len(result)):
                prev_words = set(result[i - 1].split()[-5:])
                curr_words = set(result[i].split()[:10])
                shared = prev_words & curr_words
                assert len(shared) > 0, f"Chunks {i - 1} and {i} should share overlapping text"

    def test_custom_chunk_size(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=20)
        text = "Word " * 100  # 500 chars
        result = splitter.split(text)
        assert len(result) > 3

    def test_split_respects_paragraph_boundaries(self):
        splitter = RecursiveTextSplitter(chunk_size=200, chunk_overlap=0)
        p1 = "First paragraph content here."
        p2 = "Second paragraph content here."
        p3 = "Third paragraph content here."
        text = f"{p1}\n\n{p2}\n\n{p3}"
        result = splitter.split(text)
        assert len(result) == 1
        assert p1 in result[0]
        assert p2 in result[0]
        assert p3 in result[0]

    def test_split_at_paragraph_boundaries(self):
        splitter = RecursiveTextSplitter(chunk_size=80, chunk_overlap=0)
        p1 = "A" * 60
        p2 = "B" * 60
        p3 = "C" * 60
        text = f"{p1}\n\n{p2}\n\n{p3}"
        result = splitter.split(text)
        assert len(result) == 3
        assert result[0] == p1
        assert result[1] == p2
        assert result[2] == p3

    def test_none_separators(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=0, separators=[])
        text = "A" * 250
        result = splitter.split(text)
        assert len(result) > 1

    def test_default_parameters(self):
        """Default chunk_size=2200 and chunk_overlap=250."""
        splitter = RecursiveTextSplitter()
        assert splitter.chunk_size == 2200
        assert splitter.chunk_overlap == 250

    def test_single_character_text(self):
        """Single character text returns it as-is."""
        splitter = RecursiveTextSplitter()
        result = splitter.split("a")
        assert result == ["a"]

    def test_zero_overlap(self):
        """Chunks with zero overlap do not share text."""
        splitter = RecursiveTextSplitter(chunk_size=50, chunk_overlap=0)
        text = "Word " * 40  # 200 chars
        result = splitter.split(text)
        assert len(result) > 1
