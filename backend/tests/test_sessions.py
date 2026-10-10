"""Sessions own uploaded material.

Two visitors to one deployment must not see each other's documents — not in the library
list, not through the tutor's retrieval, and not by guessing a document id. Material must
also not outlive the retention window.
"""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.main import create_app
from app.models import Chunk, Document
from app.services_rag import retrieve
from app.services_retention import purge_expired_documents

ALICE = "alice-session-token-aaaaaaaa"
BOB = "bob-session-token-bbbbbbbbbbbb"


def _upload(client: TestClient, name: str = "notes.txt", body: bytes = b"Mitosis has four phases.") -> dict:
    r = client.post("/api/ingest", files={"file": (name, body, "text/plain")})
    assert r.status_code == 200, r.text
    return r.json()


def test_two_visitors_see_different_libraries():
    """The whole point: a second visitor gets an empty library, not someone else's."""
    alice, bob = TestClient(create_app()), TestClient(create_app())
    with alice, bob:
        mine = _upload(alice, "alice-notes.txt")

        listed_alice = alice.get("/api/ingest").json()
        listed_bob = bob.get("/api/ingest").json()

        assert [d["id"] for d in listed_alice] == [mine["id"]]
        assert listed_bob == []


def test_one_visitor_cannot_delete_anothers_document():
    alice, bob = TestClient(create_app()), TestClient(create_app())
    with alice, bob:
        doc_id = _upload(alice)["id"]

        # 404, not 403: confirming the document exists would itself be a leak.
        assert bob.delete(f"/api/ingest/{doc_id}").status_code == 404
        assert alice.get("/api/ingest").json() != []  # untouched by the attempt
        assert alice.delete(f"/api/ingest/{doc_id}").status_code == 200


def test_each_browser_gets_its_own_stable_session():
    alice, bob = TestClient(create_app()), TestClient(create_app())
    with alice, bob:
        a1 = alice.get("/api/session").json()
        a2 = alice.get("/api/session").json()
        b1 = bob.get("/api/session").json()

        assert a1["fingerprint"] == a2["fingerprint"]  # same browser, same session
        assert a1["fingerprint"] != b1["fingerprint"]  # different browsers, different ones


def test_session_reports_what_will_happen_to_the_material():
    client = TestClient(create_app())
    with client:
        _upload(client)
        info = client.get("/api/session").json()

        assert info["documents"] == 1
        assert info["retention_days"] == 7
        assert info["next_expiry"] is not None  # a real date to count down to


def test_ingest_reports_when_a_document_expires():
    client = TestClient(create_app())
    with client:
        doc = _upload(client)
        assert doc["created_at"] is not None
        assert doc["expires_at"] is not None


def test_retrieval_never_crosses_sessions():
    """The security boundary itself: one session's chunks are invisible to another.

    Checked here rather than through /api/tutor/chat because the model provider is
    deliberately unreachable in tests — that route 503s before it can return citations.
    """
    with SessionLocal() as db:
        alice = Document(title="Alice notes", owner_id=ALICE)
        bob = Document(title="Bob notes", owner_id=BOB)
        db.add_all([alice, bob])
        db.flush()
        db.add(Chunk(document_id=alice.id, ord=0, text="the mitochondria is the powerhouse"))
        db.add(Chunk(document_id=bob.id, ord=0, text="chlorophyll absorbs red light"))
        db.commit()

        mine, _ = retrieve(db, "mitochondria powerhouse", k=5, owner_id=ALICE)
        theirs, _ = retrieve(db, "chlorophyll red light", k=5, owner_id=BOB)

        assert {c.document_id for c in mine} == {alice.id}
        assert {c.document_id for c in theirs} == {bob.id}
        # Even asking for Bob's words as Alice returns nothing of Bob's.
        assert {c.document_id for c in retrieve(db, "chlorophyll", k=5, owner_id=ALICE)[0]} == set()

        for doc in (alice, bob):
            for chunk in db.scalars(select(Chunk).where(Chunk.document_id == doc.id)):
                db.delete(chunk)
            db.delete(doc)
        db.commit()


def test_material_past_the_window_is_deleted():
    owner = "retention-owner-aaaaaaaaaaaa"
    stale_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=9)

    with SessionLocal() as db:
        stale = Document(title="stale", owner_id=owner, created_at=stale_at)
        fresh = Document(title="fresh", owner_id=owner)
        db.add_all([stale, fresh])
        db.commit()
        stale_id, fresh_id = stale.id, fresh.id

        removed = purge_expired_documents(db, owner_id=owner)

        assert removed == 1
        assert db.get(Document, stale_id) is None
        assert db.get(Document, fresh_id) is not None  # a week has not passed yet

        db.delete(db.get(Document, fresh_id))
        db.commit()


def test_a_visitors_own_sweep_only_touches_their_own_material():
    """The per-request sweep must not be a way to delete other people's documents."""
    stale_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    mine, theirs = "sweeper-aaaaaaaaaaaaaaaa", "sweeper-bbbbbbbbbbbbbbbb"

    with SessionLocal() as db:
        db.add_all(
            [
                Document(title="my old note", owner_id=mine, created_at=stale_at),
                Document(title="their old note", owner_id=theirs, created_at=stale_at),
            ]
        )
        db.commit()

        assert purge_expired_documents(db, owner_id=mine) == 1

        survivor = db.scalar(select(Document).where(Document.owner_id == theirs))
        assert survivor is not None and survivor.title == "their old note"

        for doc in db.scalars(select(Document).where(Document.owner_id == theirs)):
            db.delete(doc)
        db.commit()


def test_retention_can_be_switched_off(monkeypatch):
    monkeypatch.setenv("DOC_RETENTION_DAYS", "0")
    get_settings.cache_clear()
    try:
        with SessionLocal() as db:
            old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=400)
            db.add(Document(title="ancient", owner_id="keeper-owner-aaaaaaaaaaaa", created_at=old))
            db.commit()

            assert purge_expired_documents(db) == 0

            for doc in db.scalars(
                select(Document).where(Document.owner_id == "keeper-owner-aaaaaaaaaaaa")
            ):
                db.delete(doc)
            db.commit()
    finally:
        get_settings.cache_clear()
