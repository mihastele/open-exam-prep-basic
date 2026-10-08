"""Single LLM entrypoint. Ollama-local or any hosted OpenAI-compatible API.

Both providers speak the OpenAI dialect, so the switch is just base URL +
model + key. Every call is Langfuse-traced. When no provider is reachable we
raise LLMUnavailable so routers return an honest 503 — never fake output.
"""

import httpx

from . import services_tracing as tracing
from .config import get_settings


class LLMUnavailable(Exception):
    pass


def _headers() -> dict:
    return {"Authorization": f"Bearer {get_settings().chat_api_key}"}


def provider_status() -> dict:
    s = get_settings()
    name = "hosted" if (s.model_provider == "hosted" and s.hosted_base_url) else "ollama"
    try:
        r = httpx.get(f"{s.chat_base_url}/models", headers=_headers(), timeout=2.0)
        reachable = r.status_code < 500
    except Exception:
        reachable = False
    return {"provider": name, "model": s.chat_model, "reachable": reachable}


def chat(
    messages: list[dict],
    *,
    task: str = "chat",
    temperature: float = 0.4,
    max_tokens: int = 1200,
    json_mode: bool = False,
) -> str:
    s = get_settings()
    payload: dict = {
        "model": s.chat_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    with tracing.generation(task, s.chat_model) as rec:
        rec["input"] = messages
        try:
            r = httpx.post(
                f"{s.chat_base_url}/chat/completions",
                json=payload,
                headers=_headers(),
                timeout=120.0,
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            raise LLMUnavailable(f"{s.chat_model} unreachable at {s.chat_base_url}: {e}")
        content = (data["choices"][0]["message"].get("content") or "").strip()
        rec["output"] = content
        rec["usage"] = data.get("usage")
        return content


def embed(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    try:
        r = httpx.post(
            f"{s.chat_base_url}/embeddings",
            json={"model": s.embed_model, "input": texts},
            headers=_headers(),
            timeout=120.0,
        )
        r.raise_for_status()
        return [d["embedding"] for d in r.json()["data"]]
    except Exception as e:
        raise LLMUnavailable(f"embeddings unreachable at {s.chat_base_url}: {e}")
