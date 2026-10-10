# openExamPrep

A free, open-source AI exam coach: upload your notes, slides, and past papers,
get a study plan, a grounded tutor, quizzes, flashcards, mock exams, oral-exam
practice, podcasts, and progress tracking. Your material stays yours.

Built with FastAPI, Next.js, Postgres + pgvector, Langfuse observability, and
open-weights models — local-first via Ollama, with a one-variable switch to any
hosted OpenAI-compatible endpoint. The database and the observability are both
optional: the app runs with neither.

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
- **Study podcasts** — the episode is planned first, then written section by section
  against that plan, so a long episode stays on-arc instead of drifting into a
  random talk. Chapters, follow-along highlighting, and two host voices in the
  browser — no audio keys needed.
- **Progress + gamification** — mastery per topic, streaks, badges.
- **Breaks + playground** — logic puzzles, daily challenges, and a plugin slot
  for interactive visual explainers.
- **Observability** — every LLM call traced in Langfuse (cloud or self-hosted,
  optional).
- **Take it with you** — every generated answer, quiz, flashcard set, mock, plan
  and podcast episode can be copied to the clipboard (as plain text or Markdown)
  or downloaded as Markdown, plain text, Word, PDF, HTML, JSON — plus CSV for
  quizzes and flashcards, which imports straight into Anki or a spreadsheet. All
  of it is done in the browser: no extra service, no server round trip.

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
| `hosted` | Vercel AI Gateway by default; any OpenAI-compatible chat API | `HOSTED_API_KEY` |

`hosted` defaults to [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) —
`alibaba/qwen3.7-flash` for chat and `openai/text-embedding-3-small` for embeddings,
both behind one base URL and one key. Embeddings follow the chat provider unless you
set `EMBED_BASE_URL` / `EMBED_API_KEY` / `EMBED_MODEL_NAME`, which is what you need for
providers that serve chat models only (Ollama Cloud has no cloud embedding models).
`EMBED_DIM` is inferred from the embed model name so the pgvector column cannot drift
from the model; without a reachable embedder, retrieval falls back to keyword search
and says so.

If no provider is reachable, `/api/health` reports `degraded` (with the HTTP status
and reason) and the API returns an explicit 503 instead of fake output.

## Deploy free on Vercel

The repo is ready to deploy as-is: the Next.js app and the FastAPI backend go up
together (one Vercel **Services** project, or two plain projects), against a free
Neon/Supabase Postgres and Vercel AI Gateway. The API key lives only in the backend's
server-side env vars — the browser only ever calls your own `/api/...` and never sees
it; on Vercel the gateway key can even be dropped in favour of the deployment's OIDC
token.

See [docs/VERCEL.md](docs/VERCEL.md) for the full walkthrough, the env vars to set,
the gateway setup, and the free-tier limits (4.5 MB request bodies, ephemeral disk,
no OCR).


## Langfuse (optional, recommended)

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` in `.env`
(cloud or [self-hosted](https://langfuse.com/self-hosting)). Every tutor answer,
quiz, grade, and plan is traced with prompt, retrieved chunks, latency, and
cost. Leave them empty to run fully offline — no account, no keys, and nothing sent
anywhere. `/api/health` tells "off" apart from "configured but the client failed to
load", so a broken tracing setup is visible rather than silent.

## Database (optional)

Leave `DATABASE_URL` unset and the app runs on SQLite: a file on disk locally, and in
the temp directory on a serverless host. The serverless version is *ephemeral* — it
resets on cold start and is not shared between instances — so `/api/health` reports
`datastore.persistent: false` and the status widget says **“Nothing is being saved”**
rather than letting your material disappear quietly.

For anything real, attach Postgres. There is a permanent free tier: **Neon**
(0.5 GB, 100 CU-hours/month, scale-to-zero) or **Supabase** (500 MB, but free projects
pause after a week idle). Both ship pgvector, so retrieval works out of the box.

## Project layout

```
backend/    FastAPI API: ingest, RAG tutor, practice, plans, exams, podcast, progress
frontend/   Next.js app: study workspace UI (EN + SL scaffold, more welcome)
docs/       Architecture, parity map, self-hosting, Vercel deployment
```

## Contributing

Small, reviewable PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good
first issues: more file parsers, more locales, more interactive explainers.

## License

MIT — see [LICENSE](LICENSE). Your notes and uploads never leave your machine
unless you point the app at a hosted model yourself.
