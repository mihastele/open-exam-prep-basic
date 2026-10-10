"""openExamPrep API. Run: uv run uvicorn app.main:app --reload --port 8000"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .db import SessionLocal, datastore_status, error_line, init_db
from .routers import (
    exam,
    games,
    gamification,
    ingest,
    podcast,
    practice,
    progress,
    session,
    solve,
    study_plan,
    tutor,
)
from .services_llm import provider_status
from .services_retention import purge_all_sessions
from .services_tracing import tracing_status

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    """Make this app's own INFO logs visible in a container.

    Uvicorn wires handlers for its own loggers only, leaving the root logger with no
    handler and a WARNING level. Anything the app logs below a warning is therefore
    dropped — hiding exactly the lines an operator wants: "retention deleted 3
    documents", "ignoring the configured database: ...". Warnings already got through
    via Python's last-resort handler, which is why only half of it was missing.
    """
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
        )


async def _retention_sweeper() -> None:
    """Delete expired material on a timer.

    Only a host that keeps a process alive can run this. Where it cannot — serverless —
    the same sweep also runs inside each session's own requests, so expired material is
    removed either way.
    """
    every = max(1, get_settings().retention_sweep_minutes) * 60
    while True:
        await asyncio.sleep(every)
        try:
            # purge_all_sessions logs what it deletes; this only has to survive failures.
            await asyncio.to_thread(purge_all_sessions)
        except Exception as e:  # noqa: BLE001 — the sweep must never take the app down
            logger.warning("retention sweep failed: %s", error_line(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:  # noqa: BLE001
        # A database we cannot open, reach, or grant CREATE EXTENSION on must not
        # take the whole function down. Raising here would make *every* route —
        # including /api/health, the one endpoint that could explain the problem —
        # return FUNCTION_INVOCATION_FAILED. Record it and serve instead.
        # Redacted: a connection string carries a password and this field is public.
        app.state.db_error = error_line(e)

    sweeper = asyncio.create_task(_retention_sweeper())
    try:
        yield
    finally:
        sweeper.cancel()


def create_app() -> FastAPI:
    _configure_logging()
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
            db_error = db_error or error_line(e)
        settings = get_settings()
        llm = provider_status()
        status = "ok" if (db_ok and llm["reachable"]) else "degraded"
        body = {
            "status": status,
            "db": db_ok,
            # What we are storing in and whether it survives. The database is
            # optional: with none configured this reports an ephemeral SQLite so
            # the UI can say so rather than pretending material is kept.
            "datastore": datastore_status(),
            "llm": llm,
            # Tracing is optional too — "on" only means the keys are present, so
            # tracing_status also reports whether the client actually loaded.
            "tracing": settings.tracing_enabled,
            "tracing_status": tracing_status(),
            # Deployment-wide policy, so a user can see what happens to their material
            # without having to read the compose file.
            "retention_days": settings.doc_retention_days,
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

    for r in (ingest, session, tutor, practice, study_plan, exam, solve, podcast, progress, gamification, games):
        app.include_router(r.router)
    return app


app = create_app()
