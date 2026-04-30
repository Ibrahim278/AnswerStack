import hashlib
import re
import unicodedata
from pathlib import Path, PurePosixPath


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal and dangerous characters.

    Strips directory components, normalizes Unicode, removes null bytes and
    dangerous characters, collapses consecutive dots, strips leading dots,
    and enforces a 255-character length limit.

    Returns 'unnamed_document' if the result is empty or just '.'.
    """
    # Strip directory components (handles both Unix and Windows paths)
    name = PurePosixPath(filename).name
    # Also handle Windows backslash paths
    name = name.rsplit("\\", 1)[-1]

    # Normalize Unicode
    name = unicodedata.normalize("NFKD", name)

    # Remove null bytes
    name = name.replace("\x00", "")

    # Remove forward/back slashes (safety net after path stripping)
    name = name.replace("/", "").replace("\\", "")

    # Allow only safe characters: alphanumeric, dash, underscore, dot, space
    name = re.sub(r"[^\w\-. ]", "_", name)

    # Collapse multiple consecutive dots
    name = re.sub(r"\.{2,}", ".", name)

    # Strip leading dots
    name = name.lstrip(".")

    # Strip whitespace
    name = name.strip()

    # Fallback for empty result
    if not name or name == ".":
        return "unnamed_document"

    # Enforce 255-char length limit, preserving extension
    if len(name) > 255:
        # Split into stem and suffix
        dot_idx = name.rfind(".")
        if dot_idx > 0:
            stem = name[:dot_idx]
            suffix = name[dot_idx:]
            # Limit suffix to 55 chars, stem to fill the rest
            suffix = suffix[:55]
            stem = stem[: 255 - len(suffix)]
            name = stem + suffix
        else:
            name = name[:255]

    return name


def validate_storage_path(base_dir: Path, resolved_path: Path) -> bool:
    """Validate that resolved_path is within base_dir to prevent path traversal.

    Returns True if resolved_path.resolve() is relative to base_dir.resolve().
    """
    try:
        resolved_path.resolve().relative_to(base_dir.resolve())
        return True
    except ValueError:
        return False


def compute_file_hash(file_path: Path) -> str:
    """Compute SHA-256 hash of a file.

    Returns the hex digest string.
    """
    with open(file_path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def compute_bytes_hash(data: bytes) -> str:
    """Compute SHA-256 hash of raw bytes.

    Returns the hex digest string.
    """
    return hashlib.sha256(data).hexdigest()
