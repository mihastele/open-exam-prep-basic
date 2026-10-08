from datetime import date

from app.routers.study_plan import build_schedule
from app.services_grade import grade_mcq
from app.services_rag import chunk_text


def test_chunking_keeps_paragraphs():
    chunks = chunk_text("Para one.\n\nPara two is longer. " * 50, size=200)
    assert len(chunks) > 1
    assert all(len(c) <= 400 for c in chunks)


def test_schedule_covers_days_and_review():
    sched = build_schedule(
        ["Algebra", "Mitosis"], date(2026, 10, 20), date(2026, 10, 8), 45,
        {"Algebra": 0.2, "Mitosis": 0.9},
    )
    assert len(sched) == 12
    assert sched[-1]["topic"].startswith("Review")
    assert sched[0]["topic"] == "Algebra"  # weakest first


def test_mcq_grading():
    items = [{"answer_index": 1}, {"answer_index": 0}]
    score, correct = grade_mcq(items, [1, 2])
    assert score == 0.5 and correct == [True, False]
