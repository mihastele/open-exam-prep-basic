# openExamPrep

A free, open-source AI exam coach: upload your notes, slides, and past papers,
get a study plan, a grounded tutor, quizzes, flashcards, mock exams, oral-exam
practice, podcasts, and progress tracking. Your material stays yours.

Built with FastAPI, Next.js, Postgres + pgvector, Langfuse observability, and
open-weights models — local-first via Ollama, with a one-variable switch to any
hosted OpenAI-compatible endpoint.

## What it does

- **Material ingestion** — PDF, PPTX, text/Markdown, images; chunked, embedded,
  and retrieved with pgvector so every answer is grounded in *your* material.
- **Personal tutor** — level-adaptive, step-by-step Socratic chat that cites the
  chunks it used and won't move on until you get it.
- **Instant practice** — quizzes, flashcards, and mock exams generated from any
  topic or document in seconds.
- **Study plans** — set an exam date, get a topic-by-topic plan that adapts to
  your mastery.
- **Timed mock exams + oral practice** — full simulations with grading; oral mode
  runs on free browser speech APIs by default.
- **Scan-a-question solver** — photograph a problem, get guided steps, not just
  the answer.
- **Study podcasts** — generated scripts read aloud in-browser; hook up Whisper /
  Piper later for offline audio.
- **Progress + gamification** — mastery per topic, streaks, badges.
- **Breaks + playground** — logic puzzles, daily challenges, and a plugin slot
  for interactive visual explainers.
- **Observability** — every LLM call traced in Langfuse (cloud or self-hosted,
  optional).

See [docs/ASTRA_PARITY.md](docs/ASTRA_PARITY.md) for the feature-by-feature
mapping to the commercial product this project replaces.

## Quickstart (local, free)

Prerequisites: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+,
[Ollama](https://ollama.ai) with a chat + embed model:

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Backend:

```bash
cd backend
uv venv && uv sync
cp ../.env.example ../.env   # defaults work: Ollama local, SQLite fallback
uv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Run (one shell each, from the repo root):

```bash
cd backend && OLLAMA_MODEL=gemma3:1b uv run uvicorn app.main:app --port 8000
cd frontend && npm run dev
```

On CPU-only machines prefer a small model like `gemma3:1b` — a 12b model times
out; use it only with a GPU. `nomic-embed-text` covers retrieval.

Open [http://localhost:3000](http://localhost:3000) in a browser.
API docs live at [http://localhost:8000/docs](http://localhost:8000/docs).

Prefer Docker? `docker compose up --build` starts Postgres, the API, and the web
app together (Ollama still runs on your host; point `OLLAMA_BASE_URL` at it).

## Model switch

One variable in `.env` picks the provider; no code changes:

| `MODEL_PROVIDER` | Uses | Needs |
|---|---|---|
| `ollama` (default) | Local Ollama, OpenAI-compatible `/v1` | `ollama serve` + pulled models |
| `hosted` | Any OpenAI-compatible chat API | `HOSTED_BASE_URL` + `HOSTED_API_KEY` |

Embeddings follow the same provider. If no provider is reachable, `/api/health`
reports `degraded` and the API returns an explicit 503 instead of fake output.

## Langfuse (optional, recommended)

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` in `.env`
(cloud or [self-hosted](https://langfuse.com/self-hosting)). Every tutor answer,
quiz, grade, and plan is traced with prompt, retrieved chunks, latency, and
cost. Leave them empty to run fully offline.

## Project layout

```
backend/    FastAPI API: ingest, RAG tutor, practice, plans, exams, podcast, progress
frontend/   Next.js app: study workspace UI (EN + SL scaffold, more welcome)
docs/       Architecture, parity map, self-hosting guide
```

## Contributing

Small, reviewable PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good
first issues: more file parsers, more locales, more interactive explainers.

## License

MIT — see [LICENSE](LICENSE). Your notes and uploads never leave your machine
unless you point the app at a hosted model yourself.
