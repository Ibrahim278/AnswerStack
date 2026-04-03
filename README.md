# AnswerStack

A project-based RAG application for building knowledge bases from your documents. Upload files, build vector indexes, and ask questions with streamed answers and source citations. Supports speech-to-text and text-to-speech.

Single-user, self-hosted. SQLite for metadata, ChromaDB for vectors, local filesystem for document storage. Works with any OpenAI-compatible LLM provider.

## Features

- Create multiple knowledge projects with separate document collections
- Upload PDF, Markdown, and plain text documents
- Automatic chunking with configurable size and overlap
- Vector indexing with incremental rebuild support
- Conversational chat with streamed responses and source citations
- FlashRank reranking for improved retrieval quality
- Multi-provider text-to-speech: Piper, Kokoro, ElevenLabs
- Speech-to-text via ElevenLabs
- Hardened RAG prompts with injection and hallucination defenses

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager
- [bun](https://bun.sh/) runtime
- An OpenAI-compatible LLM provider

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your provider URL, API key, and model names
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
bun install
bun run dev
```

The frontend dev server runs on port 8080 and proxies API requests to the backend on port 8000.

## Project Structure

```
answerstack/
  backend/       FastAPI backend, API routes, services, database
  core/          answerstack library: parsing, chunking, embedding, retrieval, RAG pipeline
  frontend/      React SPA with TypeScript, Vite, shadcn/ui
```

The `core/` package is a standalone RAG engine installed as a workspace dependency by the backend. It handles document parsing, text chunking, embedding, vector storage, retrieval with reranking, and the streaming RAG pipeline. All provider communication goes through an OpenAI-compatible abstraction.

## Configuration

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Description |
|----------|-------------|
| `PROVIDER_URL` | Base URL of your OpenAI-compatible API |
| `PROVIDER_API_KEY` | API key for the provider |
| `PROVIDER_MODEL` | Model name for chat completions |
| `EMBEDDING_MODEL` | Model name for embeddings |
| `DATABASE_URL` | SQLite connection string |
| `CHROMADB_PATH` | Path for ChromaDB vector storage |
| `TTS_PROVIDER` | Text-to-speech provider: `piper`, `kokoro`, or `elevenlabs` |
| `STT_PROVIDER` | Speech-to-text provider: `elevenlabs` |

See `.env.example` for the full list of options including chunk size, upload limits, and speech provider settings.

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

## License

All rights reserved.
