"""Central settings. One env var (MODEL_PROVIDER) switches the LLM backend."""

import os
import tempfile
from functools import lru_cache
from typing import Any

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Native output dimensions of the embedding models we know about. Deriving the
# pgvector column size from the model name keeps the two from drifting apart.
EMBED_DIMS = {
    "nomic-embed-text": 768,
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    "text-embedding-005": 768,
    "gemini-embedding-001": 3072,
    "gemini-embedding-2": 3072,
    "qwen3-embedding-0.6b": 1024,
    "qwen3-embedding-4b": 2560,
    "qwen3-embedding-8b": 4096,
}
DEFAULT_EMBED_DIM = 1536


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=["../.env", ".env"], extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _blank_means_unset(cls, data: Any) -> Any:
        """Treat a present-but-empty environment variable as if it were unset.

        Dashboards and `.env` files routinely carry `SOMETHING=` to mean "leave it
        at the default". Pydantic reads that as an explicit empty string, so an
        `int` field fails to parse and `Settings()` raises. That happens while
        `app.db` is building its engine — i.e. at *import* time — which takes the
        whole serverless function down before any handler, including
        `/api/health`, can report it. Dropping the blank lets the field default
        apply instead, and keeps `FOO=` safe to leave in a config file.
        """
        if isinstance(data, dict):
            return {
                k: v for k, v in data.items() if not (isinstance(v, str) and not v.strip())
            }
        return data

    # "" = auto (see resolved_provider): the Vercel AI Gateway on a hosted
    # deployment, local Ollama otherwise. Set "hosted" or "ollama" to force one.
    #
    # The default used to be "ollama", which meant a fresh Vercel deployment called
    # localhost:11434 — where nothing listens — and every tutor, quiz, exam and
    # podcast request failed.
    model_provider: str = ""

    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen2.5:7b"
    ollama_embed_model: str = "nomic-embed-text"

    # Hosted OpenAI-compatible endpoint. Defaults to Vercel AI Gateway, where one
    # base URL and one key serve both chat and embeddings. Any other
    # OpenAI-compatible provider works by overriding these three.
    hosted_base_url: str = "https://ai-gateway.vercel.sh/v1"
    hosted_api_key: str = ""
    hosted_model: str = "alibaba/qwen3.7-flash"
    hosted_embed_model: str = "openai/text-embedding-3-small"

    # Optional endpoints used *only* for embeddings. Empty = reuse the chat
    # provider. Needed when the chat provider has no embedding models (e.g.
    # Ollama Cloud), so retrieval can keep working instead of degrading to
    # keyword search.
    embed_base_url: str = ""
    embed_api_key: str = ""
    embed_model_name: str = ""

    # 0 = infer from the embed model (see resolved_embed_dim). Set it only for a
    # model that is not in EMBED_DIMS.
    embed_dim: int = 0

    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # Empty = auto: a SQLite file on disk locally, and in the system temp dir on a
    # serverless host (everywhere else there is read-only). Postgres is strongly
    # recommended in production — see `datastore`, which /api/health reports.
    database_url: str = ""
    frontend_url: str = "http://localhost:3000"

    # Uploads. Empty = "uploads" locally, "/tmp/uploads" on serverless (the
    # rest of the filesystem is read-only there). The parsed text lives in the
    # database, so the raw file is a convenience copy, not the source of truth.
    upload_dir: str = ""
    max_upload_mb: int = 0  # 0 = auto: 4 MB hosted (Vercel caps bodies at 4.5), 50 MB local

    # Podcast: target length of one planned section, the ceiling on sections per
    # episode, and how many sections may be written at once.
    podcast_section_minutes: int = 4
    podcast_max_sections: int = 16
    podcast_workers: int = 4

    @property
    def is_serverless(self) -> bool:
        """True on Vercel (and similar) where the filesystem is read-only."""
        return bool(os.getenv("VERCEL"))

    @property
    def resolved_provider(self) -> str:
        """Which backend we will actually call: "hosted" or "ollama".

        Empty MODEL_PROVIDER means "auto". On a serverless host that is the Vercel AI
        Gateway, because a localhost Ollama cannot exist there — one provider serves
        chat and embeddings, and the key can come from Vercel itself. Locally the
        default stays Ollama so the offline quickstart keeps working with no keys.
        An explicit value always wins.
        """
        if self.model_provider in ("hosted", "ollama"):
            return self.model_provider
        return "hosted" if self.is_serverless else "ollama"

    @property
    def chat_base_url(self) -> str:
        if self.resolved_provider == "hosted" and self.hosted_base_url:
            return self.hosted_base_url.rstrip("/")
        return self.ollama_base_url.rstrip("/")

    @property
    def chat_model(self) -> str:
        if self.resolved_provider == "hosted" and self.hosted_base_url:
            return self.hosted_model
        return self.ollama_model

    @property
    def chat_api_key(self) -> str:
        if self.resolved_provider == "hosted":
            # Explicit setting first, then Vercel's conventional variable name,
            # then the OIDC token Vercel injects into deployments — which lets a
            # project call AI Gateway without storing a key at all.
            return (
                self.hosted_api_key
                or os.getenv("AI_GATEWAY_API_KEY", "")
                or os.getenv("VERCEL_OIDC_TOKEN", "")
            )
        return "ollama"  # Ollama ignores the key but the header is required

    @property
    def embed_model(self) -> str:
        if self.embed_model_name:
            return self.embed_model_name
        if self.resolved_provider == "hosted":
            return self.hosted_embed_model or self.hosted_model
        return self.ollama_embed_model

    @property
    def embed_url(self) -> str:
        return (self.embed_base_url or self.chat_base_url).rstrip("/")

    @property
    def embed_key(self) -> str:
        return self.embed_api_key or self.chat_api_key

    @property
    def resolved_embed_dim(self) -> int:
        if self.embed_dim:
            return self.embed_dim
        name = self.embed_model.rsplit("/", 1)[-1].split(":", 1)[0]
        return EMBED_DIMS.get(name, DEFAULT_EMBED_DIM)

    @property
    def upload_path(self) -> str:
        if self.upload_dir:
            return self.upload_dir
        return "/tmp/uploads" if self.is_serverless else "uploads"

    @property
    def max_upload_bytes(self) -> int:
        if self.max_upload_mb:
            return self.max_upload_mb * 1024 * 1024
        return (4 if self.is_serverless else 50) * 1024 * 1024

    @property
    def tracing_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)

    @property
    def default_database_url(self) -> str:
        """What we use when nothing is configured *or* when the configured one fails.

        The database is optional, so this has to be somewhere writable — the cwd is
        read-only on a serverless host. `tempfile` respects TMPDIR and is the one
        writable place on Vercel.
        """
        if self.is_serverless:
            path = os.path.join(tempfile.gettempdir(), "oep.db").replace("\\", "/")
            return f"sqlite:///{path}"
        return "sqlite:///./oep.db"

    @property
    def resolved_database_url(self) -> str:
        """What is configured. An empty DATABASE_URL means 'use the default'."""
        return self.database_url or self.default_database_url

    @property
    def datastore(self) -> dict:
        """What we are *trying* to store in. The live answer comes from app.db,
        which knows whether the configured database actually answered."""
        return describe_store(self.resolved_database_url, self.is_serverless)


def describe_store(url: str, serverless: bool) -> dict:
    """Describe a database URL for humans: what it is, and whether it survives.

    A pure function because `app.db` needs the same description for the store it
    ended up using, which is not always the one that was configured.
    """
    if url.startswith(("postgresql", "postgres")):
        return {
            "kind": "postgres",
            "persistent": True,
            "detail": "Postgres with pgvector — material and vectors are kept.",
        }
    if serverless:
        return {
            "kind": "sqlite-ephemeral",
            "persistent": False,
            "detail": (
                "SQLite in the temp directory. It resets on every cold start and is "
                "not shared between concurrent instances, so uploaded material "
                "disappears. Attach a free Postgres (Neon or Supabase — both have a "
                "permanent free tier) to keep it."
            ),
        }
    return {
        "kind": "sqlite",
        "persistent": True,
        "detail": "SQLite file on disk — fine locally, not for production.",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
