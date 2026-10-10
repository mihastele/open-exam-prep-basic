"""Central settings. One env var (MODEL_PROVIDER) switches the LLM backend."""

import os
from functools import lru_cache

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

    model_provider: str = "ollama"  # "ollama" | "hosted"

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

    database_url: str = "sqlite:///./oep.db"
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
    def chat_base_url(self) -> str:
        if self.model_provider == "hosted" and self.hosted_base_url:
            return self.hosted_base_url.rstrip("/")
        return self.ollama_base_url.rstrip("/")

    @property
    def chat_model(self) -> str:
        if self.model_provider == "hosted" and self.hosted_base_url:
            return self.hosted_model
        return self.ollama_model

    @property
    def chat_api_key(self) -> str:
        if self.model_provider == "hosted":
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
        if self.model_provider == "hosted":
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
