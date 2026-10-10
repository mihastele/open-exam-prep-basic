"""Delete uploaded material once it is older than the retention window.

Material belongs to the browser session that uploaded it, so a shared deployment does
not turn into a pile of everyone's notes. Deletion is deliberate and total: the raw
file, the chunks, and their embeddings all go together.

Two entry points, because the two deployment shapes differ:

- a background sweep, for a host that keeps a process alive (Docker);
- a per-session sweep on the session's next request, which is the only thing that works
  on serverless, where nothing survives between invocations to run a timer.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Chunk, Document

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    """Naive UTC, matching `func.now()` on SQLite and on a UTC Postgres (our Docker db)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def expiry_for(created_at: datetime | None) -> datetime | None:
    """When a document uploaded at `created_at` will be deleted, if ever.

    Returned timezone-aware on purpose. `created_at` is naive UTC (the database's clock),
    and a browser parses a naive string like "2026-10-17T21:30:00" as *local* time — so a
    countdown would silently disagree with the server by the viewer's UTC offset.
    """
    days = get_settings().doc_retention_days
    if days <= 0 or created_at is None:
        return None
    naive = created_at if created_at.tzinfo is None else created_at.astimezone(timezone.utc).replace(tzinfo=None)
    return (naive + timedelta(days=days)).replace(tzinfo=timezone.utc)


def delete_document(db: Session, doc: Document) -> None:
    """Remove a document, its chunks, and its stored original. Caller commits."""
    for chunk in db.scalars(select(Chunk).where(Chunk.document_id == doc.id)):
        db.delete(chunk)
    db.delete(doc)
    _remove_originals(doc.id)


def _remove_originals(doc_id: int) -> None:
    """Best-effort: the parsed text is the material, the raw file is a convenience."""
    upload_dir = get_settings().upload_path
    try:
        names = os.listdir(upload_dir) if os.path.isdir(upload_dir) else []
    except OSError:
        return
    for name in names:
        if name.startswith(f"{doc_id}_"):
            try:
                os.remove(os.path.join(upload_dir, name))
            except OSError:
                pass


def purge_expired_documents(db: Session, owner_id: str | None = None) -> int:
    """Delete documents past the retention window; returns how many went.

    `owner_id` scopes the check to one session, which is what makes it usable inside a
    request on a host with no background process.
    """
    days = get_settings().doc_retention_days
    if days <= 0:
        return 0

    stmt = select(Document).where(Document.created_at < _utcnow() - timedelta(days=days))
    if owner_id is not None:
        stmt = stmt.where(Document.owner_id == owner_id)

    docs = list(db.scalars(stmt))
    if not docs:
        return 0

    for doc in docs:
        delete_document(db, doc)
    db.commit()
    logger.info(
        "retention: deleted %d document(s) older than %d days%s",
        len(docs),
        days,
        f" for one session" if owner_id else "",
    )
    return len(docs)


def purge_all_sessions() -> int:
    """Sweep every session's expired material on its own short-lived session."""
    from .db import SessionLocal

    with SessionLocal() as db:
        return purge_expired_documents(db)
