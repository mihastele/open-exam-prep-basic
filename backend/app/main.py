"""openExamPrep API. Run: uv run uvicorn app.main:app --reload --port 8000"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .db import SessionLocal, init_db
from .routers import exam, games, gamification, ingest, podcast, practice, progress, solve, study_plan, tutor
from .services_llm import provider_status


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="openExamPrep API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[get_settings().frontend_url, "http://localhost:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False
        llm = provider_status()
        status = "ok" if (db_ok and llm["reachable"]) else "degraded"
        return {"status": status, "db": db_ok, "llm": llm,
                "tracing": get_settings().tracing_enabled}

    for r in (ingest, tutor, practice, study_plan, exam, solve, podcast, progress, gamification, games):
        app.include_router(r.router)
    return app


app = create_app()
