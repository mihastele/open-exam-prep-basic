"""SQLAlchemy setup. Postgres+pgvector in production, SQLite for zero-setup dev."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _engine():
    s = get_settings()
    url = s.database_url
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    if s.is_serverless:
        # Serverless: each invocation is short-lived and many instances run at
        # once, so a client-side pool just burns the database's connection
        # limit. Connect per request and let a server-side pooler
        # (Neon/Supabase -replica URLs) do the pooling.
        return create_engine(url, poolclass=NullPool)
    return create_engine(url, pool_pre_ping=True)


engine = _engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def is_postgres() -> bool:
    return get_settings().database_url.startswith(("postgresql", "postgres"))


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    if is_postgres():
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=engine)
