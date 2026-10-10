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

The copied file needs no edits: with `MODEL_PROVIDER` unset the app uses local Ollama
on your machine, and the Vercel AI Gateway when deployed. To point a *local* run at the
gateway instead, set `MODEL_PROVIDER=hosted` and a key.

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

The default is the **Vercel AI Gateway**. `MODEL_PROVIDER` overrides it:

| `MODEL_PROVIDER` | Uses | Needs |
|---|---|---|
| *(unset — default)* | Vercel AI Gateway when deployed on Vercel, local Ollama otherwise | a key on Vercel, nothing locally |
| `hosted` | Vercel AI Gateway by default; any OpenAI-compatible chat API | `HOSTED_API_KEY` |
| `ollama` | Local Ollama, OpenAI-compatible `/v1` | `ollama serve` + pulled models |

**One client for every feature.** The tutor, quizzes, mock exams, study plans, podcasts
and embeddings all call the same `app/services_llm.py`, so there is no way for the tutor
to end up on a different gateway from the rest of the app. To check what is actually in
use, read `/api/health` → `llm.base_url`, which names the endpoint requests really go to.

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

## Environment variables, and why each one matters

Everything is optional except picking a model provider. Copy `.env.example` and uncomment
what you need — the file documents each one in place.

**Picking the model**

| Variable | Why it exists |
|---|---|
| `MODEL_PROVIDER` | The top-level override. Leave it unset and the app picks the gateway when hosted and Ollama when local, so a deployment never tries to reach a localhost model server. |
| `HOSTED_BASE_URL` | Which OpenAI-compatible endpoint to call. Defaults to Vercel AI Gateway; change it for OpenRouter, Together, vLLM, LM Studio. |
| `HOSTED_API_KEY` | The chat key. On Vercel you can leave it empty — `AI_GATEWAY_API_KEY` is picked up, then `VERCEL_OIDC_TOKEN`, so no secret needs storing at all. |
| `HOSTED_MODEL` | The chat model, `creator/model`. Check `GET /v1/models` on the gateway for the live list rather than trusting a hardcoded name. |
| `HOSTED_EMBED_MODEL` | The embedding model, used for retrieval over your own material. |
| `OLLAMA_*` | The offline path: no key, no account, no network. `OLLAMA_EMBED_MODEL` is separate because Ollama Cloud serves chat models only. |

**Retrieval quality**

| Variable | Why it exists |
|---|---|
| `EMBED_BASE_URL` / `EMBED_API_KEY` / `EMBED_MODEL_NAME` | A dedicated embedding endpoint. Needed when the chat provider has no embedding models — otherwise retrieval silently degrades to keyword search and finds literal words instead of the passage that means the same thing. |
| `EMBED_DIM` | The pgvector column width. Inferred from the embed model name so the model and the column cannot drift apart; set it only for an unlisted model. Changing the embed model on an existing database needs a re-ingest — stored vectors cannot be converted. |

**Running it for real**

| Variable | Why it exists |
|---|---|
| `DATABASE_URL` | Persistence. With none set, a serverless host keeps material in SQLite inside one instance, which resets on the next cold start. A *configured* database that cannot be reached is ignored rather than fatal, and `/api/health` says which happened. |
| `LANGFUSE_*` | The only way to see what the model was actually told — prompt, retrieved sources, latency, cost — when an answer looks wrong. |
| `FRONTEND_URL` | CORS allow-list, needed only in the two-project shape where the frontend is on another origin. |
| `MAX_UPLOAD_MB` | Upload rejection threshold. Auto: 50 MB local, 4 MB hosted, because Vercel refuses bodies over 4.5 MB before your code runs. |
| `UPLOAD_DIR` | Where the original file is kept. Rarely worth setting: the parsed text and chunks live in the database, so the raw copy is a convenience, not the source of truth. |
| `PODCAST_SECTION_MINUTES` / `PODCAST_MAX_SECTIONS` / `PODCAST_WORKERS` | How an episode's length target is divided into sections, how many sections an episode may have, and how many are written at once. Workers are real provider calls — keep the number modest on a serverless time budget. |
| `STT_PROVIDER` / `TTS_PROVIDER` | Default `none` uses the browser's Web Speech API: free and no audio leaves the device. Set a provider only for consistent voices across browsers or server-side transcription. |

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

**If the database you configure does not answer, it is ignored rather than fatal.** The
backend probes it once at startup; on failure it runs on the SQLite fallback for that
instance and says so in `/api/health` and in the UI, with the reason. You get a working
app with a loud warning instead of a broken one. A Postgres that connects but lacks
pgvector is still used — material persists and retrieval ranks in Python.

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
