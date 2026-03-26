"""Suggested prompts endpoint for chat empty state."""

import json
import time
from uuid import UUID

import structlog
from fastapi import APIRouter, Request

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


@router.post("/suggested-prompts")
async def get_suggested_prompts(
    project_id: UUID,
    request: Request,
):
    """Generate suggested prompts based on project content.

    Fetches sample chunks from ChromaDB, asks LLM to generate questions.
    Returns cached results for 5 minutes per project.
    """
    cache_key = str(project_id)
    now = time.time()

    # Check cache
    if cache_key in _prompt_cache and _prompt_cache[cache_key]["expires_at"] > now:
        return {"prompts": _prompt_cache[cache_key]["prompts"]}

    # Access singletons
    provider_service = request.app.state.provider_service
    vector_repo = request.app.state.vector_repo

    if not provider_service.is_configured:
        return {"prompts": STATIC_PROMPTS}

    try:
        # Fetch sample chunks from ChromaDB (10 random)
        import asyncio

        collection_name = f"project_{project_id}"
        results = await asyncio.to_thread(
            vector_repo.query_random_chunks,
            collection_name=collection_name,
            n=10,
        )

        if not results:
            return {"prompts": STATIC_PROMPTS}

        # Build prompt for LLM
        chunk_texts = "\n---\n".join(results)
        system_prompt = (
            "You are a helpful assistant. Given the following document excerpts, "
            "generate exactly 4 short questions (max 10 words each) that a user might ask. "
            "Return ONLY a JSON array of 4 strings, nothing else."
        )

        client = provider_service._client
        session_factory = request.app.state.session_factory

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

        return {"prompts": prompts}

    except Exception:
        logger.exception(
            "Failed to generate suggested prompts", project_id=str(project_id)
        )
        return {"prompts": STATIC_PROMPTS}
