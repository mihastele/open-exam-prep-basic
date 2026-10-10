"""Single LLM entrypoint for every feature — tutor, quizzes, exams, plans, podcasts.

Defaults to the Vercel AI Gateway when hosted (one base URL and one key serve chat
*and* embeddings), and to local Ollama otherwise; see `resolved_provider`. Both
speak the OpenAI dialect, so the switch is just base URL + model + key. Every call
is Langfuse-traced. When no provider is reachable we raise LLMUnavailable so
routers return an honest 503 — never fake output.
"""

import httpx

from . import services_tracing as tracing
from .config import get_settings


class LLMUnavailable(Exception):
    pass


def _headers() -> dict:
    key = get_settings().chat_api_key
    if not key:
        # Sending "Bearer " would surface as a cryptic httpx header error; say
        # what is actually wrong instead.
        raise LLMUnavailable(
            "no API key configured — set HOSTED_API_KEY (or AI_GATEWAY_API_KEY) "
            "when MODEL_PROVIDER=hosted"
        )
    return {"Authorization": f"Bearer {key}"}


def provider_status() -> dict:
    s = get_settings()
    name = "hosted" if (s.resolved_provider == "hosted" and s.hosted_base_url) else "ollama"
    status: dict = {
        "provider": name,
        "model": s.chat_model,
        # Which endpoint requests are really going to. Without this, "is it using the
        # AI Gateway or something local?" is unanswerable from the outside.
        "base_url": s.chat_base_url,
        "reachable": False,
    }
    if name == "ollama" and s.is_serverless:
        # Only possible if someone explicitly pinned it — but a stale .env.example or
        # a copied dashboard variable is exactly how that happens, and the symptom
        # (everything unreachable, nothing saying why) is miserable to debug.
        status["warning"] = (
            "MODEL_PROVIDER is set to a local Ollama on a hosted deployment, where "
            "nothing listens on localhost. Set MODEL_PROVIDER=hosted — or remove it — "
            "to use the Vercel AI Gateway."
        )
    try:
        r = httpx.get(f"{s.chat_base_url}/models", headers=_headers(), timeout=5.0)
        # 401/403 = missing or rejected key, 404 = wrong base URL. Those are
        # failures, not "reachable but busy" — reporting them as reachable would
        # call a mistyped key healthy while every real call 503s. 429 is alive.
        status["reachable"] = r.status_code < 400 or r.status_code == 429
        if r.status_code >= 400:
            status["status_code"] = r.status_code
        else:
            listed = {m.get("id") for m in (r.json().get("data") or []) if isinstance(m, dict)}
            # Only meaningful when the provider actually enumerates models, and
            # advisory: some providers hide models or use different aliases.
            if listed:
                status["model_listed"] = s.chat_model in listed
    except Exception as e:
        status["detail"] = str(e)[:200]
    return status


def chat(
    messages: list[dict],
    *,
    task: str = "chat",
    temperature: float = 0.4,
    max_tokens: int = 1200,
    json_mode: bool = False,
) -> str:
    s = get_settings()
    headers = _headers()
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
                headers=headers,
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
    key = s.embed_key
    if not key:
        raise LLMUnavailable(
            "no embedding API key configured — set EMBED_API_KEY or HOSTED_API_KEY"
        )
    try:
        r = httpx.post(
            f"{s.embed_url}/embeddings",
            json={"model": s.embed_model, "input": texts},
            headers={"Authorization": f"Bearer {key}"},
            timeout=120.0,
        )
        r.raise_for_status()
        return [d["embedding"] for d in r.json()["data"]]
    except Exception as e:
        raise LLMUnavailable(f"embeddings unreachable at {s.embed_url}: {e}")
