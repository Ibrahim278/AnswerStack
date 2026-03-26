from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.schemas.health import LivenessResponse, ReadinessResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Liveness probe -- always returns 200 if the process is running."""
    return LivenessResponse()


@router.get("/ready")
async def readiness(
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Readiness probe -- checks database connectivity."""
    try:
        await session.execute(text("SELECT 1"))
        return JSONResponse(
            status_code=200,
            content=ReadinessResponse(status="ready", database="connected").model_dump(),
        )
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "disconnected"},
        )
