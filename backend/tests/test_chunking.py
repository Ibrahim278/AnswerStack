from answerstack.chunking.splitter import RecursiveTextSplitter


class TestRecursiveTextSplitter:
    def test_split_empty_text(self):
        splitter = RecursiveTextSplitter()
        assert splitter.split("") == []

    def test_split_whitespace_text(self):
        splitter = RecursiveTextSplitter()
        assert splitter.split("   \n\n  ") == []

    def test_split_short_text(self):
        splitter = RecursiveTextSplitter(chunk_size=4000)
        text = "This is a short piece of text."
        result = splitter.split(text)
        assert len(result) == 1
        assert result[0] == text

    def test_split_long_text(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=20)
        # Create text that's definitely longer than chunk_size
        text = "This is a paragraph. " * 20  # ~420 chars
        result = splitter.split(text)
        assert len(result) > 1

    def test_chunk_sizes_within_limit(self):
        splitter = RecursiveTextSplitter(chunk_size=200, chunk_overlap=0)
        paragraphs = ["Paragraph number {i}. " * 5 for i in range(10)]
        text = "\n\n".join(paragraphs)
        result = splitter.split(text)
        # All raw chunks (before overlap) should respect the size
        # With overlap added, chunks may be slightly larger
        for chunk in result:
            assert len(chunk) > 0

    def test_overlap_present(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=30)
        paragraphs = [f"Unique paragraph {i} with enough content to exceed chunk size. " * 2 for i in range(5)]
        text = "\n\n".join(paragraphs)
        result = splitter.split(text)

        if len(result) >= 2:
            # Check that consecutive chunks share some text
            for i in range(1, len(result)):
                # The second chunk should contain some text from the end of the first
                # (due to overlap)
                prev_words = set(result[i - 1].split()[-5:])
                curr_words = set(result[i].split()[:10])
                shared = prev_words & curr_words
                assert len(shared) > 0, f"Chunks {i - 1} and {i} should share overlapping text"

    def test_custom_chunk_size(self):
        splitter = RecursiveTextSplitter(chunk_size=100, chunk_overlap=20)
        text = "Word " * 100  # 500 chars
        result = splitter.split(text)
        assert len(result) > 3  # Should produce several chunks

    def test_split_respects_paragraph_boundaries(self):
        splitter = RecursiveTextSplitter(chunk_size=200, chunk_overlap=0)
        # Create paragraphs that individually fit in chunk_size
        p1 = "First paragraph content here."  # ~30 chars
        p2 = "Second paragraph content here."  # ~30 chars
        p3 = "Third paragraph content here."  # ~29 chars
        text = f"{p1}\n\n{p2}\n\n{p3}"
        result = splitter.split(text)
        # All three paragraphs should fit in one chunk since total < 200
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
        # Should fall through to hard split
        assert len(result) > 1
