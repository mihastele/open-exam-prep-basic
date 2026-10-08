"""Streaks + badges. Badges are computed from real activity, never faked."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Attempt, Badge, StudyDay

router = APIRouter(prefix="/api/gamification", tags=["gamification"])

BADGES = {
    "first-quiz": "Answered your first quiz",
    "mock-passed": "Scored 60%+ on a mock exam",
    "streak-3": "Studied 3 days in a row",
    "streak-7": "Studied 7 days in a row",
    "deep-session": "Logged 60+ minutes in one day",
}


class LogIn(BaseModel):
    minutes: int = 10


def _streak(db: Session) -> int:
    days = {d for (d,) in db.execute(select(StudyDay.day)).all()}
    streak, day = 0, date.today()
    if day.isoformat() not in days:
        day -= timedelta(days=1)
    while day.isoformat() in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def _award(db: Session, badge_id: str) -> None:
    if db.get(Badge, badge_id) is None:
        db.add(Badge(id=badge_id))


def _refresh_badges(db: Session, streak: int) -> None:
    if db.scalar(select(func.count()).select_from(Attempt).where(Attempt.kind == "quiz")):
        _award(db, "first-quiz")
    best_mock = db.scalar(
        select(func.max(Attempt.score)).where(Attempt.kind == "mock")
    )
    if best_mock is not None and best_mock >= 0.6:
        _award(db, "mock-passed")
    if streak >= 3:
        _award(db, "streak-3")
    if streak >= 7:
        _award(db, "streak-7")
    best_day = db.scalar(select(func.max(StudyDay.minutes)))
    if best_day is not None and best_day >= 60:
        _award(db, "deep-session")
    db.commit()


@router.post("/log")
def log_study(body: LogIn, db: Session = Depends(get_session)):
    today = date.today().isoformat()
    row = db.get(StudyDay, today)
    if row is None:
        row = StudyDay(day=today, minutes=max(body.minutes, 1))
        db.add(row)
    else:
        row.minutes += max(body.minutes, 1)
    db.commit()
    streak = _streak(db)
    _refresh_badges(db, streak)
    return {"day": today, "minutes": row.minutes, "streak_days": streak}


@router.get("/status")
def status(db: Session = Depends(get_session)):
    streak = _streak(db)
    _refresh_badges(db, streak)
    earned = [b.id for b in db.scalars(select(Badge))]
    today = db.get(StudyDay, date.today().isoformat())
    return {
        "streak_days": streak,
        "minutes_today": today.minutes if today else 0,
        "badges": [{"id": b, "label": BADGES[b], "earned": b in earned} for b in BADGES],
    }
