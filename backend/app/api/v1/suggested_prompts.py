"""Suggested prompts endpoint for chat empty state."""

import json
import re
import time
from uuid import UUID

import structlog
from answerstack.provider import ProviderService
from answerstack.streaming import strip_thinking_blocks
from answerstack.vector import VectorRepository
from fastapi import APIRouter, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.project import Project

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}", tags=["chat"])

# In-memory cache: { project_id: { "prompts": [...], "expires_at": float } }
_prompt_cache: dict[str, dict] = {}
# Long TTL since prompts are only regenerated during indexing, not on every request.
CACHE_TTL = 86400  # 24 hours

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

    # Check in-memory cache first
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

        create_kwargs: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Document excerpts:\n{chunk_texts}"},
            ],
            "temperature": 0.7,
        }
        if settings.reasoning_effort and settings.reasoning_effort != "":
            create_kwargs["reasoning_effort"] = settings.reasoning_effort

        response = await client.chat.completions.create(**create_kwargs)

        raw_content = response.choices[0].message.content or "[]"
        logger.info(
            "Suggested prompts LLM response",
            project_id=project_id,
            raw_content=raw_content[:500],
        )
        # Strip thinking blocks, then markdown code fences
        content = strip_thinking_blocks(raw_content)
        content = re.sub(r"^```(?:json)?\s*\n?", "", content.strip())
        content = re.sub(r"\n?```\s*$", "", content.strip())
        # Parse JSON array from response
        prompts = json.loads(content)
        if not isinstance(prompts, list) or len(prompts) == 0:
            logger.warning(
                "LLM returned invalid prompts format",
                project_id=project_id,
                parsed=prompts,
            )
            return STATIC_PROMPTS

        prompts = [str(p) for p in prompts[:4]]
        logger.info(
            "Generated suggested prompts",
            project_id=project_id,
            prompts=prompts,
        )

        # Cache in memory
        _prompt_cache[cache_key] = {
            "prompts": prompts,
            "expires_at": now + CACHE_TTL,
        }

        # Persist to DB
        async with session_factory() as db_session:
            await db_session.execute(
                update(Project)
                .where(Project.id == UUID(project_id))
                .values(suggested_prompts=prompts)
            )
            await db_session.commit()

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
    """Return suggested prompts for a project.

    Checks in-memory cache first, then DB, then falls back to static prompts.
    """
    cache_key = str(project_id)
    now = time.time()

    # 1. In-memory cache (fast path)
    if cache_key in _prompt_cache and _prompt_cache[cache_key]["expires_at"] > now:
        return {"prompts": _prompt_cache[cache_key]["prompts"]}

    # 2. Load from DB
    session_factory = request.app.state.session_factory
    async with session_factory() as db_session:
        result = await db_session.execute(
            select(Project.suggested_prompts).where(Project.id == project_id)
        )
        row = result.scalar_one_or_none()
        if row is not None and isinstance(row, list) and len(row) > 0:
            # Repopulate in-memory cache
            _prompt_cache[cache_key] = {
                "prompts": row,
                "expires_at": now + CACHE_TTL,
            }
            return {"prompts": row}

    # 3. Static fallback
    return {"prompts": STATIC_PROMPTS}
