"""Cold-start behaviour: a broken database must not take down the whole function.

Vercel imports the ASGI app and runs its lifespan before serving anything, so an
exception in startup becomes FUNCTION_INVOCATION_FAILED for *every* route — even
/api/health, which is the one endpoint that could have explained what was wrong.

These run in a subprocess because the engine and settings are module-level and
lru_cached, so an in-process test could not honestly switch the database URL.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

PROG = """
import json
from fastapi.testclient import TestClient
from app.main import create_app

with TestClient(create_app(), raise_server_exceptions=False) as client:
    h = client.get("/api/health")
    print("RESULT", h.status_code, json.dumps(h.json()))
    d = client.get("/api/ingest")
    print("DBROUTE", d.status_code, d.text[:200])
"""


def _boot(database_url: str) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    env.update(
        {
            "VERCEL": "1",
            "DATABASE_URL": database_url,
            "MODEL_PROVIDER": "ollama",
            "OLLAMA_BASE_URL": "http://127.0.0.1:9/v1",  # unroutable, no real traffic
            "LANGFUSE_PUBLIC_KEY": "",
            "LANGFUSE_SECRET_KEY": "",
        }
    )
    return subprocess.run(
        [sys.executable, "-c", PROG], env=env, cwd=BACKEND, capture_output=True, text=True
    )


def test_unusable_database_reports_degraded_instead_of_crashing(tmp_path):
    """A database we cannot even open: /api/health must answer, not 500."""
    # Point SQLite at a path whose parent is a *file*, so it can never be opened.
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("this is a file, not a directory")

    proc = _boot(f"sqlite:///{blocker.as_posix()}/oep.db")
    output = proc.stdout + proc.stderr

    assert "RESULT 200" in proc.stdout, output[-2000:]
    body = json.loads(proc.stdout.split("RESULT ", 1)[1].split("\n", 1)[0][4:])
    assert body["db"] is False
    assert body["status"] == "degraded"
    assert body.get("db_error"), body
    assert "OperationalError" in body["db_error"]
    # A DB-backed route must explain itself too — 503, not a bare 500.
    assert "DBROUTE 503" in proc.stdout, output[-2000:]
    assert "database unavailable" in proc.stdout


def test_unreachable_postgres_still_serves_health():
    """Connection failure (not a bad path): same contract."""
    proc = _boot("postgresql://u:p@127.0.0.1:1/oep")
    output = proc.stdout + proc.stderr

    assert "RESULT 200" in proc.stdout, output[-2000:]
    body = json.loads(proc.stdout.split("RESULT ", 1)[1].split("\n", 1)[0][4:])
    assert body["db"] is False
    assert body.get("db_error"), body


def test_normalize_url_names_the_psycopg_driver():
    """Neon/Supabase hand out plain postgresql:// URLs; psycopg2 is not installed."""
    from app.db import normalize_url

    assert normalize_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    # Already explicit, or not Postgres at all: left alone.
    assert normalize_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("sqlite:///./oep.db") == "sqlite:///./oep.db"


def test_healthy_database_reports_ok(tmp_path):
    """The happy path still reports ok, so the new guard hides nothing."""
    proc = _boot(f"sqlite:///{(tmp_path / 'ok.db').as_posix()}")
    output = proc.stdout + proc.stderr

    assert "RESULT 200" in proc.stdout, output[-2000:]
    body = json.loads(proc.stdout.split("RESULT ", 1)[1].split("\n", 1)[0][4:])
    assert body["db"] is True
    assert "db_error" not in body
