# Self-hosting

## Option A: Docker (recommended for servers)

```bash
cp .env.example .env   # set HOSTED_* or keep Ollama on the host
docker compose up --build
```

This starts Postgres+pgvector, the API on :8000, and the web app on :3000.
Ollama is expected on the host; from inside Docker it is reachable at
`http://host.docker.internal:11434/v1` (Linux needs
`--add-host=host.docker.internal:host-gateway`, already handled by Compose v2).

## Option B: bare metal (recommended for laptops)

```bash
ollama serve & ollama pull qwen2.5:7b && ollama pull nomic-embed-text
cd backend && uv venv && uv sync && uv run uvicorn app.main:app --port 8000 &
cd ../frontend && npm install && npm run dev
```

SQLite fallback means Postgres is optional here; set `DATABASE_URL` to the
Compose DB when you want pgvector retrieval.

## Option C: hosted models, no GPU

Set in `.env`:

```
MODEL_PROVIDER=hosted
HOSTED_BASE_URL=https://openrouter.ai/api/v1
HOSTED_API_KEY=sk-...
HOSTED_MODEL=qwen/qwen-2.5-72b-instruct
```

Any OpenAI-compatible endpoint works (Together, HuggingFace serverless,
self-hosted vLLM). Embeddings fall back to the chat provider; for fully local
embeddings keep an Ollama embed model and set `OLLAMA_EMBED_MODEL`.

## Langfuse

Cloud: paste the three `LANGFUSE_*` values from cloud.langfuse.com.
Self-hosted: follow the [official guide](https://langfuse.com/self-hosting),
then point `LANGFUSE_HOST` at it. Empty keys = tracing off, everything else
still works.

## Backups

User data = Postgres volume `oep_pgdata` + `backend/uploads/`. Back up both.
`DELETE /api/ingest/{id}` removes a document, its chunks, and its file.
