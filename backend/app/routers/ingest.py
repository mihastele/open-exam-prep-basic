"""Upload notes/slides/papers → parse, chunk, embed, store.

Everything here is scoped to the browser session that uploaded it: another visitor to
the same deployment sees an empty library, not yours, and cannot fetch or delete what
they cannot see. Material is also deleted automatically once it is older than the
retention window, whether or not anyone remembers to.
"""

import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import services_llm as llm
from .. import services_rag as rag
from ..config import get_settings
from ..db import get_session
from ..models import Chunk, Document
from ..services_parse import extract_text
from ..services_retention import delete_document, expiry_for, purge_expired_documents
from ..session import resolve_session

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


class DocOut(BaseModel):
    id: int
    title: str
    source_type: str
    chunks: int
    created_at: datetime | None = None
    # When this will be deleted automatically. None = retention is switched off.
    expires_at: datetime | None = None
    # False when the text was stored but no vectors were, so search falls back to
    # keywords. Happens when no embedder is reachable, or its width does not match the
    # column — worth saying rather than silently answering worse.
    embedded: bool = False


def _out(doc: Document, chunks: int, embedded: bool = False) -> DocOut:
    return DocOut(
        id=doc.id,
        title=doc.title,
        source_type=doc.source_type,
        chunks=chunks,
        created_at=doc.created_at,
        expires_at=expiry_for(doc.created_at),
        embedded=embedded,
    )


def _keep_original(upload_dir: str, name: str, data: bytes) -> None:
    """Best-effort copy of the raw upload.

    The parsed text is already stored as chunks, so a read-only or missing
    filesystem (serverless) must not fail the ingest.
    """
    try:
        os.makedirs(upload_dir, exist_ok=True)
        with open(os.path.join(upload_dir, name), "wb") as f:
            f.write(data)
    except OSError:
        pass


@router.post("", response_model=DocOut)
async def ingest(
    file: UploadFile,
    title: str = "",
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    s = get_settings()
    data = await file.read()
    if len(data) > s.max_upload_bytes:
        raise HTTPException(
            413, f"File too large ({s.max_upload_bytes // (1024 * 1024)} MB max)."
        )
    try:
        text = extract_text(file.filename or "upload.txt", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(501, str(e))
    if not text.strip():
        raise HTTPException(400, "No readable text found in that file.")

    # Sweep this session's expired material while we are here: on a host with no
    # long-lived process, a request is the only thing that can run retention at all.
    purge_expired_documents(db, owner_id=owner)

    chunks = rag.chunk_text(text)
    doc = Document(
        title=title or (file.filename or "Untitled"),
        filename=file.filename or "",
        owner_id=owner,
    )
    db.add(doc)
    db.flush()
    try:
        # fit_to_column: a provider whose vectors do not match the column width costs the
        # user their vectors, never their upload.
        stored = rag.fit_to_column(llm.embed(chunks))
    except llm.LLMUnavailable:
        stored = None  # keyword retrieval until the provider returns
    vecs = stored if stored is not None else [None] * len(chunks)
    for i, (t, v) in enumerate(zip(chunks, vecs)):
        db.add(Chunk(document_id=doc.id, ord=i, text=t, embedding=v))
    db.commit()

    # Only once the row is safely committed: writing the file first leaves an orphan
    # nothing will ever clean up if anything below fails, since retention works from the
    # database and cannot see a document that was never stored.
    _keep_original(s.upload_path, f"{doc.id}_{file.filename or 'upload'}", data)

    return _out(doc, len(chunks), embedded=stored is not None)


@router.get("", response_model=list[DocOut])
def list_docs(owner: str = Depends(resolve_session), db: Session = Depends(get_session)):
    purge_expired_documents(db, owner_id=owner)
    rows = db.execute(
        select(Document, func.count(Chunk.id))
        .outerjoin(Chunk, Chunk.document_id == Document.id)
        .where(Document.owner_id == owner)
        .group_by(Document.id)
        .order_by(Document.id.desc())
    )
    return [_out(d, n) for d, n in rows]


@router.delete("/{doc_id}")
def delete_doc(
    doc_id: int,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    # Scoped by owner: someone else's id is simply "not found". A 403 would confirm the
    # document exists, which is itself a small leak.
    doc = db.scalar(
        select(Document).where(Document.id == doc_id, Document.owner_id == owner)
    )
    if doc is None:
        raise HTTPException(404, "Document not found.")
    delete_document(db, doc)
    db.commit()
    return {"deleted": doc_id}
