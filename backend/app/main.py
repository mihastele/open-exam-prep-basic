"""openExamPrep API. Run: uv run uvicorn app.main:app --reload --port 8000"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .db import SessionLocal, init_db
from .routers import exam, games, gamification, ingest, podcast, practice, progress, solve, study_plan, tutor
from .services_llm import provider_status


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:  # noqa: BLE001
        # A database we cannot open, reach, or grant CREATE EXTENSION on must not
        # take the whole function down. Raising here would make *every* route —
        # including /api/health, the one endpoint that could explain the problem —
        # return FUNCTION_INVOCATION_FAILED. Record it and serve instead.
        app.state.db_error = f"{type(e).__name__}: {e}"[:300]
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="openExamPrep API", lifespan=lifespan)
    app.state.db_error = ""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[get_settings().frontend_url, "http://localhost:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        db_error = getattr(app.state, "db_error", "")
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
            db_ok = True
            db_error = ""
        except Exception as e:  # noqa: BLE001
            db_ok = False
            db_error = db_error or f"{type(e).__name__}: {e}"[:300]
        llm = provider_status()
        status = "ok" if (db_ok and llm["reachable"]) else "degraded"
        body = {
            "status": status,
            "db": db_ok,
            "llm": llm,
            "tracing": get_settings().tracing_enabled,
        }
        if db_error:
            body["db_error"] = db_error
        return body

    @app.exception_handler(SQLAlchemyError)
    async def database_unavailable(request: Request, exc: SQLAlchemyError):
        # Same contract as an unreachable model provider: an explicit 503 with a
        # reason, never a bare 500 that reads like a bug in the route itself.
        return JSONResponse(
            status_code=503,
            content={
                "detail": f"database unavailable: {type(exc).__name__}: {str(exc)[:200]}"
            },
        )

    for r in (ingest, tutor, practice, study_plan, exam, solve, podcast, progress, gamification, games):
        app.include_router(r.router)
    return app


app = create_app()
