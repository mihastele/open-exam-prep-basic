"""Central settings. One env var (MODEL_PROVIDER) switches the LLM backend."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=["../.env", ".env"], extra="ignore")

    model_provider: str = "ollama"  # "ollama" | "hosted"

    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen2.5:7b"
    ollama_embed_model: str = "nomic-embed-text"

    hosted_base_url: str = ""
    hosted_api_key: str = ""
    hosted_model: str = "qwen/qwen-2.5-72b-instruct"
    hosted_embed_model: str = ""

    # Optional endpoints used *only* for embeddings. Empty = reuse the chat
    # provider. Needed when the chat provider has no embedding models (e.g.
    # Ollama Cloud), so retrieval can keep working instead of degrading to
    # keyword search.
    embed_base_url: str = ""
    embed_api_key: str = ""
    embed_model_name: str = ""

    embed_dim: int = 768  # nomic-embed-text; override to match your embed model

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
            return self.hosted_api_key
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
