"""Central settings. One env var (MODEL_PROVIDER) switches the LLM backend."""

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

    embed_dim: int = 768  # nomic-embed-text; override to match your embed model

    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    database_url: str = "sqlite:///./oep.db"
    frontend_url: str = "http://localhost:3000"
    upload_dir: str = "uploads"

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
        if self.model_provider == "hosted":
            return self.hosted_embed_model or self.hosted_model
        return self.ollama_embed_model

    @property
    def tracing_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
