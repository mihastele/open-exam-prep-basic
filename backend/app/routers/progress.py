"""Progress in numbers: mastery per topic, attempts, study minutes."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Attempt, Mastery, StudyDay

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("/overview")
def overview(db: Session = Depends(get_session)):
    mastery = [
        {"topic": m.topic, "level": m.level, "attempts": m.attempts}
        for m in db.scalars(select(Mastery).order_by(Mastery.level))
    ]
    counts = {
        k: n
        for k, n in db.execute(
            select(Attempt.kind, func.count()).group_by(Attempt.kind)
        )
    }
    avg = db.scalar(select(func.avg(Attempt.score)).where(Attempt.score.is_not(None)))
    minutes = db.scalar(select(func.sum(StudyDay.minutes))) or 0
    return {
        "mastery": mastery,
        "attempts": counts,
        "avg_score": round(avg, 3) if avg is not None else None,
        "study_minutes_total": minutes,
    }
