"""Langfuse tracing. Entirely optional: no-op when keys are empty, and it never
breaks a request — a missing package, bad keys or an unreachable host all degrade
to "not traced"."""

import os
from contextlib import contextmanager

from .config import get_settings


def tracing_status() -> dict:
    """Whether traces will actually be sent — for /api/health and the UI.

    Distinct from `tracing_enabled`, which only looks at the keys: this also says
    whether the client library is importable, so "keys set but tracing dead" is
    visible instead of silent.
    """
    s = get_settings()
    if not s.tracing_enabled:
        return {"enabled": False, "available": False, "detail": "no LANGFUSE_* keys"}
    try:
        import langfuse  # noqa: F401
    except Exception as e:  # noqa: BLE001
        return {
            "enabled": True,
            "available": False,
            "detail": f"keys set but the langfuse package is unavailable: {e}",
        }
    return {"enabled": True, "available": True, "detail": f"host {s.langfuse_host}"}


def _client():
    s = get_settings()
    if not s.tracing_enabled:
        return None
    try:
        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", s.langfuse_public_key)
        os.environ.setdefault("LANGFUSE_SECRET_KEY", s.langfuse_secret_key)
        os.environ.setdefault("LANGFUSE_HOST", s.langfuse_host)
        from langfuse import get_client

        return get_client()
    except Exception:
        try:
            from langfuse import Langfuse

            return Langfuse(
                public_key=s.langfuse_public_key,
                secret_key=s.langfuse_secret_key,
                host=s.langfuse_host,
            )
        except Exception:
            return None


@contextmanager
def generation(task: str, model: str, metadata: dict | None = None):
    """Yield a dict to fill with input/output; flushes a Langfuse generation."""
    record: dict = {"input": None, "output": None, "usage": None}
    yield record
    client = _client()
    if client is None:
        return
    try:
        with client.start_as_current_generation(
            name=task, model=model, metadata=metadata or {}
        ) as gen:
            if record["input"] is not None:
                gen.update(input=record["input"], output=record["output"])
            if record["usage"]:
                gen.update(usage=record["usage"])
    except Exception:
        pass
