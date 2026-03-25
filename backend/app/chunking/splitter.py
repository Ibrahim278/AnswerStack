DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


class RecursiveTextSplitter:
    """Splits text into chunks using recursive separator-based splitting with overlap.

    The splitter tries separators in order of preference (paragraph breaks first,
    then line breaks, sentences, words, characters) to produce chunks that respect
    natural text boundaries.
    """

    def __init__(
        self,
        chunk_size: int = 4000,
        chunk_overlap: int = 800,
        separators: list[str] | None = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators if separators is not None else list(DEFAULT_SEPARATORS)

    def split(self, text: str) -> list[str]:
        """Split text into chunks with overlap.

        Returns an empty list for empty or whitespace-only text.
        """
        if not text or not text.strip():
            return []

        raw_chunks = self._split_recursive(text, self.separators)
        # Filter out empty chunks
        raw_chunks = [c for c in raw_chunks if c.strip()]

        if not raw_chunks:
            return []

        if len(raw_chunks) == 1:
            return raw_chunks

        return self._merge_with_overlap(raw_chunks)

    def _split_recursive(self, text: str, separators: list[str]) -> list[str]:
        """Recursively split text using the given separator hierarchy."""
        text = text.strip()

        if not text:
            return []

        # If text fits within chunk_size, return as-is
        if len(text) <= self.chunk_size:
            return [text]

        # No separators left: hard-split by chunk_size
        if not separators:
            return self._hard_split(text)

        separator = separators[0]
        remaining_separators = separators[1:]

        # If separator is empty string, do a hard split
        if separator == "":
            return self._hard_split(text)

        parts = text.split(separator)

        # If the text doesn't contain this separator, try the next one
        if len(parts) == 1:
            return self._split_recursive(text, remaining_separators)

        # Accumulate parts into chunks
        chunks: list[str] = []
        current_parts: list[str] = []
        current_len = 0

        for part in parts:
            part_len = len(part)
            # Account for separator that would be re-added when joining
            sep_len = len(separator) if current_parts else 0
            new_len = current_len + sep_len + part_len

            if new_len > self.chunk_size and current_parts:
                # Flush current accumulation
                merged = separator.join(current_parts)
                if len(merged) <= self.chunk_size:
                    chunks.append(merged.strip())
                else:
                    # Recurse on oversized merged text
                    chunks.extend(self._split_recursive(merged, remaining_separators))

                current_parts = [part]
                current_len = part_len
            else:
                current_parts.append(part)
                current_len = new_len

        # Flush remaining
        if current_parts:
            merged = separator.join(current_parts)
            if len(merged) <= self.chunk_size:
                chunks.append(merged.strip())
            else:
                chunks.extend(self._split_recursive(merged, remaining_separators))

        return chunks

    def _hard_split(self, text: str) -> list[str]:
        """Split text into fixed-size chunks as a last resort."""
        chunks = []
        for i in range(0, len(text), self.chunk_size):
            chunk = text[i : i + self.chunk_size].strip()
            if chunk:
                chunks.append(chunk)
        return chunks

    def _merge_with_overlap(self, chunks: list[str]) -> list[str]:
        """Add overlap from the end of each chunk to the beginning of the next.

        Finds a clean break at the first space within the overlap region.
        """
        if len(chunks) <= 1 or self.chunk_overlap <= 0:
            return chunks

        result = [chunks[0]]

        for i in range(1, len(chunks)):
            prev_chunk = chunks[i - 1]
            current_chunk = chunks[i]

            # Get the overlap region from the end of the previous chunk
            overlap_text = prev_chunk[-self.chunk_overlap :] if len(prev_chunk) > self.chunk_overlap else prev_chunk

            # Find a clean break at the first space in the overlap region
            space_idx = overlap_text.find(" ")
            if space_idx >= 0:
                overlap_text = overlap_text[space_idx + 1 :]

            if overlap_text.strip():
                result.append(overlap_text + " " + current_chunk)
            else:
                result.append(current_chunk)

        return result
