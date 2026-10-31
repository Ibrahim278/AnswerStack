# AnswerStack

AnswerStack is a self-hosted, project-based Retrieval-Augmented Generation (RAG) application that lets you build private knowledge bases from your own documents and query them through a conversational chat interface. Rather than relying on a general-purpose LLM with no awareness of your specific content, AnswerStack grounds every response in the documents you provide — returning streamed answers with inline source citations so you always know where the information came from.

The application is organized around projects: each project has its own isolated document collection, vector index, and chat history, making it easy to maintain separate knowledge bases for different topics, teams, or use cases. Documents are parsed, chunked, and embedded into a ChromaDB vector store, then retrieved at query time using semantic search with optional FlashRank reranking to surface the most relevant passages. The full RAG pipeline runs through any OpenAI-compatible LLM provider, so you can point it at a cloud API or a locally hosted model without changing anything else.

AnswerStack is designed to be simple to run and own: a single FastAPI backend, a React frontend, SQLite for metadata, and local filesystem storage for documents. There are no external services required beyond an LLM provider. Speech-to-text and text-to-speech are available as optional add-ons for a hands-free experience.

## Features

- Create multiple knowledge projects with separate document collections
- Upload PDF, Markdown, and plain text documents
- Automatic chunking with configurable size and overlap
- Vector indexing with incremental rebuild support
- Conversational chat with streamed responses and source citations
- Multi-provider support — configure and switch between LLM providers from the UI
- Configurable retrieval: top-k, similarity threshold, reasoning effort
- FlashRank reranking for improved retrieval quality
- AI-generated suggested prompts based on project content
- Multi-provider text-to-speech: Piper, Kokoro, ElevenLabs
- Speech-to-text via ElevenLabs
- Hardened RAG prompts with injection and hallucination defenses

## Prerequisites

- Ubuntu/Debian (or compatible)
- An OpenAI-compatible LLM provider

## Quick Start

```bash
./scripts/setup.sh       # install dependencies, run migrations, create .env
./scripts/run.sh dev     # backend (port 8000) + vite dev server (port 8080)
./scripts/run.sh prod    # build frontend, serve everything on port 8000
```

Once running, open the app and configure your LLM provider in Settings.

The setup script installs [uv](https://docs.astral.sh/uv/), Python 3.12, and [bun](https://bun.sh/) if not already present.

### Manual Setup

If you prefer to set up each part individually:

```bash
# Install all Python dependencies (workspace: backend + core)
uv sync

# Backend
cd backend
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (in a separate terminal)
cd frontend
bun install
bun run dev
```

The frontend dev server runs on port 8080 and proxies API requests to the backend on port 8000.

## Project Structure

```
backend/       FastAPI backend, API routes, services, database
core/          answerstack library: parsing, chunking, embedding, retrieval, RAG pipeline
frontend/      React SPA with TypeScript, Vite, shadcn/ui
scripts/       Setup and run scripts
```

The `core/` package is a standalone RAG engine installed as a workspace dependency by the backend. It handles document parsing, text chunking, embedding, vector storage, retrieval with reranking, and the streaming RAG pipeline. All provider communication goes through an OpenAI-compatible abstraction.

## Configuration

LLM providers are configured in the Settings page of the UI (provider URL, API key, chat model, embedding model). You can add multiple providers and switch between them.

The `.env` file handles infrastructure and speech settings:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite connection string |
| `CHROMADB_PATH` | Path for ChromaDB vector storage |
| `DOCUMENT_STORAGE_PATH` | Path for uploaded documents |
| `TTS_PROVIDER` | Text-to-speech provider: `piper`, `kokoro`, or `elevenlabs` |
| `STT_PROVIDER` | Speech-to-text provider: `elevenlabs` |

See `.env.example` for all options including upload limits and speech provider settings.

## Running Tests

```bash
# Backend
cd backend
uv run pytest

# Core library
cd core
uv run pytest

# Frontend
cd frontend
bun run test
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy async, aiosqlite |
| Database | SQLite with WAL mode |
| Vector store | ChromaDB |
| Embeddings | OpenAI-compatible API |
| Reranking | FlashRank |
| Frontend | React 18, TypeScript, Vite |
| UI | shadcn/ui, Radix, Tailwind CSS |
| State | Zustand, TanStack Query |
| Package managers | uv, bun |

## Repo

https://github.com/rwadud/AnswerStack

## License

All rights reserved.
