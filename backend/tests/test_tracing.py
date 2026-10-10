"""Tracing is optional: no keys, no package, no host must all just mean "untraced".

Observation is a nice-to-have. If any part of it is missing the request still has
to succeed — a tracing outage must never become an app outage.
"""

import builtins

from app import services_tracing as tracing
from app.config import get_settings


def _reload_settings():
    get_settings.cache_clear()
    return get_settings()


def test_no_keys_means_tracing_is_off(monkeypatch):
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    _reload_settings()

    status = tracing.tracing_status()

    assert status["enabled"] is False
    assert status["available"] is False
    _reload_settings()


def test_generation_is_a_no_op_without_keys():
    with tracing.generation("tutor-chat", "some-model") as record:
        record["input"] = [{"role": "user", "content": "hi"}]
        record["output"] = "hello"

    # Reaching here without raising is the assertion: the caller's request is
    # unaffected by tracing being off.


def test_missing_langfuse_package_does_not_break_anything(monkeypatch):
    """Keys set but the client library unavailable: report it, never raise."""
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    _reload_settings()

    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "langfuse" or name.startswith("langfuse."):
            raise ImportError("langfuse is not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    try:
        status = tracing.tracing_status()
        assert status["enabled"] is True
        assert status["available"] is False
        assert "unavailable" in status["detail"]

        with tracing.generation("quiz", "some-model") as record:
            record["output"] = "still fine"
    finally:
        monkeypatch.undo()

    _reload_settings()


def test_tracing_status_is_reported_by_health(monkeypatch):
    """The UI needs to tell "off" apart from "configured but dead"."""
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    _reload_settings()

    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(), raise_server_exceptions=False) as client:
        body = client.get("/api/health").json()

    assert body["tracing"] is False
    assert body["tracing_status"]["enabled"] is False
    assert "datastore" in body
    _reload_settings()
