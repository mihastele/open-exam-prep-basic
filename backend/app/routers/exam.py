"""Timed mock exams and oral-exam practice, both graded."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import services_grade as grade
from .. import services_llm as llm
from .. import services_rag as rag
from ..db import get_session
from ..models import Attempt
from ..services_parse import parse_json_response

router = APIRouter(prefix="/api/exam", tags=["exam"])


class MockIn(BaseModel):
    topic: str = ""
    document_ids: list[int] | None = None
    n: int = 10
    minutes: int = 30


class SubmitIn(BaseModel):
    answers: list[int]


class OralIn(BaseModel):
    topic: str = ""
    document_ids: list[int] | None = None
    history: list[dict] = []  # [{question, transcript, score}]


class OralGradeIn(BaseModel):
    topic: str = ""
    question: str
    transcript: str


def _material(db: Session, topic: str, document_ids: list[int] | None) -> str:
    chunks, _ = rag.retrieve(db, topic or "exam key concepts", k=10, document_ids=document_ids)
    return "\n---\n".join(c.text for c in chunks)


@router.post("/mock")
def make_mock(body: MockIn, db: Session = Depends(get_session)):
    material = _material(db, body.topic, body.document_ids)
    prompt = (
        f"Write a {body.n}-question mock exam on '{body.topic or 'the material'}' "
        f"for a {body.minutes}-minute sitting. Mix multiple choice and short answer, "
        "hardest last. Base it ONLY on the material below (or general knowledge if empty).\n"
        'Return JSON {"items":[{"question","options":[4 strings] or null,'
        '"answer_index":int or null,"model_answer":str,"points":int}]}.\n\nMATERIAL:\n'
        + (material or "(none)")
    )
    try:
        raw = llm.chat([{"role": "user", "content": prompt}], task="mock-generate", json_mode=True)
        items = parse_json_response(raw)["items"]
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Mock generation failed: {e}")
    att = Attempt(kind="mock", topic=body.topic or "material", items=items)
    db.add(att)
    db.commit()
    db.refresh(att)
    return {"attempt_id": att.id, "minutes": body.minutes, "items": items}


@router.post("/mock/{attempt_id}/submit")
def submit_mock(attempt_id: int, body: SubmitIn, db: Session = Depends(get_session)):
    att = db.get(Attempt, attempt_id)
    if att is None or att.kind != "mock":
        raise HTTPException(404, "Mock attempt not found.")
    mcq = [i for i in att.items if i.get("options")]
    score, correct = grade.grade_mcq(mcq, body.answers)
    att.score = score
    mastery = grade.record_mastery(db, att.topic, score)
    db.commit()
    return {"score": score, "correct": correct, "mastery": mastery,
            "feedback": [i.get("model_answer", "") for i in att.items]}


@router.post("/oral/next")
def oral_next(body: OralIn, db: Session = Depends(get_session)):
    material = _material(db, body.topic, body.document_ids)
    asked = [h.get("question", "") for h in body.history]
    prompt = (
        f"You run an oral exam on '{body.topic or 'the material'}'. Ask ONE probing "
        "follow-up question. Already asked: " + ("; ".join(asked) or "(none)") +
        "\nReturn JSON {\"question\":str,\"model_answer\":str}.\n\nMATERIAL:\n" + (material or "(none)")
    )
    try:
        raw = llm.chat([{"role": "user", "content": prompt}], task="oral-next", json_mode=True)
        return parse_json_response(raw)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Oral question failed: {e}")


@router.post("/oral/grade")
def oral_grade(body: OralGradeIn, db: Session = Depends(get_session)):
    prompt = (
        f"Grade this oral-exam answer on '{body.topic or 'general'}' from 0 to 1. "
        "Be strict but fair.\n"
        'Return JSON {"score":0..1,"feedback":str,"follow_up":str}.\n\n'
        f"QUESTION: {body.question}\nANSWER TRANSCRIPT: {body.transcript}"
    )
    try:
        raw = llm.chat([{"role": "user", "content": prompt}], task="oral-grade", json_mode=True)
        out = parse_json_response(raw)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Oral grading failed: {e}")
    mastery = grade.record_mastery(db, body.topic or "general", float(out.get("score", 0)))
    db.add(Attempt(kind="oral", topic=body.topic, items=[{"q": body.question}], score=out["score"]))
    db.commit()
    return {**out, "mastery": mastery}
