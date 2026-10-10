"""Grounded personal tutor: level-adaptive, Socratic, cited."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import services_llm as llm
from .. import services_rag as rag
from ..db import get_session
from ..session import resolve_session

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


class ChatIn(BaseModel):
    message: str
    level: str = "secondary"  # elementary | secondary | university
    document_ids: list[int] | None = None
    history: list[dict] = []  # [{role, content}]


class Citation(BaseModel):
    chunk_id: int
    document_id: int
    excerpt: str


class ChatOut(BaseModel):
    answer: str
    citations: list[Citation]
    degraded: bool = False


@router.post("/chat", response_model=ChatOut)
def chat(
    body: ChatIn,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    # Scoped to this session's own material — the tutor must never quote another
    # visitor's uploads back to whoever is asking.
    chunks, degraded = rag.retrieve(
        db, body.message, document_ids=body.document_ids, owner_id=owner
    )
    context = "\n---\n".join(f"[chunk {c.id}] {c.text}" for c in chunks)
    messages = [{"role": "system", "content": rag.tutor_system_prompt(body.level, context)}]
    messages += [m for m in body.history if m.get("role") in ("user", "assistant")][-10:]
    messages.append({"role": "user", "content": body.message})
    try:
        answer = llm.chat(messages, task="tutor-chat")
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    return ChatOut(
        answer=answer,
        citations=[
            Citation(chunk_id=c.id, document_id=c.document_id, excerpt=c.text[:200]) for c in chunks
        ],
        degraded=degraded,
    )
