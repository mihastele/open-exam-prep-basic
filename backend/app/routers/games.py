"""Break-time brain games. Deterministic daily puzzle + math sprint. No LLM needed."""

import hashlib
from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/games", tags=["games"])

PUZZLES = [
    {"id": "p1", "kind": "logic", "question": "Three boxes are labeled Apples, Oranges, and Mixed — all labels are wrong. You may pull one fruit from one box. Which box, and what do you learn?", "answer": "mixed", "hint": "The wrongly-labeled Mixed box must be pure, so one draw identifies it."},
    {"id": "p2", "kind": "logic", "question": "A bat and ball cost 1.10 in total. The bat costs 1.00 more than the ball. How much is the ball (in cents)?", "answer": "5", "hint": "Not 10. Write b + (b + 100) = 110."},
    {"id": "p3", "kind": "sequence", "question": "Next in sequence: 2, 3, 5, 9, 17, … ?", "answer": "33", "hint": "Each term is double the previous minus one."},
    {"id": "p4", "kind": "logic", "question": "You have a 3-liter and a 5-liter jug, no markings. How do you measure exactly 4 liters? (one word: which jug ends holding the 4 liters?)", "answer": "5", "hint": "Fill the 5, pour into the 3, empty the 3, pour the rest, fill the 5 again, top up the 3."},
    {"id": "p5", "kind": "sequence", "question": "Next: O, T, T, F, F, S, S, … (one letter)?", "answer": "e", "hint": "One, Two, Three, Four, Five, Six, Seven, …"},
    {"id": "p6", "kind": "math", "question": "17 × 19 = ?", "answer": "323", "hint": "(18-1)(18+1) = 324 - 1."},
    {"id": "p7", "kind": "logic", "question": "A train leaves at 60 km/h; a second leaves the same station 30 min later at 90 km/h. After how many minutes does the second catch up?", "answer": "60", "hint": "Head start is 30 km; closing speed 30 km/h."},
]


class SolveIn(BaseModel):
    puzzle_id: str
    answer: str


@router.get("/daily")
def daily():
    seed = int(hashlib.sha256(date.today().isoformat().encode()).hexdigest(), 16)
    p = PUZZLES[seed % len(PUZZLES)]
    return {"date": date.today().isoformat(), "puzzle_id": p["id"], "kind": p["kind"],
            "question": p["question"], "hint": p["hint"]}


@router.post("/solve")
def solve(body: SolveIn):
    p = next((x for x in PUZZLES if x["id"] == body.puzzle_id), None)
    if p is None:
        return {"correct": False, "message": "Unknown puzzle."}
    ok = body.answer.strip().lower() == p["answer"].lower()
    return {"correct": ok, "message": "Correct — nice break." if ok else f"Not quite. Hint: {p['hint']}"}
