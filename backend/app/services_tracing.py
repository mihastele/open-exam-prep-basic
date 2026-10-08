"""Langfuse tracing. No-op when keys are empty; never breaks a request."""

import os
from contextlib import contextmanager

from .config import get_settings


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
