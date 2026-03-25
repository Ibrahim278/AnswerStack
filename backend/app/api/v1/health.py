from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.schemas.health import LivenessResponse, ReadinessResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Liveness probe -- always returns 200 if the process is running."""
    return LivenessResponse()


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(
    session: AsyncSession = Depends(get_db_session),
) -> ReadinessResponse:
    """Readiness probe -- checks database connectivity."""
    try:
        await session.execute(text("SELECT 1"))
        return ReadinessResponse(status="ready", database="connected")
    except Exception:
        return ReadinessResponse(status="degraded", database="unavailable")
