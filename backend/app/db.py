"""SQLAlchemy setup. Postgres+pgvector in production, SQLite for zero-setup dev."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings

# How long to wait for a database connection before giving up. Without it an
# unreachable host hangs a serverless invocation for minutes instead of failing
# fast enough to report anything useful.
CONNECT_TIMEOUT_SECONDS = 10


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


def _engine():
    s = get_settings()
    url = normalize_url(s.database_url)
    if url.startswith("sqlite"):
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


engine = _engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def is_postgres() -> bool:
    return normalize_url(get_settings().database_url).startswith("postgresql")


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create the extension and tables. Raises on failure — callers decide.

    Startup treats this as non-fatal (see app.main.lifespan) so that a database
    problem becomes a readable /api/health report instead of
    FUNCTION_INVOCATION_FAILED on every route.
    """
    from . import models  # noqa: F401  (register tables)

    if is_postgres():
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=engine)
