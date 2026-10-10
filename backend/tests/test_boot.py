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

# Checks the column type `models` picked at import, which must match the store we
# actually ended up using — not the one that was configured.
PROG_SCHEMA = """
import json
from sqlalchemy import JSON
from app import db, models

print("SCHEMA", json.dumps({
    "postgres": db.is_postgres(),
    "pgvector": db.has_pgvector(),
    "json_embedding": models.Embedding is JSON,
    "fallback": bool(db.fallback_reason()),
}))
"""


def _boot(
    database_url: str | None, extra: dict | None = None, prog: str = PROG
) -> subprocess.CompletedProcess:
    """Boot the app in a subprocess. `database_url=None` means "not configured"."""
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    env.update(
        {
            "VERCEL": "1",
            "MODEL_PROVIDER": "ollama",
            "OLLAMA_BASE_URL": "http://127.0.0.1:9/v1",  # unroutable, no real traffic
            "LANGFUSE_PUBLIC_KEY": "",
            "LANGFUSE_SECRET_KEY": "",
        }
    )
    if database_url is not None:
        env["DATABASE_URL"] = database_url
    env.update(extra or {})
    return subprocess.run(
        [sys.executable, "-c", prog], env=env, cwd=BACKEND, capture_output=True, text=True
    )


def test_runs_with_no_database_configured():
    """The database is optional: no DATABASE_URL must still serve and store.

    On a serverless host this lands on SQLite in the temp dir, which is writable —
    unlike the `./oep.db` it used to fall back to.
    """
    proc = _boot(None)
    output = proc.stdout + proc.stderr

    assert "RESULT 200" in proc.stdout, output[-2000:]
    body = json.loads(proc.stdout.split("RESULT ", 1)[1].split("\n", 1)[0][4:])
    assert body["db"] is True
    assert "db_error" not in body
    assert body["datastore"]["kind"] == "sqlite-ephemeral"
    assert body["datastore"]["persistent"] is False
    # And a route that touches the database must actually work, not 503.
    assert "DBROUTE 200" in proc.stdout, output[-2000:]


def test_blank_numeric_env_vars_do_not_break_cold_start(tmp_path):
    """The exact production failure: EMBED_DIM= and MAX_UPLOAD_MB= set to "".

    A dashboard (or `.env` copied from the example) holding an empty string for a
    numeric setting used to raise while the engine was built, so the function died
    on import and every route returned a bare 500.
    """
    proc = _boot(
        f"sqlite:///{(tmp_path / 'ok.db').as_posix()}",
        extra={"EMBED_DIM": "", "MAX_UPLOAD_MB": "", "PODCAST_WORKERS": ""},
    )
    output = proc.stdout + proc.stderr

    assert "RESULT 200" in proc.stdout, output[-2000:]
    body = json.loads(proc.stdout.split("RESULT ", 1)[1].split("\n", 1)[0][4:])
    assert body["db"] is True
    assert "db_error" not in body


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


def test_unreachable_postgres_is_ignored_and_the_app_keeps_serving():
    """A configured database that will not answer must be *ignored*, not fatal.

    It used to boot into a permanently broken state: /api/health said `degraded` and
    every DB-backed route returned 503 forever. The database is optional, so an
    unusable one is dropped and we keep serving on the SQLite fallback.
    """
    proc = _boot("postgresql://u:s3cr3t-pw@127.0.0.1:1/oep")  # port 1 refuses instantly
    output = proc.stdout + proc.stderr

    assert "RESULT 200" in proc.stdout, output[-2000:]
    body = json.loads(proc.stdout.split("RESULT ", 1)[1].split("\n", 1)[0][4:])

    assert body["db"] is True
    store = body["datastore"]
    assert store["fallback"] is True
    assert store["persistent"] is False
    assert store["kind"] == "sqlite-ephemeral"
    assert "running on SQLite" in store["detail"]
    assert store.get("reason"), body
    # The reason should read like a sentence, not a stack-trace fragment.
    assert "Background on this error" not in store["reason"]

    # /api/health is public and the reason quotes a driver error: never a password.
    assert "s3cr3t-pw" not in json.dumps(body)

    # And a DB-backed route must actually work rather than 503.
    assert "DBROUTE 200" in proc.stdout, output[-2000:]


def test_schema_never_asks_the_store_for_vectors_it_cannot_do():
    """`models` picks Vector vs JSON at import, so it must follow the *active* store.

    This is the trap in resolving the fallback: if the engine fell back to SQLite
    while `models` still believed it was talking to Postgres, every `create_all`
    would fail. It only holds because `db` settles the engine before `models` loads.
    """
    proc = _boot("postgresql://u:p@127.0.0.1:1/oep", prog=PROG_SCHEMA)
    output = proc.stdout + proc.stderr

    assert "SCHEMA" in proc.stdout, output[-2000:]
    schema = json.loads(proc.stdout.split("SCHEMA ", 1)[1].split("\n", 1)[0])

    assert schema["fallback"] is True
    assert schema["postgres"] is False  # fell back to SQLite, and the schema agrees
    assert schema["pgvector"] is False
    assert schema["json_embedding"] is True


def test_schema_uses_json_embeddings_without_a_database():
    proc = _boot(None, prog=PROG_SCHEMA)
    output = proc.stdout + proc.stderr

    assert "SCHEMA" in proc.stdout, output[-2000:]
    schema = json.loads(proc.stdout.split("SCHEMA ", 1)[1].split("\n", 1)[0])

    assert schema["fallback"] is False  # nothing configured: not a fallback, just the default
    assert schema["pgvector"] is False
    assert schema["json_embedding"] is True


def test_redact_strips_passwords_from_error_text():
    """SQLAlchemy echoes the URL it could not parse, and that URL has the password."""
    from app.db import error_line, redact

    msg = "Could not parse SQLAlchemy URL from string 'postgresql://oep:hunter2@db.example.com/oep'"
    out = redact(msg)

    assert "hunter2" not in out
    assert "postgresql://oep:***@" in out
    # Nothing to redact is left alone, and a credential-free URL is not mangled.
    assert redact("connection refused") == "connection refused"
    assert redact("sqlite:///./oep.db") == "sqlite:///./oep.db"


def test_error_line_is_short_readable_and_safe():
    """/api/health is read by people, so drop the driver noise but keep the cause."""
    from app.db import error_line

    class Fake(Exception):
        pass

    raw = (
        "(psycopg.OperationalError) failed to resolve host 'db.example.com'\n"
        "(Background on this error at: https://sqlalche.me/e/21/e3q8)"
    )

    line = error_line(Fake(raw))

    assert line.startswith("Fake: ")
    assert "failed to resolve host" in line
    assert "Background on this error" not in line
    assert "(psycopg.OperationalError)" not in line  # the class is not repeated
    assert "\n" not in line
    assert len(error_line(Fake("x" * 500))) <= 220


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
    # A usable database must not be reported as a fallback — the configured store
    # was used as-is. (It is still `persistent: False` because this test runs as a
    # serverless host, where a SQLite *file* lives inside one container.)
    assert "fallback" not in body["datastore"]
    assert body["datastore"]["kind"] == "sqlite-ephemeral"
