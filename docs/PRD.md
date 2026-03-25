# AnswerStack PRD

## Purpose

This document defines the ground-up product and implementation plan for
AnswerStack. The goal is to design and implement a clean new application with a
stronger architecture, better UX, safer backend behavior, and a clearer path to
production.

This plan defines the full required feature set, architecture, engineering rules,
and delivery phases for the new application.

## Product Goal

Build a project-based RAG application where a user can:

- create and manage knowledge projects
- upload and manage source documents
- build and rebuild vector indexes
- ask questions against a project and receive streamed answers with sources
- configure model and retrieval settings safely
- use speech-to-text and text-to-speech when available
- review system status and recover from failures cleanly

The application must feel like a real product, not a demo.

## Demo Objectives

This application will be shown to industry experts as a demonstration of product,
design, and engineering capability. The implementation must therefore optimize not
only for correctness, but also for presentation quality and perceived product maturity.

The demo should communicate all of the following:

- the team can design polished, credible product experiences
- the team can engineer robust full-stack systems
- the team can present complex AI workflows in a usable and trustworthy way
- the product can plausibly be adapted into a client-facing solution

Implications:

- UX and UI quality are first-class deliverables, not a later polish pass
- a smaller number of excellent flows is better than a larger number of rough flows
- demo reliability and recovery behavior matter as much as feature breadth
- the product should feel intentional, premium, and presentation-ready

## V1 Product Assumptions

These assumptions define the intended shape of the initial implementation. If any of
these assumptions change, the architecture should be reviewed before implementation
continues.

- v1 is a single-user or single-trusted-operator application
- v1 runs as a single backend process in normal operation
- v1 does not require horizontal scaling
- v1 is optimized for local or small-team deployment, not public multi-tenant hosting
- v1 stores metadata in a local SQLite database file
- v1 stores embeddings and chunk search data in ChromaDB
- v1 stores uploaded source documents on the local filesystem through a storage adapter
- v1 uses in-process background jobs, not a separate distributed worker system
- v1 should recover cleanly after an application restart by reading persisted job and metadata state
- v1 should support modern desktop browsers first, with responsive support for mobile widths

## Approved V1 Tech Stack

This is the approved default stack for the first implementation. Teams should not
substitute different major technologies without an ADR.

- Backend framework: FastAPI
- Backend language/runtime: Python
- API schemas and validation: Pydantic v2
- Metadata ORM and migrations: SQLAlchemy plus Alembic
- Metadata database: SQLite
- Vector store: ChromaDB
- Document storage: local filesystem through a `DocumentBlobStore` adapter
- Background jobs: in-process job runner with persisted job state in SQLite
- Frontend framework: React with TypeScript
- Frontend build tool: Vite
- Frontend routing: React Router
- Frontend async data layer: TanStack Query
- UI component system: Mantine, with a product-specific design system layered on top
- Testing
  - backend unit and integration tests: pytest
  - frontend component tests: Vitest
  - end-to-end tests: Playwright
- API transport for streaming answers: SSE

## V1 Operational Targets

These targets give implementers concrete boundaries for v1. They can be revised later,
but they should be treated as the default performance and scope envelope.

- expected concurrency: one active operator, with occasional overlapping browser tabs
- deployment target: one application instance on one machine
- supported document types: `.txt`, `.md`, `.pdf`
- upload size limits must be explicitly configured and enforced
- indexing jobs must survive process restarts in a recoverable state
- the UI must show whether an indexing job is pending, running, failed, canceled, or completed
- all API failures must return structured error payloads
- the backend must start successfully even when optional speech capabilities are unavailable

## Showcase Workflows

The demo should be designed around a small number of showcase workflows that are
implemented to a very high standard.

- Workflow 1: First-time setup and project creation
  - create or select a project
  - validate provider connection
  - establish confidence that the system is ready to use

- Workflow 2: Knowledge base ingestion
  - upload documents
  - inspect document state and indexing progress
  - clearly communicate when the knowledge base is ready

- Workflow 3: Source-grounded question answering
  - ask a question
  - stream an answer smoothly
  - show trustworthy source attribution
  - allow the presenter to inspect supporting evidence clearly

- Workflow 4: Expert-facing control and trust
  - adjust settings intentionally
  - observe system status
  - handle a recoverable failure without the experience collapsing

Implementation priority should follow these workflows before secondary capabilities are expanded.

## UX/UI Quality Bar

The application must satisfy a visibly high design and interaction standard suitable
for presentation to expert audiences.

- visual design must feel intentional, not like a default developer dashboard
- typography, spacing, hierarchy, and color use must be consistent and polished
- the layout must support both explanation and exploration during a live demo
- empty states must be helpful and visually integrated into the product
- loading, indexing, and streaming states must feel alive and understandable
- source presentation must reinforce trust and clarity
- motion should be purposeful and restrained, not noisy or absent
- the app must look good on both laptop and mobile-width screens
- interactions must avoid awkward jumps, layout shifts, and dead-end states
- microcopy should sound confident, clear, and product-grade
- advanced settings must not overwhelm first-time or non-expert users
- expert controls should feel intentionally separated from the core workflow

## Additional UX Improvements

The following UX improvements should be treated as explicit design goals for the product.

- onboarding should guide the user through the first successful workflow
  - select or create a project
  - configure or validate the provider
  - upload documents
  - wait for indexing
  - ask the first question
- the application should have a persistent readiness indicator
  - ready
  - indexing
  - misconfigured
  - degraded
- the chat composer should help the user understand what to do next
  - suggested prompts
  - disabled-state explanations
  - clear empty state guidance
- uploaded documents and indexed documents must be visually distinguished
- document states should be explicit
  - uploaded
  - parsing
  - indexed
  - failed
  - stale
  - reindex required
- source exploration should feel like a first-class workflow
  - dedicated source panel or drawer
  - snippet previews
  - strong file labeling
  - clear evidence presentation
- failure states should include inline recovery actions where possible
  - retry
  - test connection
  - rebuild
  - remove failed file
- destructive actions should explain consequences, not just ask for confirmation
- sessions should support a polished conversation workflow
  - recent sessions
  - rename
  - clear
  - resume
- the interface should surface trust cues
  - active model
  - last indexed time
  - source count
  - grounded answer context
- the product should support a clean demo mode
  - sample data or seeded example project
  - quick reset path
  - graceful no-data state
- keyboard navigation and presentation ergonomics should be considered part of the design

## Backend Responsibilities for UX

The backend must actively support a strong user experience. It should not be treated
as a passive data provider.

- APIs should expose explicit system states, not force the frontend to infer them
  - ready
  - indexing
  - failed
  - stale
  - misconfigured
  - degraded
- long-running operations must be observable
  - job IDs
  - progress fields
  - timestamps
  - failure reasons
  - cancel and retry support
- error responses must be structured and actionable
  - stable error codes
  - human-readable messages
  - optional recovery hints or suggested next actions
- operations that may be retried by the UI should be idempotent where practical
- application state that affects the user journey must persist across refreshes and restarts
  - chat sessions
  - messages
  - document state
  - index jobs
- the backend must distinguish accepted work from completed work
  - asynchronous operations should return accepted status plus a way to observe progress
- answer responses and message metadata should support trust-building UX
  - model identity
  - source details
  - index timestamps
  - retrieval metadata where appropriate
- document lifecycle state must be fine-grained enough to power clear UI states
- provider and configuration validation should happen before the user reaches a broken flow
- capability availability must be exposed explicitly
  - speech available or unavailable
  - provider reachable or unreachable
  - model list available or unavailable
- streaming contracts must be stable and typed so the frontend can render smoothly
- recovery actions should be supported directly by the backend where appropriate
  - retry
  - cancel
  - rebuild
  - test connection
  - reset demo data if implemented

The backend should always help the frontend answer three questions:

- what state is the system in
- what just happened
- what can the user do next

## Demo Reliability Requirements

The implementation should support stable demonstrations under realistic but controlled conditions.

- the application must have a predictable demo path
- the application must recover cleanly from common demo failures
  - provider connection failure
  - missing documents
  - indexing failure
  - empty retrieval result
- a presenter must be able to reset to a known-good state quickly
- the UI must never leave the presenter guessing what is happening
- demo-critical workflows should be tested end to end before presentation

## Product Principles

- Design for correctness and recoverability first, then polish.
- Keep the core domain model explicit: projects, documents, chunks, jobs, sessions, messages.
- Separate transport, service, storage, and provider layers cleanly.
- Do not let frontend behavior depend on undocumented backend responses.
- Make asynchronous work visible to the user.
- Treat validation, logging, and testability as first-class requirements.
- Preserve local development simplicity while leaving room for hosted deployment later.

## Engineering Principles and Enforcement Rules

These rules are intended to keep the application maintainable and extensible over time.
They are not optional style preferences. They should be treated as architectural
constraints during implementation and review.

## Core design principles

- Dependency inversion
  - business services depend on interfaces, not concrete storage engines, provider SDKs, or framework details
- Ports and adapters
  - metadata storage, vector storage, file storage, job execution, LLM access, embeddings, STT, and TTS must sit behind explicit interfaces
- Single responsibility
  - routes, services, repositories, adapters, and UI features should each have one clear reason to change
- Separation of concerns
  - HTTP transport, domain logic, storage, provider integration, and UI rendering must remain distinct
- Composition root
  - concrete implementation wiring must happen in one place at startup, not across the codebase
- Explicit contracts
  - request models, response models, and internal service input/output shapes should be typed and documented

## Backend implementation rules

- FastAPI route handlers must stay thin
  - parse request
  - validate input
  - call a service
  - map the result to a response
- route handlers must not contain business logic
- route handlers must not query SQLite, ChromaDB, or the filesystem directly
- service layer code must implement workflows and orchestration only
- repositories must manage metadata persistence only
- storage adapters must encapsulate filesystem and vector-store behavior only
- provider adapters must encapsulate third-party SDK usage only
- API schemas must not double as ORM models
- ORM models must not leak into route responses
- long-running operations must execute through the job system, not inside normal request handlers
- job handlers should be idempotent where practical, especially for rebuild, retry, and cancel flows
- chat and retrieval orchestration must not be hard-wired into a single monolithic pipeline
- retrieval planning, document retrieval, answer synthesis, reranking, and optional future tool-using steps must remain separable at the service boundary

## Frontend implementation rules

- the frontend must use feature-based organization
  - `projects`
  - `documents`
  - `indexing`
  - `chat`
  - `settings`
  - `speech`
- components should not make ad hoc `fetch` calls directly
- data access must go through a typed API layer
- shared async workflows should use predictable state models
  - reducer-based state or state-machine-style transitions are preferred for upload, indexing, streaming, and recording flows
- presentational components should remain as stateless as practical
- data-heavy container logic should live in hooks, feature controllers, or query/mutation wrappers
- UI state must model empty, loading, success, and failure states explicitly

## Required patterns

- Repository pattern for metadata persistence
- Adapter pattern for vector storage, file storage, jobs, and provider integrations
- Service layer for business workflows
- DTO or schema boundary between API contracts and persistence models
- Contract-first API design
- Versioned API routes from day one
- Feature-based frontend modules
- Modular orchestration boundaries so retrieval, generation, tool use, and workflow control can evolve independently

## Deliberately avoided patterns

These should not be introduced unless there is a demonstrated need.

- full domain-driven design ceremony
- full CQRS/event sourcing
- generic abstraction layers with no second implementation
- global mutable singleton state
- business logic embedded in UI components

## Enforcement mechanisms

- architecture review checklist for pull requests
- architectural tests where practical
  - prevent routes from importing repository implementations directly
  - prevent services from importing frontend-only or transport-only code
  - prevent UI components from bypassing the shared API layer
- lint rules and import boundaries for frontend feature modules
- migrations required for metadata schema changes
- ADRs for major architecture decisions
  - storage backend change
  - vector backend change
  - job execution model change
  - auth model change

## Review checklist

Every meaningful backend or frontend change should be checked against these questions.

- does this change preserve the route -> service -> interface -> implementation flow
- does this change introduce business logic in the wrong layer
- does this change leak storage or provider details across boundaries
- does this change preserve typed API contracts
- does this change make future backend swaps harder
- does this change improve or harm explicit user-state handling

## Core Product Requirements

The application must support the following core capabilities.

- Project CRUD
  - create project
  - list projects
  - delete project
  - activate/select active project

- Document management
  - upload `.txt`, `.md`, and `.pdf`
  - list project documents
  - delete project documents

- Retrieval and chat
  - rebuild vector index for a project
  - show index status
  - ask a question against the active project
  - stream answer tokens to the UI
  - show answer sources

- Configuration and models
  - read current config
  - update config
  - list available models from the selected provider

- Speech
  - speech-to-text input
  - text-to-speech playback

- CLI and evaluation
  - command for rebuilding an index outside the UI
  - evaluation tooling for question/answer quality

## Expanded Product Requirements

The application must also include the following product and operational capabilities.

- Better project experience
  - project metadata
  - optional project description
  - project last-used timestamp
  - active project persistence across refreshes

- Better document workflow
  - upload progress
  - duplicate detection
  - file validation with actionable errors
  - parsing status per document
  - failed-document diagnostics
  - document metadata and source preview

- Better indexing workflow
  - indexing jobs instead of blocking request/response
  - visible progress and status transitions
  - last indexed timestamp
  - stale-index warning when documents or settings change
  - rebuild, cancel, retry controls

- Better chat workflow
  - saved chat sessions per project
  - message history persistence
  - retry and regenerate answer
  - stop generation
  - copy answer
  - clear session
  - stronger citation and source UX
  - graceful "no answer in context" behavior

- Better settings and provider management
  - basic settings shown by default
  - advanced settings hidden behind an explicit advanced section, drawer, modal, or expert view
  - validate config before save
  - test provider connection
  - clearer separation of retrieval, model, and speech settings
  - reset to defaults
  - provider capability checks

- Better speech UX
  - microphone permission handling
  - recording state feedback
  - cancel transcription
  - no-speech handling
  - playback interruption and cleanup
  - optional disablement when speech features are unavailable

- Better operational behavior
  - health endpoints
  - structured logs
  - request IDs
  - clear user-facing error messages
  - auditability for important actions

- Better safety and production readiness
  - environment-based secrets
  - path sanitization
  - safer destructive actions
  - rate limiting if deployed in a shared environment
  - optional authentication if hosted beyond a single trusted user

## Proposed Architecture

## Backend

- Framework: FastAPI
- Validation and schemas: Pydantic v2
- API docs: OpenAPI generated from route definitions
- Service layer: explicit application services for projects, documents, indexing, chat, config, speech
- Storage
  - metadata store for projects, documents, jobs, sessions, messages, provider config
  - vector store for chunks and embeddings
  - both accessed only through storage interfaces, never directly from route or service code
- Worker model
  - in-process job runner for indexing and other long-running tasks in v1
  - async-friendly status polling and streamed responses

## Storage portability requirements

The application must be structured so that metadata and vector storage can be swapped with
minimal code changes.

- application services must depend on storage interfaces, not concrete database clients
- route handlers must call services only, never ORM code or vector client code directly
- domain models and API schemas must not embed vendor-specific types
- all database-specific query logic must live inside repository implementations
- all vector-store-specific logic must live inside vector adapter implementations
- provider selection must be driven by configuration and dependency wiring

Swapping storage backends should require:

- adding a new repository or adapter implementation
- wiring the new implementation in the application factory
- running or adding migrations if the metadata store changes

Swapping storage backends should not require:

- rewriting route handlers
- rewriting business logic in services
- changing frontend code
- changing API contracts

## Recommended backend stack

- FastAPI for HTTP API
- Pydantic for request and response contracts
- SQLAlchemy plus Alembic for application metadata
- SQLite for application metadata in the initial implementation
- ChromaDB for vector storage in the initial implementation
- repository and adapter abstractions so SQLite and ChromaDB can be replaced later
- PostgreSQL as a future metadata upgrade path if concurrency or hosting needs grow
- pgvector or Qdrant as future vector upgrade paths if ChromaDB becomes limiting
- in-process background job execution for the initial implementation, backed by persisted job state in SQLite
- Redis-backed job execution only as a future scaling option if independent workers are needed

## Configuration ownership model

Configuration scope must be explicit so the backend and frontend do not invent different
behaviors.

- v1 uses a global active provider configuration for the application
- project records may store retrieval preferences or snapshots used for auditing jobs
- provider credentials are not project-specific in v1
- index jobs must persist the effective config snapshot used when the job started
- chat messages may persist provider metadata and model metadata for traceability

Implications for API design:

- `GET /api/v1/config` and `PATCH /api/v1/config` refer to the global application config
- project endpoints must not silently override provider credentials
- if project-scoped config is introduced later, it requires a new ADR and explicit inheritance rules

## Required storage interfaces

The backend should define interfaces similar to these.

- `ProjectRepository`
- `DocumentRepository`
- `IndexJobRepository`
- `ChatSessionRepository`
- `ChatMessageRepository`
- `ConfigRepository`
- `DocumentBlobStore`
- `VectorIndex`

Expected rules:

- repositories manage metadata persistence only
- `DocumentBlobStore` manages raw uploaded file storage only
- `VectorIndex` manages chunk upserts, deletes, similarity search, and index cleanup only
- services coordinate repositories and adapters but do not know the storage engine details
- dependency injection selects the concrete implementations at startup

## Frontend

- Framework: React with TypeScript
- Build: Vite
- UI system: Mantine can be retained if used intentionally and redesigned properly
- Routing: React Router
- Data fetching and cache: TanStack Query
- Local UI state: lightweight store or reducer-based state for app shell concerns
- Streaming transport: SSE for answer generation, with a parser that correctly handles chunk boundaries

## Separation of concerns

- API layer
  - typed request and response models
  - no `any` payloads in frontend code

- Domain layer
  - project lifecycle
  - document lifecycle
  - indexing lifecycle
  - chat lifecycle
  - speech lifecycle

- Infrastructure layer
  - provider adapters for LLM and embeddings
  - storage adapters
  - filesystem or object storage adapters
  - observability adapters

- Storage contract layer
  - repository interfaces for metadata
  - blob storage interface for uploaded files
  - vector index interface for embeddings and retrieval
  - implementation modules such as `sqlite/` and `chroma/`

## Recommended Domain Model

- Project
  - id
  - name
  - description
  - created_at
  - updated_at
  - last_used_at
  - last_effective_settings_snapshot used for auditability only, not as the primary config source

- Document
  - id
  - project_id
  - filename
  - content_type
  - size_bytes
  - checksum
  - upload_status
  - parse_status
  - parse_error
  - created_at

- Chunk
  - id
  - project_id
  - document_id
  - chunk_index
  - content
  - metadata
  - embedding reference

- IndexJob
  - id
  - project_id
  - status
  - trigger_reason
  - progress_current
  - progress_total
  - started_at
  - finished_at
  - error_message
  - config_snapshot

- ChatSession
  - id
  - project_id
  - title
  - created_at
  - updated_at

- ChatMessage
  - id
  - session_id
  - role
  - content
  - sources
  - provider_metadata
  - created_at

- ProviderConfig
  - id
  - scope: global in v1
  - api_base_url
  - api_key reference
  - llm_model
  - embedding_model
  - temperature
  - top_k
  - chunk_size
  - chunk_overlap
  - system_prompt
  - speech settings

## Source of truth for metadata and vectors

The plan must be explicit about what data lives where.

- SQLite is the source of truth for application metadata
  - projects
  - documents
  - index jobs
  - chat sessions
  - chat messages
  - provider configuration
  - chunk metadata needed for auditability, document previews, and cleanup
- ChromaDB is the source of truth for vector retrieval data
  - embeddings
  - vector similarity search structures
  - chunk payloads required for retrieval

Rules:

- document lifecycle state is authoritative in SQLite
- indexing lifecycle state is authoritative in SQLite
- deletions and cleanup decisions are driven from SQLite metadata, then applied to ChromaDB
- chunk IDs must be stable across SQLite and ChromaDB so the two stores can be reconciled
- if ChromaDB and SQLite disagree, SQLite drives repair and reconciliation workflows

## API Surface

The new backend should expose stable versioned endpoints under `/api/v1`.

- Projects
  - `GET /api/v1/projects`
  - `POST /api/v1/projects`
  - `GET /api/v1/projects/{project_id}`
  - `PATCH /api/v1/projects/{project_id}`
  - `DELETE /api/v1/projects/{project_id}`

- Documents
  - `GET /api/v1/projects/{project_id}/documents`
  - `POST /api/v1/projects/{project_id}/documents`
  - `GET /api/v1/projects/{project_id}/documents/{document_id}`
  - `DELETE /api/v1/projects/{project_id}/documents/{document_id}`

- Indexing
  - `POST /api/v1/projects/{project_id}/index-jobs`
  - `GET /api/v1/projects/{project_id}/index-jobs`
  - `GET /api/v1/index-jobs/{job_id}`
  - `POST /api/v1/index-jobs/{job_id}/cancel`
  - `POST /api/v1/index-jobs/{job_id}/retry`

- Chat
  - `GET /api/v1/projects/{project_id}/sessions`
  - `POST /api/v1/projects/{project_id}/sessions`
  - `GET /api/v1/sessions/{session_id}`
  - `GET /api/v1/sessions/{session_id}/messages`
  - `POST /api/v1/sessions/{session_id}/messages`
  - `GET /api/v1/sessions/{session_id}/stream?message_id={assistant_message_id}`
  - `POST /api/v1/sessions/{session_id}/cancel`
  - `DELETE /api/v1/sessions/{session_id}`

- Config and providers
  - `GET /api/v1/config`
  - `PATCH /api/v1/config`
  - `POST /api/v1/config/test-connection`
  - `GET /api/v1/providers/models`

- Speech
  - `POST /api/v1/speech/transcriptions`
  - `POST /api/v1/speech/synthesis`

- Health and diagnostics
  - `GET /api/v1/health/live`
  - `GET /api/v1/health/ready`
  - `GET /api/v1/system/status`

## Job execution model

The job model must be explicit for v1.

- v1 uses an in-process job runner started by the FastAPI application
- the runner reads and updates persisted job records in SQLite
- only one logical job executor runs per application instance in v1
- jobs must be restart-safe
- jobs must update status transitions in persisted storage
- retries must create a new job record linked to the original job
- cancel requests must mark intent in SQLite, and job handlers must check for cancelation between safe work steps

Required job states:

- `pending`
- `running`
- `completed`
- `failed`
- `canceled`

Required job metadata:

- trigger reason
- effective config snapshot
- timestamps
- progress fields
- last error message if failed

## Streaming protocol contract

The streaming contract must be explicit so backend and frontend teams can implement
independently without guessing.

- transport: Server-Sent Events
- stream endpoint: `GET /api/v1/sessions/{session_id}/stream`
- the client sends a user message first through `POST /api/v1/sessions/{session_id}/messages`
- that write creates a pending assistant turn to be fulfilled by the stream
- the stream emits ordered events for that pending assistant turn only

Required SSE event types:

- `message_start`
  - includes assistant message ID and session ID
- `token`
  - includes incremental text content
- `sources`
  - includes normalized source metadata for the completed answer
- `message_complete`
  - marks successful completion of the assistant message
- `error`
  - marks stream failure with structured error payload
- `done`
  - terminal event for stream completion

Rules:

- event ordering must be deterministic
- token events may be repeated many times
- `sources` must arrive before `message_complete`
- `done` is always the final event
- malformed partial JSON across network chunks must not break the protocol
- cancellation must end the stream with either `error` plus a canceled code or a distinct canceled terminal payload defined in the API contract
- the frontend must key streaming state by assistant message ID, not by a loose global loading flag

## Frontend Product Structure

The frontend should be rebuilt around explicit product areas.

- App shell
  - top navigation or left navigation
  - active project indicator
  - system status indicator
  - persistent notifications area

- Projects view
  - list and search projects
  - create and edit metadata
  - select active project
  - safer delete flow

- Knowledge Base view
  - upload files
  - inspect document status
  - see parse and indexing health
  - preview document metadata
  - rebuild or retry indexing

- Chat view
  - session list
  - message thread
  - source drawer or side panel
  - stop and retry controls
  - STT and TTS controls

- Settings view
  - basic settings visible by default
  - advanced settings intentionally hidden behind an expandable advanced area, drawer, modal, or separate expert-oriented view
  - provider settings
  - retrieval settings
  - speech settings
  - connection test
  - capability and validation feedback

- Status and diagnostics
  - background jobs
  - health state
  - recent failures

## UX Requirements

- Every asynchronous action must have visible pending, success, and failure states.
- Every destructive action must have confirmation.
- Empty states must teach the user what to do next.
- Error messages must be specific enough to be actionable.
- The app must work on laptop and mobile widths.
- Keyboard navigation and focus behavior must be considered part of the design, not post-work.
- Streaming responses must not break when network chunks split JSON messages.
- advanced configuration must not be placed in the primary user flow by default
- expert controls should be available, but clearly separated from everyday actions
- The user must never wonder whether indexing is happening.

## Security and Safety Requirements

- No hardcoded keys in source control.
- Validate all incoming payloads at the API boundary.
- Normalize and sanitize filenames and project names.
- Prevent path traversal and unsafe deletion.
- Keep secrets in environment variables or a managed secret store.
- Restrict dangerous provider or filesystem settings from casual editing.
- If hosted, introduce auth before calling the app production-ready.

## Deployment posture

The implementation target for v1 must be explicit.

- default posture: locally hosted or privately hosted single-user application
- public multi-user hosting is not a v1 assumption
- if the deployment target changes to shared or public hosting, an ADR must define the auth, session, and rate-limiting model before implementation proceeds

## Testing Strategy

Testing must be part of the implementation from day one.

- Backend unit tests
  - project service
  - document service
  - indexing service
  - chat service
  - provider adapters
  - validation and error handling

- Backend integration tests
  - create project
  - upload documents
  - start indexing
  - poll job
  - create chat session
  - ask question
  - stream response

- Frontend component tests
  - project flows
  - document flows
  - indexing states
  - chat streaming states
  - settings validation
  - speech controls

- Frontend end-to-end tests
  - first-time setup
  - happy path chat
  - failed indexing
  - provider misconfiguration
  - network failure recovery

- External dependency strategy
  - mock LLM, embedding, STT, and TTS providers for deterministic tests
  - keep live-provider tests separate and optional

## Delivery Phases

## Phase 0: Product and technical specification

- freeze scope for the required feature set and planned enhancements
- confirm the approved v1 tech stack and operational targets
- confirm the deployment posture and config ownership rules
- define API contracts before building routes
- define the demo narrative and showcase workflows
- define the visual direction, UI principles, and design references

Deliverable:
- approved architecture and feature spec

## Phase 1: Repository and platform scaffold

- create new backend app structure
- create new frontend app structure
- set up linting, formatting, testing, and CI
- set up environment configuration
- set up migration tooling

Deliverable:
- empty but runnable backend and frontend with CI passing

## Phase 2: Core backend domain

- implement project, document, config, and job models
- implement persistence layer
- implement provider abstractions
- implement safe storage handling

Deliverable:
- backend CRUD and config APIs with tests

## Phase 3: Document ingestion and indexing

- implement file upload pipeline
- implement parsing and chunking
- implement embeddings and vector storage
- implement background indexing jobs
- implement job status APIs

Deliverable:
- reliable ingestion and indexing workflow

## Phase 4: Chat and retrieval

- implement session and message models
- implement retrieval orchestration
- implement streamed answer endpoint
- implement source attribution format
- implement stop and retry semantics where feasible

Deliverable:
- complete chat API with source-backed answers

## Phase 5: Frontend product implementation

- implement the approved visual system and interaction patterns
- implement app shell
- implement project experience
- implement knowledge base experience
- implement chat experience
- implement settings and diagnostics
- implement robust async state handling

Deliverable:
- usable end-to-end frontend with the full required feature set and key UX upgrades

## Phase 6: Speech and advanced capabilities

- implement STT and TTS adapters
- implement frontend speech controls
- implement saved sessions
- implement source detail and preview UX
- implement CLI commands for key operational workflows
- implement evaluation tooling for retrieval and answer quality

Deliverable:
- advanced user workflows complete

## Phase 7: Production hardening

- health endpoints
- structured logs
- request tracing
- deployment config
- optional auth and rate limiting
- backup and migration strategy

Deliverable:
- production-ready deployment candidate

## Phase 8: Launch and rollout

- launch the new implementation through a controlled rollout
- import compatible projects and documents if historical data needs to be carried forward
- verify the acceptance checklist
- rehearse the showcase workflows under demo conditions
- finalize launch, documentation, and operational handoff

Deliverable:
- production launch completed safely

## Suggested Repository Layout

```text
backend/
  app/
    api/
    core/
    domain/
    services/
    providers/
    storage/
      contracts/
      sqlite/
      chroma/
      files/
    workers/
    schemas/
  migrations/
  tests/

frontend/
  src/
    app/
    routes/
    features/
      projects/
      documents/
      indexing/
      chat/
      settings/
      speech/
    components/
    lib/
    hooks/
    types/
  tests/

docs/
  greenfield-product-plan.md
```

## Acceptance Criteria

The implementation is successful only if all of the following are true.

- the full required feature set exists in the new application
- the backend no longer relies on global mutable app state
- the frontend no longer uses untyped API contracts
- indexing is asynchronous and visible
- chat sessions are persisted
- the streaming protocol is implemented as documented and verified by tests
- SQLite is the source of truth for application metadata
- ChromaDB is used only through the `VectorIndex` abstraction
- major failure states are surfaced clearly
- the test suite is deterministic without live provider dependencies
- secrets are not stored in source code
- the app can be deployed and operated without manual guesswork

## Demo-Readiness Acceptance Criteria

The application is demo-ready only if all of the following are true.

- the showcase workflows can be completed smoothly without manual intervention
- first-time project setup is visually clear and confidence-inspiring
- document upload and indexing states are polished and easy to explain live
- streamed answers appear stable, fast, and well-presented
- source attribution is easy to inspect and strengthens trust in the answer
- advanced settings do not clutter the main experience and remain available when needed
- the UI looks intentional and professional on the target demo device
- common recoverable failures can be demonstrated or recovered from cleanly
- the product supports a presenter-led narrative without awkward transitions or confusion

## Out of Scope for Initial Release

These items can be deferred unless the target deployment requires them immediately.

- multi-user collaboration
- granular roles and permissions
- billing and quotas
- analytics dashboards beyond basic diagnostics
- advanced document annotation workflows

## Planned V2 Capabilities

These capabilities are intentionally deferred until after the initial release, but
the v1 architecture should avoid blocking them.

- agentic RAG workflows
  - query rewriting before retrieval
  - multi-step or multi-hop retrieval
  - retrieval quality checks and retry logic
  - tool-using answer pipelines where appropriate
  - iterative answer refinement when the first retrieval pass is insufficient

V2 constraint:

- v1 should keep chat orchestration, retrieval, and provider/tool integration modular so
  agentic workflows can be introduced without rewriting the entire application

V1 implementation rule derived from that constraint:

- implement chat orchestration as replaceable workflow components, not a single fixed request path
- keep retrieval planning, document retrieval, answer synthesis, and optional post-processing as separate steps in code
- avoid names and structures that assume exactly one retrieval pass forever
- define interfaces that allow future insertion of query rewriting, retrieval evaluation, reranking, and tool invocation
- do not couple the frontend contract to a single-step internal execution model

## Planned V3 Direction

The longer-term target is a multi-tenant SaaS version of AnswerStack.

Implications for earlier versions:

- v1 and v2 do not need to implement multi-tenant behavior
- v1 and v2 should avoid architecture choices that make tenant isolation unusually hard later
- metadata models, storage abstractions, auth assumptions, and deployment boundaries should remain compatible with a future tenant-aware design
- a formal ADR should be required before any v3 work begins to define tenancy model, auth, authorization, billing boundaries, and isolation requirements

## V1 Design Constraints for Future SaaS

V1 should remain intentionally simple, but it should not create unnecessary blockers for
the planned multi-tenant SaaS direction.

- use stable internal IDs for projects, documents, jobs, sessions, and messages
- avoid relying on filenames, local paths, or UI-selected names as primary identifiers
- keep metadata access behind repository interfaces so future tenant scoping can be added centrally
- avoid process-global mutable state for user-relevant workflows
- keep storage access behind adapters so local filesystem assumptions do not spread through the app
- keep API contracts neutral enough that ownership or tenant context can be introduced later
- prefer data models that can accept future ownership fields such as `owner_id` or `tenant_id` without redesigning the whole model
- keep authorization, billing, and tenant isolation concerns out of v1 business logic, but do not make them impossible to layer in later

## First Build Recommendation

If this plan is approved, the first implementation slice should be:

- backend scaffold with FastAPI, schemas, config, and project CRUD
- frontend scaffold with routing, typed API client, and app shell
- initial persistence layer and migrations
- CI and deterministic test harness

That gives the new codebase a clean center of gravity before retrieval, indexing, and
speech features are added.

## Appendix A: API Contract Examples

These examples are not full schemas, but they define the expected shape closely enough
for backend and frontend teams to align implementation.

Contract rules:

- non-streaming JSON endpoints should use the standard response envelope
- SSE and binary responses are exceptions and should follow their own documented contracts
- list endpoints should still use the standard envelope, with the list stored under `data`
- HTTP status codes and structured error codes must both be meaningful
- any field added to these examples later should be treated as an API contract change

Recommended HTTP status guidance:

- `200 OK` for successful reads and non-creation synchronous actions
- `201 Created` for created resources
- `202 Accepted` for accepted asynchronous work
- `400 Bad Request` for malformed input
- `409 Conflict` for valid requests that conflict with current state
- `422 Unprocessable Entity` for semantically invalid input
- `503 Service Unavailable` for unavailable providers or optional subsystems

### Standard response envelope

Successful non-streaming responses should use a predictable envelope.

```json
{
  "data": {},
  "meta": {
    "request_id": "req_123",
    "timestamp": "2026-03-25T14:30:00Z"
  }
}
```

Structured error responses should use this shape.

```json
{
  "error": {
    "code": "provider_unreachable",
    "message": "Could not connect to the configured provider.",
    "retryable": true,
    "suggested_action": "test_connection"
  },
  "meta": {
    "request_id": "req_124",
    "timestamp": "2026-03-25T14:31:00Z"
  }
}
```

Error response rules:

- `code` must be stable and machine-readable
- `message` must be safe to display to end users
- `retryable` should reflect whether the same user action may reasonably succeed later
- `suggested_action` should map to a real UI action when possible

### Binary response example for `POST /api/v1/speech/synthesis`

Response rules:

- success returns raw audio bytes, not a JSON envelope
- `Content-Type` should reflect the actual audio format, such as `audio/mpeg` or `audio/wav`
- failures return the standard structured JSON error shape

### `GET /api/v1/config`

```json
{
  "data": {
    "api_base_url": "http://localhost:1234/v1",
    "api_key_configured": true,
    "llm_model": "answer-model",
    "embedding_model": "embedding-model",
    "temperature": 0.4,
    "top_k": 4,
    "chunk_size": 700,
    "chunk_overlap": 80,
    "system_prompt": "Answer using the provided sources only.",
    "speech": {
      "stt_enabled": true,
      "tts_enabled": true,
      "tts_voice": "alloy"
    },
    "capabilities": {
      "provider": "available",
      "models": "available",
      "stt": "available",
      "tts": "available"
    }
  },
  "meta": {
    "request_id": "req_cfg_1",
    "timestamp": "2026-03-25T14:32:00Z"
  }
}
```

### `GET /api/v1/system/status`

```json
{
  "data": {
    "readiness": "ready",
    "active_project_id": "proj_1",
    "active_job_count": 0,
    "provider_status": "available",
    "speech_status": {
      "stt": "available",
      "tts": "available"
    },
    "last_indexed_at": "2026-03-25T14:40:00Z"
  },
  "meta": {
    "request_id": "req_status_1",
    "timestamp": "2026-03-25T14:43:00Z"
  }
}
```

Contract note:

- `GET /api/v1/config` is the detailed configuration and capability endpoint
- `GET /api/v1/system/status` is the concise readiness and operational status endpoint for banners, badges, and quick status views

### `POST /api/v1/projects/{project_id}/documents`

Request content type:

- `multipart/form-data`

Response after upload acceptance:

```json
{
  "data": {
    "uploaded": [
      {
        "document_id": "doc_1",
        "filename": "quarterly-report.pdf",
        "status": "uploaded"
      }
    ],
    "duplicates": [],
    "rejected": []
  },
  "meta": {
    "request_id": "req_docs_1",
    "timestamp": "2026-03-25T14:33:00Z"
  }
}
```

Upload rules:

- v1 should reject exact duplicates by default using filename plus checksum comparison
- duplicates should be returned in the `duplicates` list, not silently replaced
- rejected items should include a filename and machine-readable reason code
- partial success is allowed and should return a successful response with populated `uploaded`, `duplicates`, and `rejected` arrays
- asynchronous parsing and indexing work triggered by upload should be represented separately through document state and index jobs

### `GET /api/v1/projects/{project_id}/documents`

```json
{
  "data": [
    {
      "document_id": "doc_1",
      "filename": "quarterly-report.pdf",
      "content_type": "application/pdf",
      "size_bytes": 245001,
      "status": "indexed",
      "parse_error": null,
      "indexed_at": "2026-03-25T14:40:00Z",
      "chunk_count": 24
    }
  ],
  "meta": {
    "request_id": "req_docs_2",
    "timestamp": "2026-03-25T14:41:00Z"
  }
}
```

### `POST /api/v1/projects/{project_id}/index-jobs`

```json
{
  "data": {
    "job_id": "job_1",
    "status": "pending",
    "trigger_reason": "manual_rebuild"
  },
  "meta": {
    "request_id": "req_job_1",
    "timestamp": "2026-03-25T14:42:00Z"
  }
}
```

### `GET /api/v1/index-jobs/{job_id}`

```json
{
  "data": {
    "job_id": "job_1",
    "project_id": "proj_1",
    "status": "running",
    "trigger_reason": "manual_rebuild",
    "progress_current": 3,
    "progress_total": 10,
    "last_error": null,
    "started_at": "2026-03-25T14:42:01Z",
    "finished_at": null,
    "config_snapshot": {
      "embedding_model": "embedding-model",
      "chunk_size": 700,
      "chunk_overlap": 80
    }
  },
  "meta": {
    "request_id": "req_job_2",
    "timestamp": "2026-03-25T14:42:20Z"
  }
}
```

### `POST /api/v1/sessions/{session_id}/messages`

Request:

```json
{
  "content": "What changed in the quarterly report?",
  "role": "user"
}
```

Response:

```json
{
  "data": {
    "user_message_id": "msg_user_1",
    "assistant_message_id": "msg_assistant_1",
    "session_id": "session_1",
    "stream_url": "/api/v1/sessions/session_1/stream?message_id=msg_assistant_1"
  },
  "meta": {
    "request_id": "req_chat_1",
    "timestamp": "2026-03-25T14:45:00Z"
  }
}
```

Rules:

- one user message creates at most one pending assistant message
- v1 enforces at most one active pending assistant message per session at a time
- `stream_url` must identify the exact assistant message to stream
- the backend should return a conflict-style error if the client tries to start another assistant turn while one is still pending

### Streaming events for `GET /api/v1/sessions/{session_id}/stream`

```text
event: message_start
data: {"assistant_message_id":"msg_assistant_1","session_id":"session_1"}

event: token
data: {"assistant_message_id":"msg_assistant_1","content":"The report highlights "}

event: token
data: {"assistant_message_id":"msg_assistant_1","content":"three major changes..."}

event: sources
data: {
  "assistant_message_id":"msg_assistant_1",
  "sources":[
    {
      "document_id":"doc_1",
      "filename":"quarterly-report.pdf",
      "snippet":"Revenue grew 18% year-over-year...",
      "chunk_id":"chunk_19"
    }
  ]
}

event: message_complete
data: {"assistant_message_id":"msg_assistant_1"}

event: done
data: {"assistant_message_id":"msg_assistant_1"}
```

Streaming rules:

- the API surface must explicitly allow the `message_id` query parameter used by `stream_url`
- optional heartbeat events may be sent to keep the connection alive during long-running provider calls
- error events must include a machine-readable error code and user-safe message
- if an `error` event is terminal, the backend must document whether a final `done` event follows; v1 should send `done` after terminal `error` for consistency
- the frontend must treat `assistant_message_id` as the primary stream correlation key

## Appendix B: Canonical State Models

The following states are canonical. Backend and frontend should use the same
vocabulary.

### Project readiness state

- `ready`
- `no_documents`
- `indexing`
- `stale`
- `misconfigured`
- `degraded`

Allowed meanings:

- `ready`: the user can ask questions successfully
- `no_documents`: the selected project has no usable documents
- `indexing`: ingestion or indexing is in progress
- `stale`: document or config changes require reindexing
- `misconfigured`: provider or required settings are invalid
- `degraded`: the app is partially usable but some capabilities are unavailable

### Document lifecycle state

- `uploaded`
- `parsing`
- `parsed`
- `indexing`
- `indexed`
- `failed`
- `stale`
- `reindex_required`

Suggested transitions:

- `uploaded -> parsing`
- `parsing -> parsed`
- `parsed -> indexing`
- `indexing -> indexed`
- `uploaded|parsing|parsed|indexing -> failed`
- `indexed -> stale`
- `stale -> reindex_required`
- `reindex_required -> indexing`

Meaning:

- `stale` means the document or its indexed representation is still present and may remain visible, but it is outdated relative to current source content or settings
- `reindex_required` means the system should not treat the current indexed state as reliable for fresh answers until reindexing completes

### Index job lifecycle state

- `pending`
- `running`
- `completed`
- `failed`
- `canceled`

Suggested transitions:

- `pending -> running`
- `running -> completed`
- `running -> failed`
- `pending|running -> canceled`

### Chat streaming state

- `idle`
- `submitting`
- `queued`
- `streaming`
- `completed`
- `failed`
- `canceled`

Suggested transitions:

- `idle -> submitting`
- `submitting -> queued`
- `submitting -> streaming`
- `queued -> streaming`
- `streaming -> completed`
- `submitting|queued|streaming -> failed`
- `submitting|queued|streaming -> canceled`

### Provider capability state

- `unknown`
- `available`
- `unavailable`
- `misconfigured`
- `disabled`

### Speech capability state

- `unknown`
- `available`
- `disabled`
- `unavailable`
- `misconfigured`

Rules:

- these state names should be reused across backend schemas, frontend types, tests, and documentation
- avoid inventing alternate names for the same concept in different layers
- any new state added later should be reviewed as an API contract change

## Appendix C: Demo MVP Priority Table

This table defines what matters for the expert demo.

### Must-have for demo

- polished app shell and visual system
- project creation and selection
- provider connection validation
- document upload with clear progress and status
- indexing job progress and status
- source-grounded chat with stable streaming
- source inspection panel
- basic settings flow
- advanced settings hidden but accessible
- structured failure states and recovery actions
- stable demo path with seeded or known-good data option
- saved chat sessions
- rename and resume session flow
- TTS playback
- STT input
- system status view
- reset-to-known-state flow
- more refined source previews and highlighting

### Post-demo or v1.1

- expanded evaluation tooling UX
- richer diagnostics history
- public-hosting hardening
- advanced analytics
- v2 agentic RAG workflows

Priority rule:

- if a must-have item is at risk, cut should-have work before cutting quality on a showcase workflow
- if a showcase workflow is unstable, stabilize it before adding adjacent features
- if time becomes constrained, cut breadth before cutting polish on `Workflow 2` and `Workflow 3`

## Appendix D: UX and Layout Specification

These rules are intended to reduce design drift during implementation.

### Primary layout

- use a three-zone mental model where practical
  - navigation and project context
  - primary workspace
  - contextual details such as sources or status
- default navigation pattern should be a left-side primary navigation on desktop, with a responsive collapsed or drawer variant on narrower screens
- the primary workspace should favor the chat or knowledge workflow currently in focus
- system status should be visible without occupying excessive space

### First-run experience

- the first visible screen should orient the user quickly
- the initial call to action should be singular and obvious
- the user should not see advanced technical controls before basic setup succeeds

### Empty-state hierarchy

- no project selected
  - primary action: create or select a project
- provider not configured or unreachable
  - primary action: test connection or update configuration
- no documents uploaded
  - primary action: upload documents
- documents uploaded but not yet indexed
  - primary action: start or monitor indexing
- no chat history
  - primary action: ask the first question or use a suggested prompt

### Settings placement

- basic settings belong in the main settings view
- advanced settings belong in a hidden advanced section, drawer, modal, or separate expert view
- advanced settings should not dominate the visual hierarchy
- the advanced entry point should be visible enough for expert users to find, but quiet enough not to distract first-time users
- the main settings view is optimized for normal users and presenters
- the advanced settings experience is optimized for expert operators

### Knowledge base view behavior

- uploaded files must immediately appear with a clear state
- indexing progress must be visible without navigating away
- failed files must explain why they failed and what can be done next

### Chat view behavior

- the composer should remain anchored and predictable
- message streaming should not cause layout instability
- source inspection should not hide the entire conversation
- answer trust cues should be visible near the response, not buried elsewhere
- desktop layouts should allow conversation and source inspection together where practical
- narrower layouts may switch source inspection into a drawer or stacked view
- the preferred desktop behavior is a split-view or easy side-panel toggle for sources, not a disruptive full-screen modal

### Status placement

- global application readiness should appear in the app shell
- local workflow status should appear inside each major workspace
  - document ingestion and indexing status in the knowledge base view
  - chat generation and source trust signals in the chat view
  - provider and capability status in the settings or diagnostics area
- status presentation should be compact but always understandable at a glance

### Visual interaction rules

- loading indicators should match the importance of the action
- destructive actions should use distinct styling and confirmation copy
- badges and status chips should have consistent meaning across the product
- notification toasts should supplement inline feedback, not replace it

### Copy and labeling rules

- use product language, not framework or backend language
- prefer action-oriented labels
- explain blocked states in plain language
- avoid exposing tuning jargon unless the user is inside an advanced context

## Appendix E: Implementation Readiness Gate

Implementation should proceed beyond scaffolding only after all of the following are
true.

- API contract appendix has been accepted
- canonical state names have been accepted
- must-have demo scope has been accepted
- visual direction and layout rules have been accepted
- advanced settings placement has been accepted

If any of these remain unresolved, implementation may continue only for scaffolding,
infrastructure setup, and interface definition work.

Recommended review order:

1. accept the demo MVP priority table
2. accept the canonical state models
3. accept the API contract examples
4. accept the UX and layout specification
