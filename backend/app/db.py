"""SQLAlchemy setup. Postgres+pgvector when it answers, SQLite when it does not.

The database is optional here. If the configured server cannot be used — wrong URL,
rotated password, paused project, out of compute, no pgvector — we ignore it and run
on SQLite instead of answering every DB-backed request with a 500.

That decision is made in this module at import time, deliberately: `models` picks its
embedding column type from `is_postgres()` while it is being imported, so the engine
and the schema must agree before `models` loads. Nothing rebinds the engine later, so
the `SessionLocal` references other modules hold keep pointing at the live one.
"""

import logging
import os
import re

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import describe_store, get_settings

logger = logging.getLogger(__name__)

# How long to wait for a database connection before giving up. Without it an
# unreachable host hangs a serverless invocation for minutes instead of failing
# fast enough to report anything useful.
CONNECT_TIMEOUT_SECONDS = 10

# The user:password@ part of any URL-shaped string.
_CREDENTIALS = re.compile(r"(?P<scheme>[a-zA-Z][\w+.-]*://)(?P<user>[^:/@\s]+):(?P<pw>[^@/\s]+)@")
# SQLAlchemy's documentation trailer, and the driver's class it repeats in the text.
_BOILERPLATE = re.compile(r"\s*\(Background on this error at:.*$", re.S)
_TYPE_PREFIX = re.compile(r"^\(\w[\w.]*\)\s*")


def redact(text: str) -> str:
    """Strip passwords from a message before it reaches a client.

    SQLAlchemy echoes the URL it could not parse, and that URL carries the database
    password. `/api/health` is public, so this is not cosmetic.
    """
    return _CREDENTIALS.sub(lambda m: f"{m['scheme']}{m['user']}:***@", text)


def error_line(exc: BaseException, limit: int = 220) -> str:
    """A short, credential-free one-liner about an exception, for humans.

    The raw string is unreadable in a status widget: SQLAlchemy appends a "see this
    URL" trailer and the driver repeats its own exception class inside the message.
    """
    text = _BOILERPLATE.sub("", redact(str(exc)))
    text = _TYPE_PREFIX.sub("", " ".join(text.split()))
    return f"{type(exc).__name__}: {text}"[:limit]


class Base(DeclarativeBase):
    pass


def normalize_url(url: str) -> str:
    """Accept the plain Postgres URLs Neon, Supabase and Heroku hand out.

    `postgresql://` lets SQLAlchemy choose a default driver, which is psycopg2 in
    most versions — a driver this project does not ship. Naming psycopg
    explicitly means a pasted connection string just works.
    """
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def _ensure_sqlite_parent(url: str) -> None:
    """Create the directory for a SQLite file before opening it.

    The serverless temp dir already exists, but a user-supplied path or a mounted
    volume may not, and "unable to open database file" is a poor first error.
    """
    path = url.split("sqlite:///", 1)[-1]
    if not path or path.startswith(":memory:"):
        return
    parent = os.path.dirname(path)
    if not parent:
        return
    try:
        os.makedirs(parent, exist_ok=True)
    except OSError:
        pass  # read-only filesystem: let the engine raise the real error


def _build_engine(url: str):
    s = get_settings()
    if url.startswith("sqlite"):
        _ensure_sqlite_parent(url)
        return create_engine(url, connect_args={"check_same_thread": False})
    if s.is_serverless:
        # Serverless: each invocation is short-lived and many instances run at
        # once, so a client-side pool just burns the database's connection
        # limit. Connect per request and let a server-side pooler
        # (Neon/Supabase -replica URLs) do the pooling.
        return create_engine(
            url,
            poolclass=NullPool,
            connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
        )
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )


def _probe(url: str) -> bool:
    """Connect to the database, and report whether pgvector is usable.

    Raises if the database cannot be reached at all — the caller treats that as
    "ignore this database". A database that answers but has no pgvector is still
    worth keeping: material persists and retrieval degrades to keyword search,
    which the app already labels as degraded. Throwing away persistence in that
    case would be a worse outcome than the missing extension.

    Deliberately two separate transactions: once a statement fails, Postgres marks
    the transaction aborted and every later command in it fails too, so the
    extension attempt cannot share one with the connectivity check.
    """
    probe = create_engine(
        url,
        poolclass=NullPool,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )
    try:
        with probe.begin() as conn:
            conn.exec_driver_sql("SELECT 1")  # raises -> unreachable, caller falls back

        if not url.startswith("postgresql"):
            return False  # only Postgres does vector math in the database

        try:
            # begin() (not connect()) so the DDL commits rather than rolling back.
            with probe.begin() as conn:
                conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
            return True
        except SQLAlchemyError as e:  # noqa: BLE001
            logger.warning(
                "pgvector is unavailable (%s). Vector search falls back to keyword "
                "search; material is still stored.",
                redact(str(e))[:200],
            )
            return False
    finally:
        probe.dispose()


_fallback_reason: str | None = None
_has_pgvector: bool = False


def _resolve_active_url() -> str:
    """Pick the URL we will really use, testing the configured one first."""
    global _fallback_reason, _has_pgvector

    s = get_settings()
    configured = normalize_url(s.resolved_database_url)
    if configured.startswith("sqlite"):
        return configured  # already the zero-setup store; nothing better to fall back to

    try:
        _has_pgvector = _probe(configured)
        return configured
    except Exception as e:  # noqa: BLE001 — any failure means "unusable", not "fatal"
        _has_pgvector = False
        _fallback_reason = error_line(e)
        logger.warning(
            "Ignoring the configured database (%s). Falling back to SQLite so the app "
            "still works — material will not be kept.",
            _fallback_reason,
        )
        return normalize_url(s.default_database_url)


_active_url: str = _resolve_active_url()
engine = _build_engine(_active_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def active_url() -> str:
    """The URL actually in use — not necessarily the one that was configured."""
    return _active_url


def fallback_reason() -> str | None:
    """Why the configured database was ignored, or None if it was usable."""
    return _fallback_reason


def is_postgres() -> bool:
    """Whether the *active* store is Postgres, so the schema always follows the engine."""
    return _active_url.startswith("postgresql")


def has_pgvector() -> bool:
    """Whether vector math can happen in the database.

    Distinct from `is_postgres()`: a Postgres without the extension still stores
    material, it just ranks in Python. Callers that need `<=>` must ask this one.
    """
    return _has_pgvector


def datastore_status() -> dict:
    """What we are storing in, and whether it survives — for /api/health."""
    s = get_settings()
    status = describe_store(_active_url, s.is_serverless)
    if is_postgres():
        # Says why retrieval might be ranking in Python instead of in the database.
        status["pgvector"] = _has_pgvector
    if _fallback_reason:
        status["fallback"] = True
        status["persistent"] = False
        status["reason"] = _fallback_reason
        # The caller's headline already says the database was ignored, so this only
        # has to say what that costs and what to do about it.
        status["detail"] = (
            "It is running on SQLite in the temp directory instead, which resets on "
            "every cold start and is not shared between concurrent instances — so "
            "uploaded material disappears. Fix DATABASE_URL, or attach a free Postgres "
            "(Neon or Supabase) to keep it."
        )
    return status


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_columns() -> None:
    """Add columns that arrived after a database was first created.

    `create_all` only creates missing *tables*, so an existing Docker volume would keep
    its old `documents` table and every ownership query would fail against a column
    that is not there. Deliberately small and specific — this project has no migration
    framework, and adding one for a single column would be a worse trade.
    """
    from sqlalchemy import inspect

    inspector = inspect(engine)
    if "documents" not in inspector.get_table_names():
        return
    if "owner_id" in {c["name"] for c in inspector.get_columns("documents")}:
        return
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN owner_id VARCHAR(64)")
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_owner_id ON documents (owner_id)"
        )


def init_db() -> None:
    """Create the extension and tables. Raises on failure — callers decide.

    Startup treats this as non-fatal (see app.main.lifespan) so that a database
    problem becomes a readable /api/health report instead of
    FUNCTION_INVOCATION_FAILED on every route.
    """
    from . import models  # noqa: F401  (register tables)

    if has_pgvector():
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
