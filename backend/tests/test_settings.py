"""Settings must survive the config files and dashboards people actually use.

The failure this guards against took a whole deployment down: `.env.example`
shipped `EMBED_DIM=` and `MAX_UPLOAD_MB=`, pydantic read each empty string as an
explicit value, the `int` fields failed to parse, and `Settings()` raised while
`app.db` was building its engine — at *import* time, so every route 500'd before
any handler could explain why.
"""

from pathlib import Path

from app.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"


def test_shipped_env_example_loads():
    """The file users copy from must not be able to crash the app."""
    s = Settings(_env_file=ENV_EXAMPLE)

    assert s.embed_dim == 0, "an unset EMBED_DIM must still mean 'infer it'"
    assert s.max_upload_mb == 0, "an unset MAX_UPLOAD_MB must still mean 'auto'"
    # Values only the file provides, so this proves the file was really read.
    assert s.frontend_url == "http://localhost:3000"
    assert s.ollama_model == "qwen2.5:7b"
    assert s.podcast_max_sections == 16


def test_blank_env_values_are_treated_as_unset(monkeypatch):
    """`FOO=` and `FOO=   ` mean 'leave it alone', not zero."""
    monkeypatch.setenv("EMBED_DIM", "")
    monkeypatch.setenv("MAX_UPLOAD_MB", "   ")
    monkeypatch.setenv("PODCAST_WORKERS", "")

    s = Settings(_env_file=None)

    assert s.embed_dim == 0
    assert s.max_upload_mb == 0
    assert s.podcast_workers == 4


def test_blank_string_var_falls_back_to_its_default(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODEL", "")
    monkeypatch.setenv("UPLOAD_DIR", "")

    s = Settings(_env_file=None)

    assert s.ollama_model == "qwen2.5:7b"
    assert s.upload_path in ("uploads", "/tmp/uploads")


def test_database_url_is_optional(monkeypatch):
    """With no DATABASE_URL the app must still resolve a writable store.

    It used to fall back to `./oep.db`, which is read-only on a serverless host,
    so "no database configured" meant every request failed.
    """
    import tempfile

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("VERCEL", "1")

    s = Settings(_env_file=None)

    assert s.resolved_database_url.startswith("sqlite:")
    assert tempfile.gettempdir().replace("\\", "/") in s.resolved_database_url
    assert s.datastore["kind"] == "sqlite-ephemeral"
    assert s.datastore["persistent"] is False
    assert "Nothing is being saved" not in s.datastore["detail"]  # UI adds that label


def test_local_default_stays_a_file_on_disk(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)

    s = Settings(_env_file=None)

    assert s.resolved_database_url == "sqlite:///./oep.db"
    assert s.datastore["kind"] == "sqlite"
    assert s.datastore["persistent"] is True


def test_postgres_reports_a_persistent_store(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/oep")

    s = Settings(_env_file=None)

    assert s.datastore["kind"] == "postgres"
    assert s.datastore["persistent"] is True


def test_real_values_still_win(monkeypatch):
    """The blank guard must not neuter actual configuration."""
    monkeypatch.setenv("EMBED_DIM", "768")
    monkeypatch.setenv("MAX_UPLOAD_MB", "12")

    s = Settings(_env_file=None)

    assert s.embed_dim == 768
    assert s.resolved_embed_dim == 768
    assert s.max_upload_mb == 12
    assert s.max_upload_bytes == 12 * 1024 * 1024
