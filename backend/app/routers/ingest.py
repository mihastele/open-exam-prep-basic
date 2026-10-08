"""Upload notes/slides/papers → parse, chunk, embed, store."""

import os

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

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


class DocOut(BaseModel):
    id: int
    title: str
    source_type: str
    chunks: int


@router.post("", response_model=DocOut)
async def ingest(file: UploadFile, title: str = ""):
    s = get_settings()
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (50 MB max).")
    try:
        text = extract_text(file.filename or "upload.txt", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(501, str(e))
    if not text.strip():
        raise HTTPException(400, "No readable text found in that file.")
    chunks = rag.chunk_text(text)
    os.makedirs(s.upload_dir, exist_ok=True)
    db: Session = next(get_session())
    try:
        doc = Document(title=title or (file.filename or "Untitled"), filename=file.filename or "")
        db.add(doc)
        db.flush()
        path = os.path.join(s.upload_dir, f"{doc.id}_{file.filename or 'upload'}")
        with open(path, "wb") as f:
            f.write(data)
        try:
            vecs = llm.embed(chunks)
        except llm.LLMUnavailable:
            vecs = [None] * len(chunks)  # keyword retrieval until provider returns
        for i, (t, v) in enumerate(zip(chunks, vecs)):
            db.add(Chunk(document_id=doc.id, ord=i, text=t, embedding=v))
        db.commit()
        return DocOut(id=doc.id, title=doc.title, source_type=doc.source_type, chunks=len(chunks))
    finally:
        db.close()


@router.get("", response_model=list[DocOut])
def list_docs(db: Session = Depends(get_session)):
    rows = db.execute(
        select(Document, func.count(Chunk.id))
        .outerjoin(Chunk, Chunk.document_id == Document.id)
        .group_by(Document.id)
        .order_by(Document.id.desc())
    )
    return [DocOut(id=d.id, title=d.title, source_type=d.source_type, chunks=n) for d, n in rows]


@router.delete("/{doc_id}")
def delete_doc(doc_id: int, db: Session = Depends(get_session)):
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(404, "Document not found.")
    s = get_settings()
    for c in db.scalars(select(Chunk).where(Chunk.document_id == doc_id)):
        db.delete(c)
    db.delete(doc)
    db.commit()
    for f in os.listdir(s.upload_dir) if os.path.isdir(s.upload_dir) else []:
        if f.startswith(f"{doc_id}_"):
            os.remove(os.path.join(s.upload_dir, f))
    return {"deleted": doc_id}
