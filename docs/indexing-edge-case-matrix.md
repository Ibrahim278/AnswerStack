# Indexing Edge-Case Matrix

Last updated: 2026-03-29

Purpose: track execution of indexing, cancellation, settings, deletion, cache refresh, and retrieval-integrity scenarios across sessions.

Status legend:
- `[ ]` not run
- `[~]` in progress
- `[x]` passed
- `[!]` failed

## Test Environments

| Environment | Purpose | Notes |
| --- | --- | --- |
| Throwaway project | Empty-project and failure-isolation checks | Safe to discard after each batch |
| Indexed baseline project | Incremental upload, delete, cancel, retrieval checks | Start from fully indexed documents |
| Settings-changed project | Full rebuild and settings drift checks | Reuse after mutating indexing params |

## Scenario Checklist

| Status | ID | Scenario | Expected Result | Actual Result | Notes / Bugs |
| --- | --- | --- | --- | --- | --- |
| [x] | 1.1 | Empty project created with 0 docs | `index_status=not_indexed`, no active job, UI never implies current index | Backend integration pass: `GET /indexing/status` returned `not_indexed` with `job=null` | Covered by `test_first_document_upload_flow_stays_not_indexed_until_build` |
| [x] | 1.2 | First doc uploaded into empty project | Project becomes `not_indexed` or `stale`, never `indexed`; rebuild processes `1/1` | Backend integration pass: project stayed `not_indexed` until build; completed job processed `1/1` | Covered by `test_first_document_upload_flow_stays_not_indexed_until_build` |
| [x] | 2.1 | Upload 1 new doc into fully indexed project | Project immediately leaves `indexed` | Backend integration pass: status flipped to `stale` immediately after upload | Covered by `test_incremental_upload_rebuilds_only_new_document` |
| [x] | 2.2 | New doc while parsing | Project remains not indexed / stale while parsing | Backend pass: previously indexed project stayed `stale` while the new upload was `parsing`, and never falsely returned `indexed` before build | Covered by `test_new_document_parsing_keeps_indexed_project_stale` |
| [x] | 2.3 | Incremental rebuild after single new doc | Job `documents_total=1`; only new doc reindexes; old docs stay `indexed`; project returns `indexed` | Backend integration pass: final job `documents_total=1`; old docs stayed `indexed`; new doc became `indexed` | Covered by `test_incremental_upload_rebuilds_only_new_document` |
| [x] | 3.1 | Delete new doc while `uploaded` | If no other stale docs exist, project returns `indexed` and no rebuild is required | Backend pass: direct uploaded-state setup + delete restored project to `indexed` with baseline docs only | Covered by `test_delete_uploaded_document_restores_indexed_project` |
| [x] | 3.2 | Delete new doc while `parsing` | If no other stale docs exist, project returns `indexed` and no rebuild is required | Backend pass: controlled parse-in-flight delete left no orphan chunks and restored project to `indexed` | Covered by `test_delete_parsing_document_restores_indexed_project` |
| [x] | 3.3 | Delete new doc while `parsed` | If no other stale docs exist, project returns `indexed` and no rebuild is required | Backend integration pass: deleting the only parsed delta restored project `indexed` with baseline docs only | Covered by `test_delete_parsed_document_restores_indexed_project` |
| [x] | 4.1 | Delete already indexed doc | Embeddings removed, doc absent from retrieval, remaining project stays logically consistent | Backend pass: embeddings removed, retrieval for deleted doc returned empty, remaining project stayed `indexed` | Covered by `test_delete_indexed_document_keeps_project_consistent` and `test_retrieval_integrity_after_indexed_document_delete` |
| [x] | 5.1 | Incremental rebuild cancel before work starts | Prior indexed docs remain indexed; pending doc stays stale/parsed; project stays stale only if work remains | Backend pass: cancel at `0/1` left baseline docs `indexed`, pending doc `parsed`, and project `stale` | Covered by `test_incremental_cancel_before_work_starts_keeps_pending_document_parsed` |
| [x] | 5.2 | Incremental rebuild cancel during `1/1` | Prior indexed docs remain indexed; affected doc falls back safely | Backend integration pass: old docs stayed `indexed`; new doc fell back to `parsed`/`stale`; project stayed `stale` | Covered by `test_incremental_cancel_keeps_previously_indexed_documents` |
| [x] | 5.3 | Incremental rebuild cancel near completion | No global downgrade; project status matches remaining work | Backend pass: cancel at `2/3` left baseline docs plus two new docs `indexed`, one remaining doc `parsed`/`stale`, and project `stale` | Covered by `test_incremental_cancel_near_completion_preserves_completed_documents` |
| [x] | 6.1 | Full rebuild cancel at `0/x` after settings change | Project remains stale; docs do not look falsely indexed | Backend pass: cancel before first doc kept all docs `reindex_required` and project `stale` | Covered by `test_full_rebuild_cancel_at_zero_of_total_stays_stale` |
| [x] | 6.2 | Full rebuild cancel at `1/x` | Project remains stale; retry rebuilds cleanly | Backend pass: cancel after one processed doc rolled project back to all `reindex_required` and `stale` | Covered by `test_full_rebuild_cancel_at_one_of_total_stays_stale` |
| [x] | 6.3 | Full rebuild cancel near completion | Project remains stale until clean retry completes | Backend pass: cancel at `2/3` processed still left project `stale` until retry | Covered by `test_full_rebuild_cancel_near_completion_stays_stale` |
| [x] | 7.1 | Change `chunk_size` after indexing | Indexed docs become `reindex_required`; project becomes `stale`; next rebuild is full | Backend integration pass: docs became `reindex_required`; project `stale`; next build rebuilt all docs | Covered by `test_settings_change_forces_full_rebuild` |
| [x] | 7.2 | Change `chunk_overlap` after indexing | Indexed docs become `reindex_required`; project becomes `stale`; next rebuild is full | Backend pass: docs became `reindex_required`; project `stale`; next build rebuilt all docs after overlap change | Covered by `test_chunk_overlap_change_forces_full_rebuild` |
| [x] | 7.3 | Change `embedding_model` after indexing | Indexed docs become `reindex_required`; project becomes `stale`; next rebuild is full | Backend pass: docs became `reindex_required`; project `stale`; next build rebuilt all docs after model change | Covered by `test_embedding_model_change_forces_full_rebuild` |
| [x] | 7.4 | Change settings during active indexing | Active job may finish, but project ends `stale` | Backend integration pass after fix: job completed, final project status remained `stale` | Covered by `test_settings_change_during_active_incremental_index_ends_stale` |
| [x] | 8.1 | Parse failure on upload | Document and job failure states stay accurate; retries target only correct docs | Backend pass: controlled parser failure left the bad doc `failed` with parsing diagnostics, preserved the last completed job state, and the next incremental build processed only the successfully parsed new doc | Covered by `test_parse_failure_on_upload_keeps_failed_doc_out_of_incremental_rebuild` |
| [x] | 8.2 | Embedding/provider failure during indexing | Job/doc failure states correct; recovery picks up only affected docs | Backend pass: incremental job failed cleanly, baseline docs stayed `indexed`, failed doc returned to `parsed`, retry rebuilt only `1` doc | Covered by `test_incremental_embedding_failure_preserves_existing_index_and_recovers` |
| [x] | 8.3 | Server restart during active indexing | Orphaned jobs fail; `INDEXING` docs reset sensibly; project health recomputes | Backend pass after recovery fix: interrupted incremental job became `failed`, the in-flight doc reset from `indexing` to `parsed`, project health recomputed to `stale`, and retry rebuilt only the recovered doc | Covered by `test_startup_recovery_fails_orphaned_job_and_restores_project_health` |
| [x] | 9.1 | Missing/corrupt Chroma collection while DB says indexed | Rebuild detects missing collection and forces full rebuild | Backend integration pass after fix: build accepted and rebuilt all indexed docs when collection count/existence was missing | Covered by `test_trigger_build_detects_missing_collection_and_rebuilds_indexed_documents` |
| [x] | 10.1 | Retrieval after incremental rebuild | New doc chunks are retrievable | Backend pass: retrieval query returned the newly incrementally indexed doc | Covered by `test_retrieval_integrity_after_incremental_rebuild` |
| [x] | 10.2 | Retrieval after deleting indexed doc | Deleted doc chunks no longer appear | Backend pass: retrieval query for deleted doc returned no results | Covered by `test_retrieval_integrity_after_indexed_document_delete` |
| [x] | 10.3 | Retrieval after settings-change full rebuild | Old chunks do not leak after full rebuild | Backend pass: full rebuild replaced pre-change chunk ids and retrieval returned only rebuilt chunks | Covered by `test_retrieval_integrity_after_settings_change_full_rebuild` |
| [x] | 10.4 | Rechunk / reparse dedupe | No duplicate chunks after rebuild | Backend pass: repeated full rebuilds after rechunk settings changes left vector chunk ids exactly matching current DB chunks, with retrieval returning only unique current chunk ids | Covered by `test_retrieval_integrity_after_rechunk_reparse_rebuild_has_no_duplicate_chunks` |
| [ ] | 11.1 | Frontend cache refresh on upload | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.2 | Frontend cache refresh on parse completion | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.3 | Frontend cache refresh on build start | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.4 | Frontend cache refresh on build completion | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.5 | Frontend cache refresh on cancel | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.6 | Frontend cache refresh on retry | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.7 | Frontend cache refresh on delete | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.8 | Frontend cache refresh on settings change | Index card, header counts, table, project list refresh correctly | Not run | |
| [ ] | 11.9 | Frontend polling lifecycle | Polling starts and stops only when needed | Not run | |
| [x] | 12.1 | API contract snapshot: upload | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: first upload snapshot returned `index_status=not_indexed`, one `uploaded` doc, and `/status.project.documents_total=1` | Covered by `test_api_contract_snapshot_upload` |
| [x] | 12.2 | API contract snapshot: parse completion | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: parsed first doc kept `index_status=not_indexed`, document `status=parsed`, and `/status` project counts stayed coherent | Covered by `test_api_contract_snapshot_parse_completion` |
| [x] | 12.3 | API contract snapshot: build start | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: active build showed `index_status=indexing`, running job progress, doc `status=indexing`, and `/status.active_job` in sync | Covered by `test_api_contract_snapshot_build_start` |
| [x] | 12.4 | API contract snapshot: build completion | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: completed build returned `index_status=indexed`, completed job metadata, indexed documents, and `/status=ready` | Covered by `test_api_contract_snapshot_build_completion` |
| [x] | 12.5 | API contract snapshot: cancel | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: cancelled first build preserved latest job `status=cancelled`, restored doc to `parsed`, and project returned `stale` | Covered by `test_api_contract_snapshot_cancel` |
| [x] | 12.6 | API contract snapshot: retry | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: retry created a fresh running job, doc returned to `indexing`, and `/status.active_job` reflected the retry | Covered by `test_api_contract_snapshot_retry` |
| [x] | 12.7 | API contract snapshot: delete | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: deleting the only parsed delta removed it from `/documents` and restored project snapshots to indexed baseline | Covered by `test_api_contract_snapshot_delete` |
| [x] | 12.8 | API contract snapshot: settings change | `/projects/{id}/indexing/status`, `/documents`, optional `/status` align with UI | Backend contract pass: settings drift flipped docs to `reindex_required`, project to `stale`, and `/status.project.documents_stale` matched all docs | Covered by `test_api_contract_snapshot_settings_change` |

## Execution Log

### 2026-03-28

- Created tracking matrix.
- Planned first automated batch around backend edge cases with the best regression payoff:
  incremental upload, delete-before-index, delete-indexed-doc, settings-change full rebuild, cancellation, collection-integrity.
- Ran `uv run pytest -q tests/test_indexing.py` in `/home/ubuntu/projects/ast-auto/backend`.
- Result: `25 passed, 2 warnings in 24.06s`.
- Fixed backend bug: successful first build could still leave project `not_indexed` because final status calculation depended on stale pre-build state.
- Fixed backend bug: missing/corrupt vector collection could block rebuild start because build selection ignored collection integrity until the background runner.
- Fixed backend bug: concurrent settings changes during indexing could incorrectly finish `indexed` because the runner reused stale SQLAlchemy session state before final status evaluation.
- Frontend cache/polling checks still need manual or browser-driven execution after backend semantics are locked down.
- Fixed backend delete warning by removing chunk/document double-delete behavior in `SQLAlchemyDocumentRepository.delete`.
- Hardened background parsing so a document deleted mid-parse exits cleanly instead of trying to persist chunks against a removed record.
- Added backend coverage for:
  delete while `uploaded`, delete while `parsing`, full-rebuild cancel at `0/x`, `1/x`, and near completion, embedding/provider failure during incremental indexing, and retrieval integrity after incremental rebuild, delete, and settings-change full rebuild.
- Ran `uv run pytest -q tests/test_indexing.py` in `/home/ubuntu/projects/ast-auto/backend`.
- Result: `34 passed in 34.51s`.
- Delete-path SQLAlchemy warnings are now gone in the indexing suite.

### 2026-03-29

- Added `backend/tests/test_indexing_api_contracts.py` to snapshot normalized API responses across upload, parse completion, build start, build completion, cancel, retry, delete, and settings change flows.
- Verified `/api/v1/projects/{id}/indexing/status`, `/api/v1/projects/{id}/documents`, and `/api/v1/status?project_id={id}` stay contract-consistent for matrix rows `12.1` through `12.8`.
- Notable contract behavior now pinned by tests:
  - first-build cancellation returns project `index_status=stale` while leaving the document `parsed`
  - `/api/v1/status` derives top-level `stale` from project index state even when `documents_stale=0`
- Ran `uv run pytest -q tests/test_indexing_api_contracts.py` in `/home/ubuntu/projects/ast-auto/backend`.
- Result: `8 passed in 8.92s`.
- Ran `uv run pytest -q tests/test_indexing_*.py` in `/home/ubuntu/projects/ast-auto/backend`.
- Result: `50 passed in 55.40s`.
