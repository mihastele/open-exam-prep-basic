"""Offline test env: throwaway SQLite DB, unreachable LLM → degraded paths."""

import os

os.environ["DATABASE_URL"] = "sqlite:////tmp/oep_test.db"
os.environ["MODEL_PROVIDER"] = "ollama"
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:9/v1"  # unroutable: forces degraded
os.environ["LANGFUSE_PUBLIC_KEY"] = ""
os.environ["LANGFUSE_SECRET_KEY"] = ""

if os.path.exists("/tmp/oep_test.db"):
    os.remove("/tmp/oep_test.db")
