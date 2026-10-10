"""Vectors must fit the column they are written to.

A provider whose embedding width does not match the pgvector column is not a rare edge
case — swapping the embed model on an existing database produces it, and so does any
provider that quietly returns a different size. The material must survive either way.
"""

from app import services_rag as rag
from app.config import get_settings


def test_correct_width_is_stored(monkeypatch):
    monkeypatch.setattr(rag, "is_postgres", lambda: True)
    monkeypatch.setattr(rag, "has_pgvector", lambda: True)

    # The width the column was built to, derived from the embed model in use. Asserted
    # rather than hardcoded, so this holds whatever the environment is configured with —
    # the test environment embeds with a different model than a Vercel deployment does.
    width = get_settings().resolved_embed_dim
    vecs = [[0.1] * width, [0.2] * width]

    assert rag.fit_to_column(vecs) == vecs


def test_wrong_width_costs_the_vectors_not_the_upload(monkeypatch):
    """The real failure seen in the container: a 4-dimensional answer to a wide column."""
    monkeypatch.setattr(rag, "is_postgres", lambda: True)
    monkeypatch.setattr(rag, "has_pgvector", lambda: True)
    width = get_settings().resolved_embed_dim

    assert rag.fit_to_column([[0.1] * 4]) is None
    assert rag.fit_to_column([[0.1] * (width - 1)]) is None
    # Mixed widths are just as unusable — one bad vector fails the whole insert.
    assert rag.fit_to_column([[0.1] * width, [0.2] * 4]) is None
    # And having nothing to store is not an error either.
    assert rag.fit_to_column([]) is None
    assert rag.fit_to_column(None) is None


def test_a_json_column_accepts_any_width(monkeypatch):
    """SQLite/JSON stores the list as-is, so there is no width to match."""
    monkeypatch.setattr(rag, "is_postgres", lambda: False)
    monkeypatch.setattr(rag, "has_pgvector", lambda: False)

    vecs = [[0.1] * 4]

    assert rag.fit_to_column(vecs) == vecs


def test_postgres_without_pgvector_also_takes_any_width(monkeypatch):
    """No vector column means embeddings are JSON here too; Python does the cosine."""
    monkeypatch.setattr(rag, "is_postgres", lambda: True)
    monkeypatch.setattr(rag, "has_pgvector", lambda: False)

    vecs = [[0.1] * 4]

    assert rag.fit_to_column(vecs) == vecs
