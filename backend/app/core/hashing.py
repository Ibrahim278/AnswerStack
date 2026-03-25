import hashlib


def compute_chunk_params_hash(chunk_size: int, chunk_overlap: int, embedding_model: str) -> str:
    """Deterministic hash of indexing parameters for stale detection.

    Produces a SHA-256 hex digest from the canonical string
    ``{chunk_size}:{chunk_overlap}:{embedding_model}``.
    """
    params_str = f"{chunk_size}:{chunk_overlap}:{embedding_model}"
    return hashlib.sha256(params_str.encode()).hexdigest()
