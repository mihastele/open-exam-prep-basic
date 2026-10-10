"""Instant practice: quizzes, flashcards, grading + mastery updates."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import services_grade as grade
from .. import services_llm as llm
from .. import services_rag as rag
from ..db import get_session
from ..models import Attempt
from ..services_parse import parse_json_response
from ..session import resolve_session

router = APIRouter(prefix="/api/practice", tags=["practice"])


class QuizIn(BaseModel):
    topic: str = ""
    document_ids: list[int] | None = None
    n: int = 5
    difficulty: str = "medium"


class QuizOut(BaseModel):
    attempt_id: int
    topic: str
    items: list[dict]


class GradeIn(BaseModel):
    attempt_id: int
    answers: list[int]


class FlashIn(BaseModel):
    topic: str = ""
    document_ids: list[int] | None = None
    n: int = 10


def _material(
    db: Session, topic: str, document_ids: list[int] | None, owner: str
) -> str:
    """Only this session's material, so quizzes cannot be built from someone else's."""
    chunks, _ = rag.retrieve(
        db, topic or "key concepts", k=8, document_ids=document_ids, owner_id=owner
    )
    return "\n---\n".join(c.text for c in chunks)


@router.post("/quiz", response_model=QuizOut)
def make_quiz(
    body: QuizIn,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    if not body.topic and not body.document_ids:
        raise HTTPException(400, "Give a topic or pick at least one document.")
    material = _material(db, body.topic, body.document_ids, owner)
    prompt = (
        f"Create a {body.difficulty} {body.n}-question multiple-choice quiz on "
        f"'{body.topic or 'the material'}'. Base it ONLY on the material below; if the "
        "material is empty, use general knowledge and say so in each explanation.\n"
        'Return a JSON object {"items":[{"question","options":[4 strings],'
        '"answer_index":0-3,"explanation"}]}.\n\nMATERIAL:\n' + (material or "(none)")
    )
    try:
        raw = llm.chat(
            [{"role": "user", "content": prompt}], task="quiz-generate", json_mode=True
        )
        items = parse_json_response(raw)["items"][: max(body.n, 1)]
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Quiz generation failed: {e}")
    att = Attempt(kind="quiz", topic=body.topic or "material", items=items)
    db.add(att)
    db.commit()
    db.refresh(att)
    return QuizOut(attempt_id=att.id, topic=att.topic, items=items)


@router.post("/quiz/grade")
def grade_quiz(body: GradeIn, db: Session = Depends(get_session)):
    att = db.get(Attempt, body.attempt_id)
    if att is None or att.kind != "quiz":
        raise HTTPException(404, "Quiz attempt not found.")
    score, correct = grade.grade_mcq(att.items, body.answers)
    att.score = score
    mastery = grade.record_mastery(db, att.topic, score)
    db.commit()
    return {"score": score, "correct": correct, "mastery": mastery, "explanations": [i.get("explanation", "") for i in att.items]}


@router.post("/flashcards")
def make_flashcards(
    body: FlashIn,
    owner: str = Depends(resolve_session),
    db: Session = Depends(get_session),
):
    if not body.topic and not body.document_ids:
        raise HTTPException(400, "Give a topic or pick at least one document.")
    material = _material(db, body.topic, body.document_ids, owner)
    prompt = (
        f"Create {body.n} flashcards on '{body.topic or 'the material'}' from the "
        "material below (or general knowledge if empty).\n"
        'Return a JSON object {"cards":[{"front","back"}]}.\n\nMATERIAL:\n' + (material or "(none)")
    )
    try:
        raw = llm.chat(
            [{"role": "user", "content": prompt}], task="flashcards-generate", json_mode=True
        )
        return parse_json_response(raw)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Flashcard generation failed: {e}")
