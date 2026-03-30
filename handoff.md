Continue work in `/home/ubuntu/projects/ast-auto`.

Current state:

- Latest committed work is `be23025` (`Add frontend indexing cache verification coverage`).
- Frontend matrix rows `11.1` through `11.9` are now covered and green.
- Browser-created verification projects were cleaned up.
- Runtime settings were restored after verification:
  - `chunk_size=1400`
- Working tree should be clean except for this untracked `handoff.md`.

Next batch:

- Verify SQLite chunk rows and Chroma vector records stay in sync across indexing mutations.
- Keep this batch backend-focused.
- Prefer targeted backend integration tests over frontend/browser work.

What already exists:

- Retrieval integrity already covers some vector/DB parity behavior:
  - `backend/tests/test_indexing_retrieval.py`
  - `test_retrieval_integrity_after_settings_change_full_rebuild`
  - `test_retrieval_integrity_after_rechunk_reparse_rebuild_has_no_duplicate_chunks`
- Missing collection recovery already exists:
  - `backend/tests/test_indexing_rebuilds.py`
  - `test_trigger_build_detects_missing_collection_and_rebuilds_indexed_documents`
- Current indexing logic only treats a missing/empty collection as rebuild-worthy:
  - `backend/app/services/indexing.py`
  - `_get_documents_for_job(...)`
  - the runner logic around `collection_exists` / `collection_count`

Important observation from brief review:

- There is already one strong end-state parity assertion:
  - in `backend/tests/test_indexing_retrieval.py`
  - repeated rechunk rebuild test asserts final Chroma chunk ids equal SQLite chunk ids
- I did not find broader coverage for these divergence shapes:
  - SQLite has chunk rows but Chroma is missing only some of them
  - Chroma has extra/orphan vector ids not present in SQLite
  - Chroma count matches SQLite count but membership differs
  - document delete/cancel paths leaving per-document vector drift even if project-level retrieval still mostly works
- The current service logic appears to rely on collection existence/count, not full id parity, when deciding whether SQLite-indexed docs need rebuild.

Suggested files to inspect first:

- `backend/tests/test_indexing_retrieval.py`
- `backend/tests/test_indexing_rebuilds.py`
- `backend/tests/indexing_helpers.py`
- `backend/app/services/indexing.py`
- `backend/app/repositories/vector.py`
- `backend/app/models/document.py`

Recommended test batch:

1. Add a test where SQLite says project/documents are indexed, but Chroma is missing only one chunk id.
Expected:
the system should detect the drift and rebuild or otherwise restore parity.

2. Add a test where Chroma contains an extra/orphan chunk id not present in SQLite after rebuild/delete.
Expected:
the stale/orphan vector entry should not survive the next rebuild, and retrieval should only return SQLite-backed chunk ids.

3. Add a test where Chroma count equals SQLite count but the ids differ.
Expected:
count-only checks should not falsely accept the index as healthy.

4. Add a test around indexed-document delete followed by parity verification of remaining chunk ids.
Expected:
SQLite chunk ids for remaining docs exactly match Chroma ids after delete settles.

Possible implementation direction:

- Extend the stateful vector test helper so tests can inspect and intentionally corrupt stored ids per project.
- If the product decision is that full id parity must be enforced before a build is skipped, add a narrow integrity check in indexing selection logic.
- Keep the integrity check cheap and bounded; avoid loading huge projects in normal paths unless you explicitly choose that tradeoff.

Scope rules:

- Do not reopen the frontend `11.x` work.
- Do not change product behavior unless a failing test proves the current behavior is unsafe.
- Prefer adding tests first, then only the smallest backend fix needed.

Required verification before stopping:

- In `/home/ubuntu/projects/ast-auto/backend`
- `uv run pytest -q tests/test_indexing_retrieval.py tests/test_indexing_rebuilds.py`
- If you add another indexing test file, run it too.
- If backend logic changes materially, re-run:
  - `uv run pytest -q tests/test_indexing_*.py`

Desired end condition for this batch:

- We have explicit coverage for SQLite/Chroma chunk parity, not just missing-collection and retrieval-smoke behavior.
- Any newly discovered bug is either fixed and green, or documented clearly with a failing scenario and rationale.
