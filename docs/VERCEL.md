# Deploying openExamPrep on Vercel (free tier)

Two shapes work. Pick one:

| | Shape A — one project (Services) | Shape B — two projects |
|---|---|---|
| Vercel projects | 1 | 2 (frontend + backend) |
| Domains | one, shared | two, cross-origin (CORS) |
| `NEXT_PUBLIC_API_URL` | leave unset | set to the backend URL |
| Config needed | `vercel.json` (already in the repo) + a dashboard toggle | none |
| Free-tier confidence | depends on Services being enabled for your account | plain Vercel Functions — Hobby-included |

Both keep the model API key **server-side only**. The browser never receives it: it
calls `/api/...` on your own backend, and only the backend holds `HOSTED_API_KEY` /
`EMBED_API_KEY`.

---

## First: a database (required on Vercel)

Vercel Functions have no persistent disk, so the SQLite dev fallback cannot work there.
Create a free Postgres with pgvector — [Neon](https://neon.tech) or
[Supabase](https://supabase.com) both ship the `vector` extension. Copy the
connection string; use Neon's **pooled** (`-pooler`) host, because each serverless
invocation opens its own connection.

The app creates the extension and its tables on first boot, so there is no migration
step.

## Second: a model provider

### Ollama Cloud (cheap, open weights, OpenAI-compatible)

1. Create an API key at <https://ollama.com/settings/keys>.
2. Base URL is `https://ollama.com/v1`.

Cheap chat models (per 1M tokens, from the Ollama pricing page):

| Model | In | Out |
|---|---|---|
| `nemotron-3-nano` | $0.06 | $0.24 |
| `gpt-oss:20b` | $0.07 | $0.30 |
| `gemma4` | $0.14 | $0.40 |

The free plan includes starter credits and a set of starter models; buying credits
unlocks the rest. Check the [pricing page](https://ollama.com/pricing) — the model
line-up moves.

> **Ollama Cloud serves chat models only — there are no cloud embedding models.**
> Point `EMBED_*` at a provider that has them, otherwise retrieval silently degrades
> to keyword search (the tutor still works, and `/api/health` and each answer report
> `degraded: true`). Any OpenAI-compatible embeddings endpoint works; OpenAI's
> `text-embedding-3-small` is the usual cheap pick. Then set `EMBED_DIM` to match
> (768 for `nomic-embed-text`, 1536 for `text-embedding-3-small`) — it is baked into
> the pgvector column, so changing it on a database that already has chunks needs a
> re-ingest.

### Anything else OpenAI-compatible

OpenRouter, Together, HuggingFace router, a self-hosted vLLM: set `HOSTED_BASE_URL`,
`HOSTED_API_KEY`, `HOSTED_MODEL`. If that endpoint also serves embeddings, leave
`EMBED_*` empty and set `HOSTED_EMBED_MODEL`.

## Third: environment variables

Set these in **Project → Settings → Environment Variables** (Production + Preview).
They are shared by every service in a Services project.

| Variable | Value |
|---|---|
| `MODEL_PROVIDER` | `hosted` |
| `HOSTED_BASE_URL` | `https://ollama.com/v1` |
| `HOSTED_API_KEY` | your key — **never** prefix with `NEXT_PUBLIC_` |
| `HOSTED_MODEL` | `gpt-oss:20b` (or `nemotron-3-nano`, `gemma4`) |
| `EMBED_BASE_URL` | an embeddings provider, e.g. `https://api.openai.com/v1` |
| `EMBED_API_KEY` | that provider's key |
| `EMBED_MODEL_NAME` | `text-embedding-3-small` |
| `EMBED_DIM` | `1536` (must match the model) |
| `DATABASE_URL` | your Neon/Supabase connection string |
| `FRONTEND_URL` | your site URL — **Shape B only** (Shape A is same-origin) |
| `NEXT_PUBLIC_API_URL` | your backend URL — **Shape B only**; omit for Shape A |

Optional: `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` to trace
every call. Leave empty to skip tracing.

Do **not** set `UPLOAD_DIR` or `MAX_UPLOAD_MB`: both auto-detect serverless and pick
`/tmp/uploads` and a 4 MB cap. Nothing secret ever belongs in a `NEXT_PUBLIC_*`
variable — those are inlined into the JavaScript that ships to the browser.

## Shape A — one project, one domain

1. Import the repository into Vercel.
2. **Project → Settings → Build and Deployment → Framework Preset → `Services`.**
   The repo root already contains the routing:

   ```json
   {
     "services": {
       "frontend": { "root": "frontend/", "framework": "nextjs" },
       "backend":  { "root": "backend/",  "framework": "fastapi", "entrypoint": "app.main:app" }
     },
     "rewrites": [
       { "source": "/api/(.*)", "destination": { "service": "backend" } },
       { "source": "/(.*)",     "destination": { "service": "frontend" } }
     ]
   }
   ```

3. Set the env vars above, leave `NEXT_PUBLIC_API_URL` empty, deploy.
4. Verify: `https://<your-app>/api/health` should return `{"status":"ok", ...}`.

Vercel does not strip the matched path, so FastAPI receives `/api/health` exactly as
declared in the routers — no path prefix juggling.

## Shape B — two projects (plain Vercel Functions)

Always available on the free plan.

1. **Backend project** — import the repo, set **Root Directory** to `backend/`.
   Vercel detects FastAPI from `backend/app/main.py` and serves it at the project
   root, so `/api/health` and friends work as-is. Set every env var above, plus
   `FRONTEND_URL=https://<frontend-project>.vercel.app`.
2. **Frontend project** — import the same repo, set **Root Directory** to `frontend/`.
   Set `NEXT_PUBLIC_API_URL=https://<backend-project>.vercel.app`, then deploy.

Cross-origin is expected here and the backend allows exactly the origin in
`FRONTEND_URL` (localhost:3000 is allowed too, for local dev).

## Free-tier limits worth knowing

- **Request bodies cap at 4.5 MB**, which is why uploads default to a 4 MB ceiling
  hosted (50 MB locally). Larger material needs direct-to-blob uploads.
- **Function duration**: 300 s default and maximum on Hobby with Fluid compute. LLM
  calls time out at 120 s, comfortably inside that.
- **Cold starts**: the first request after idle is slower — the Python bundle and
  database connection have to warm up.
- **No persistent disk**: uploads land in `/tmp` and vanish between invocations. The
  parsed text is in Postgres, so retrieval keeps working; only the original-file copy
  is lost.
- **OCR is unavailable**: photographed questions need the system `tesseract` binary,
  which is not installed on Vercel. The endpoint returns an honest 501 with guidance
  instead of failing silently.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `status: degraded`, `db: true`, `llm.reachable: false` | wrong `HOSTED_BASE_URL`/`HOSTED_API_KEY`, or the account is out of credits |
| Answers cite nothing, `degraded: true` on chat | `EMBED_*` unset or unreachable — retrieval fell back to keyword search |
| `500` on first request, then fine | cold start hit a database connection limit — use the pooled connection string |
| `FUNCTION_PAYLOAD_TOO_LARGE` on upload | file over 4.5 MB |
| `dimension mismatch` from pgvector | `EMBED_DIM` changed after chunks were embedded; drop the `chunks` table and re-ingest |
