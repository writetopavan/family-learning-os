from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.families import router as family_router

app = FastAPI(
    title="Family Learning OS API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(family_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
