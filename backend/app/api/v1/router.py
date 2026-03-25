from fastapi import APIRouter

from app.api.v1.documents import router as documents_router
from app.api.v1.health import router as health_router
from app.api.v1.projects import router as projects_router
from app.api.v1.provider import router as provider_router
from app.api.v1.settings import router as settings_router

api_v1_router = APIRouter()
api_v1_router.include_router(projects_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(health_router)
api_v1_router.include_router(settings_router)
api_v1_router.include_router(provider_router)
