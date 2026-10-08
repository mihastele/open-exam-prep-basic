"""Shared grading + mastery updates used by practice and exam routers."""

from sqlalchemy.orm import Session

from .models import Mastery


def record_mastery(db: Session, topic: str, score: float) -> float:
    """Exponential moving average of mastery per topic. Returns new level."""
    topic = (topic or "general").strip() or "general"
    row = db.get(Mastery, topic)
    if row is None:
        row = Mastery(topic=topic, level=score, attempts=1)
        db.add(row)
    else:
        row.level = round(0.65 * row.level + 0.35 * score, 3)
        row.attempts += 1
    db.commit()
    db.refresh(row)
    return row.level


def grade_mcq(items: list[dict], answers: list[int]) -> tuple[float, list[bool]]:
    correct = [
        bool(i < len(answers) and answers[i] == it.get("answer_index")) for i, it in enumerate(items)
    ]
    score = sum(correct) / len(items) if items else 0.0
    return round(score, 3), correct
