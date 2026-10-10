"""The caller's own session: who they are to this deployment, and how long their
material survives.

Deliberately tiny. There is no account to read and no profile to edit — only enough for
the UI to say "this is yours, and it goes away on its own".
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_session
from ..models import Chunk, Document
from ..services_retention import expiry_for, purge_expired_documents
from ..session import resolve_session

router = APIRouter(prefix="/api/session", tags=["session"])


class SessionOut(BaseModel):
    # A short, stable fingerprint of the session id — enough for a user to tell two
    # browsers apart, not enough to be useful to anyone else.
    fingerprint: str
    retention_days: int
    documents: int
    chunks: int
    # When the *soonest* deletion happens, so the UI can count down to something real.
    next_expiry: datetime | None = None
    cookie_secure: bool = False


@router.get("", response_model=SessionOut)
def session_info(
    owner: str = Depends(resolve_session), db: Session = Depends(get_session)
):
    purge_expired_documents(db, owner_id=owner)

    owned = select(Document.id).where(Document.owner_id == owner)
    documents = db.scalar(select(func.count()).select_from(owned.subquery())) or 0
    chunk_count = db.scalar(select(func.count(Chunk.id)).where(Chunk.document_id.in_(owned))) or 0
    oldest = db.scalar(select(func.min(Document.created_at)).where(Document.owner_id == owner))

    settings = get_settings()
    return SessionOut(
        fingerprint=owner[:6],
        retention_days=settings.doc_retention_days,
        documents=documents,
        chunks=chunk_count,
        next_expiry=expiry_for(oldest),
        cookie_secure=settings.session_cookie_secure,
    )
