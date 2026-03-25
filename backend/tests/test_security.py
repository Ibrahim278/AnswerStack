from pathlib import Path

from app.core.security import compute_bytes_hash, sanitize_filename, validate_storage_path


class TestSanitizeFilename:
    def test_sanitize_filename_strips_path(self):
        assert sanitize_filename("../../etc/passwd") == "passwd"

    def test_sanitize_filename_strips_null_bytes(self):
        assert sanitize_filename("file\x00name.txt") == "filename.txt"

    def test_sanitize_filename_strips_slashes(self):
        assert sanitize_filename("path/to/file.txt") == "file.txt"

    def test_sanitize_filename_normalizes_unicode(self):
        # NFKD normalization decomposes accented characters
        result = sanitize_filename("caf\u00e9.txt")
        assert result  # Should produce a non-empty result
        assert result.endswith(".txt")

    def test_sanitize_filename_removes_dangerous_chars(self):
        result = sanitize_filename("file<script>.txt")
        assert result == "file_script_.txt"

    def test_sanitize_filename_collapses_dots(self):
        result = sanitize_filename("file...txt")
        assert ".." not in result

    def test_sanitize_filename_strips_leading_dots(self):
        result = sanitize_filename(".hidden")
        assert result == "hidden"

    def test_sanitize_filename_empty_fallback(self):
        assert sanitize_filename("") == "unnamed_document"

    def test_sanitize_filename_whitespace_fallback(self):
        assert sanitize_filename("   ") == "unnamed_document"

    def test_sanitize_filename_length_limit(self):
        long_name = "a" * 300 + ".txt"
        result = sanitize_filename(long_name)
        assert len(result) <= 255
        assert result.endswith(".txt")

    def test_sanitize_filename_preserves_valid_name(self):
        assert sanitize_filename("my_document.pdf") == "my_document.pdf"

    def test_sanitize_filename_handles_backslash_path(self):
        assert sanitize_filename("C:\\Users\\test\\file.txt") == "file.txt"


class TestValidateStoragePath:
    def test_validate_storage_path_within_base(self, tmp_path):
        base = tmp_path / "storage"
        base.mkdir()
        target = base / "documents" / "file.txt"
        target.parent.mkdir(parents=True)
        target.touch()
        assert validate_storage_path(base, target) is True

    def test_validate_storage_path_traversal_blocked(self, tmp_path):
        base = tmp_path / "storage"
        base.mkdir()
        target = tmp_path / "outside" / "file.txt"
        (tmp_path / "outside").mkdir()
        target.touch()
        assert validate_storage_path(base, target) is False

    def test_validate_storage_path_same_dir(self, tmp_path):
        base = tmp_path / "storage"
        base.mkdir()
        assert validate_storage_path(base, base) is True


class TestComputeBytesHash:
    def test_compute_bytes_hash(self):
        result = compute_bytes_hash(b"hello")
        assert result == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

    def test_compute_bytes_hash_empty(self):
        result = compute_bytes_hash(b"")
        assert result == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


class TestComputeFileHash:
    def test_compute_file_hash(self, tmp_path):
        from app.core.security import compute_file_hash

        test_file = tmp_path / "test.txt"
        test_file.write_bytes(b"hello")
        result = compute_file_hash(test_file)
        assert result == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
