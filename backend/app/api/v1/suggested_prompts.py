"""Suggested prompts endpoint for chat empty state."""

import json
import time
from uuid import UUID

import structlog
from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import async_sessionmaker

from answerstack.provider import ProviderService
from answerstack.vector import VectorRepository

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}", tags=["chat"])

# In-memory cache: { project_id: { "prompts": [...], "expires_at": float } }
_prompt_cache: dict[str, dict] = {}
CACHE_TTL = 300  # 5 minutes per D-51

STATIC_PROMPTS = [
    "What are the main topics covered?",
    "Summarize the key findings",
    "What are the most important conclusions?",
    "Explain the methodology used",
]


def invalidate_prompt_cache(project_id: str) -> None:
    """Remove the cached prompts for a given project, forcing regeneration."""
    _prompt_cache.pop(project_id, None)


async def generate_and_cache_prompts(
    project_id: str,
    vector_repo: VectorRepository,
    provider_service: ProviderService,
    session_factory: async_sessionmaker,
) -> list[str]:
    """Generate suggested prompts from project content and cache the result.

    This is a standalone function that can be called from both the endpoint
    and background tasks (e.g., after indexing completes). It never raises --
    on any failure it returns STATIC_PROMPTS.
    """
    import asyncio

    cache_key = project_id
    now = time.time()

    # Check cache first
    if cache_key in _prompt_cache and _prompt_cache[cache_key]["expires_at"] > now:
        return _prompt_cache[cache_key]["prompts"]

    if not provider_service.is_configured:
        return STATIC_PROMPTS

    try:
        # Fetch sample chunks from ChromaDB (10 random)
        collection_name = f"project_{project_id}"
        results = await asyncio.to_thread(
            vector_repo.query_random_chunks,
            collection_name=collection_name,
            n=10,
        )

        if not results:
            return STATIC_PROMPTS

        # Build prompt for LLM
        chunk_texts = "\n---\n".join(results)
        system_prompt = (
            "You are a helpful assistant. Given the following document excerpts, "
            "generate exactly 4 short questions (max 10 words each) that a user might ask. "
            "Return ONLY a JSON array of 4 strings, nothing else."
        )

        client = provider_service._client

        # Get current model from settings
        from app.repositories.settings import SQLAlchemySettingsRepository

        async with session_factory() as db_session:
            settings_repo = SQLAlchemySettingsRepository(db_session)
            settings = await settings_repo.get()
            model = settings.provider_model

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Document excerpts:\n{chunk_texts}"},
            ],
            temperature=0.7,
        )

        content = response.choices[0].message.content or "[]"
        # Parse JSON array from response
        prompts = json.loads(content)
        if not isinstance(prompts, list) or len(prompts) == 0:
            prompts = STATIC_PROMPTS
        else:
            prompts = [str(p) for p in prompts[:4]]

        # Cache result
        _prompt_cache[cache_key] = {
            "prompts": prompts,
            "expires_at": now + CACHE_TTL,
        }

        return prompts

    except Exception:
        logger.exception(
            "Failed to generate suggested prompts", project_id=project_id
        )
        return STATIC_PROMPTS


@router.get("/suggested-prompts")
async def get_suggested_prompts(
    project_id: UUID,
    request: Request,
):
    """Generate suggested prompts based on project content.

    Fetches sample chunks from ChromaDB, asks LLM to generate questions.
    Returns cached results for 5 minutes per project.
    """
    provider_service = request.app.state.provider_service
    vector_repo = request.app.state.vector_repo
    session_factory = request.app.state.session_factory

    prompts = await generate_and_cache_prompts(
        project_id=str(project_id),
        vector_repo=vector_repo,
        provider_service=provider_service,
        session_factory=session_factory,
    )

    return {"prompts": prompts}
