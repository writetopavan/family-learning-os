from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .request_diagnostics import install_request_diagnostics
from .routes.curriculum import router as curriculum_router
from .routes.documents import router as documents_router
from .routes.families import router as family_router
from .routes.learning import router as learning_router
from .routes.planning import router as planning_router
from .routes.workspace import router as workspace_router

settings = get_settings()

app = FastAPI(
    title="Family Learning OS API",
    version="0.2.0",
)

install_request_diagnostics(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.include_router(family_router)
app.include_router(learning_router)
app.include_router(curriculum_router)
app.include_router(workspace_router)
app.include_router(planning_router)
app.include_router(documents_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}

