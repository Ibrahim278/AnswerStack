from pydantic import BaseModel


class LivenessResponse(BaseModel):
    status: str = "alive"


class ReadinessResponse(BaseModel):
    status: str       # "ready" or "degraded"
    database: str     # "connected" or "unavailable"
