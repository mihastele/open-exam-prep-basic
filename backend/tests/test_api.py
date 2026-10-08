from fastapi.testclient import TestClient

from app.db import init_db
from app.main import create_app

init_db()
client = TestClient(create_app(), raise_server_exceptions=False)


def test_health_reports_degraded_without_llm():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["db"] is True
    assert body["llm"]["reachable"] is False
    assert body["status"] == "degraded"


def test_tutor_returns_503_not_fake_answer_without_llm():
    r = client.post("/api/tutor/chat", json={"message": "What is mitosis?"})
    assert r.status_code == 503
    assert "unreachable" in r.json()["detail"]


def test_games_work_offline():
    r = client.get("/api/games/daily")
    assert r.status_code == 200
    assert "question" in r.json()
    bad = client.post("/api/games/solve", json={"puzzle_id": "nope", "answer": "x"})
    assert bad.json()["correct"] is False


def test_ingest_and_keyword_retrieval_offline():
    r = client.post(
        "/api/ingest",
        files={"file": ("notes.txt", b"Mitochondria are the powerhouse of the cell.\n\nMitosis has four phases.")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["chunks"] >= 1
    docs = client.get("/api/ingest").json()
    assert any(d["title"] == "notes.txt" for d in docs)
    # Tutor still 503s (no LLM), but ingest + listing work fully offline.
    assert client.delete(f"/api/ingest/{docs[0]['id']}").status_code == 200
