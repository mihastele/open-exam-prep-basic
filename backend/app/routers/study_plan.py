"""Study plans. Pure scheduling heuristic — works fully offline.

Topics come from the user or from uploaded document titles; days until the exam
are split evenly, weighted toward low-mastery topics.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Document, Mastery, StudyPlan

router = APIRouter(prefix="/api/plan", tags=["plan"])


class PlanIn(BaseModel):
    exam_date: str  # YYYY-MM-DD
    topics: list[str] = []
    document_ids: list[int] | None = None
    minutes_per_day: int = 45


def build_schedule(
    topics: list[str], exam: date, today: date, minutes_per_day: int, mastery: dict[str, float]
) -> list[dict]:
    days = max((exam - today).days, 1)
    weights = {t: 1.0 + (1.0 - mastery.get(t, 0.0)) for t in topics}  # weak topics 2x
    total = sum(weights.values()) or 1.0
    per_day_minutes = minutes_per_day
    schedule = []
    # Round-robin topics across days, weakest first, review day before exam.
    ordered = sorted(topics, key=lambda t: mastery.get(t, 0.0))
    for d in range(days):
        day = today + timedelta(days=d)
        if d == days - 1 and days > 1:
            schedule.append({"date": day.isoformat(), "topic": "Review: weakest topics",
                             "minutes": per_day_minutes, "done": False})
        else:
            topic = ordered[d % len(ordered)]
            share = weights[topic] / total
            schedule.append({"date": day.isoformat(), "topic": topic,
                             "minutes": max(15, round(per_day_minutes * len(topics) * share / max(days - 1, 1))),
                             "done": False})
    return schedule


@router.post("")
def create_plan(body: PlanIn, db: Session = Depends(get_session)):
    try:
        exam = date.fromisoformat(body.exam_date)
    except ValueError:
        raise HTTPException(400, "exam_date must be YYYY-MM-DD.")
    if exam <= date.today():
        raise HTTPException(400, "exam_date must be in the future.")
    topics = [t.strip() for t in body.topics if t.strip()]
    if not topics and body.document_ids:
        docs = db.scalars(select(Document).where(Document.id.in_(body.document_ids)))
        topics = [d.title for d in docs]
    if not topics:
        raise HTTPException(400, "Give topics or pick documents to plan from.")
    mastery = {m.topic: m.level for m in db.scalars(select(Mastery))}
    sched = build_schedule(topics, exam, date.today(), body.minutes_per_day, mastery)
    plan = StudyPlan(exam_date=body.exam_date, topics=topics, schedule=sched)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"id": plan.id, "exam_date": plan.exam_date, "topics": topics, "schedule": sched}


@router.get("/active")
def active_plan(db: Session = Depends(get_session)):
    plan = db.scalar(select(StudyPlan).order_by(StudyPlan.id.desc()))
    if plan is None:
        raise HTTPException(404, "No study plan yet.")
    return {"id": plan.id, "exam_date": plan.exam_date, "topics": plan.topics,
            "schedule": plan.schedule}


@router.patch("/{plan_id}/day")
def mark_day(plan_id: int, day_date: str, done: bool = True, db: Session = Depends(get_session)):
    plan = db.get(StudyPlan, plan_id)
    if plan is None:
        raise HTTPException(404, "Plan not found.")
    sched = [dict(s, done=done) if s["date"] == day_date else s for s in plan.schedule]
    plan.schedule = sched
    db.commit()
    return {"id": plan.id, "schedule": sched}
