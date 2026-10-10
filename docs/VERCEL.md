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

## First: a database (optional)

**You can skip this entirely.** With no `DATABASE_URL` the app runs on SQLite in the
temp directory: it boots, uploads, quizzes and tutors all work, and nothing needs a
database account. The catch is that it is *ephemeral* — the file lives inside one
function instance, resets on every cold start, and is not shared with concurrent
instances, so uploaded material disappears. `/api/health` reports this as
`datastore.persistent: false` and the home-page status widget shows a
**“Nothing is being saved”** banner, so it can never look like things are kept when
they are not.

For anything real, attach Postgres. There is a **permanent free tier**:

| | Free | Catch |
|---|---|---|
| [Neon](https://neon.tech) | 0.5 GB storage, 100 CU-hours/month, scale-to-zero, 10 branches, no card | compute suspends when the monthly allowance runs out; no time limit. Pre-wired into the Vercel Marketplace, so it injects the connection string for you |
| [Supabase](https://supabase.com) | 500 MB database, plus auth/storage/realtime | free projects **pause after ~1 week of inactivity** (nothing is lost, but a quiet demo goes dark) |

Both are Postgres and both ship the `vector` extension, so pgvector works out of the
box. (`Vercel Postgres` is no longer a first-party product — it is provisioned through
a Marketplace partner, which is Neon or Supabase under the hood.)

Paste the URL exactly as your provider gives it — a plain `postgresql://…` is fine,
the backend rewrites it to name the psycopg driver. Prefer Neon's **pooled**
(`-pooler`) host, because each serverless invocation opens its own connection.

**A database that does not answer is ignored, not fatal.** The backend probes
`DATABASE_URL` once at startup — bounded by a 10 s connect timeout — and if it cannot
connect it drops that database for the instance and runs on the SQLite fallback.
`/api/health` reports `datastore.fallback: true` with the reason, and the status widget
says so plainly. Nothing is hidden: an app that quietly loses your material is worse
than one that says it is.

That 10 s is not added latency. A failed `CREATE TABLE` used to spend the same 10 s and
then leave **every** DB-backed route returning 503 until the instance recycled; the
probe converts a permanently broken deployment into a working one. A database that
answers is never discarded.

**Connecting is the bar, not pgvector.** A Postgres that connects but cannot create the
`vector` extension is still used: material stays persistent and retrieval falls back to
ranking in Python (`datastore.pgvector: false`, and answers are labelled as keyword
search in the UI). Discarding a working database to avoid a missing extension would
lose your data for no reason. Only an unreachable one triggers the fallback.

## Second: a model provider

**You have to do nothing here.** The default when deployed (a host that sets `VERCEL`)
is the Vercel AI Gateway, and **one client serves every feature** — tutor, quizzes,
mock exams, study plans, podcasts and embeddings all go through `app/services_llm.py`,
so the tutor cannot be on a different gateway from the rest.

`MODEL_PROVIDER` is the override, not a requirement:

| Value | Effect |
|---|---|
| *(unset)* | Vercel AI Gateway when hosted, local Ollama otherwise |
| `hosted` | Force the gateway (or whatever `HOSTED_BASE_URL` points at) |
| `ollama` | Force a local Ollama — **never** useful on Vercel, where nothing listens on localhost |

Leave it set to `ollama` on a deployment and every request fails; `/api/health` now
flags exactly that case with a `warning`, because the symptom (nothing reachable,
nothing explaining why) is otherwise miserable to debug. To confirm what is really in
use, read `llm.base_url` from `/api/health` — it names the endpoint requests go to.

### Vercel AI Gateway (the default)

One base URL and one key serve both chat and embeddings, so there is nothing to
reconcile across two providers. AI Gateway is available on **all plans**, charges the
provider's list price with **no markup**, and every team gets **$5/month of free
credits** on a subset of models — see
[the free-tier model list](https://vercel.com/ai-gateway/models?freeTier=true).

```
HOSTED_BASE_URL=https://ai-gateway.vercel.sh/v1
HOSTED_MODEL=alibaba/qwen3.7-flash
HOSTED_EMBED_MODEL=openai/text-embedding-3-small
```

Both IDs are confirmed against the live catalogue (`GET /v1/models` — 415 models at
the time of writing): `alibaba/qwen3.7-flash` is a *language* model and
`openai/text-embedding-3-small` an *embedding* model. Because they share the gateway,
no `EMBED_BASE_URL` is needed.

**Authentication.** Create a key on the AI Gateway page and set `HOSTED_API_KEY`. On
Vercel you can also skip that entirely: the backend falls back to Vercel's
conventional `AI_GATEWAY_API_KEY`, and then to the `VERCEL_OIDC_TOKEN` Vercel injects
into every deployment — so a project can call the gateway with no stored secret.

> Probing the gateway with **no** `Authorization` header returns `200`, but a *bad*
> key returns `401`. `/api/health` therefore treats `401/403/404` as unreachable
> (rather than "reachable but busy") and reports the status code, so a mistyped key is
> caught immediately instead of looking healthy while every call 503s.

### Ollama Cloud (alternative — open weights, needs a separate embedder)

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
| `MODEL_PROVIDER` | *(unset = auto)* — gateway when hosted, Ollama when local. Set only to force one |
| `HOSTED_BASE_URL` | `https://ai-gateway.vercel.sh/v1` |
| `HOSTED_API_KEY` | your AI Gateway key — **never** prefix with `NEXT_PUBLIC_`. Optional on Vercel: falls back to `AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN`. |
| `HOSTED_MODEL` | `alibaba/qwen3.7-flash` |
| `HOSTED_EMBED_MODEL` | `openai/text-embedding-3-small` |
| `DATABASE_URL` | **optional.** Your Neon/Supabase connection string — omit it to run on ephemeral SQLite and lose data on cold starts |
| `FRONTEND_URL` | your site URL — **Shape B only** (Shape A is same-origin) |
| `NEXT_PUBLIC_API_URL` | your backend URL — **Shape B only**; omit for Shape A |

That is the whole list on the default gateway setup. `EMBED_*` stay empty (the gateway
serves embeddings too) and `EMBED_DIM` is inferred as **1536** from
`text-embedding-3-small`.

Optional: `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` to trace
every call. Skip them and tracing is simply off — no account, no keys and no package
required at runtime; every request behaves identically. `/api/health` distinguishes
"off" from "configured but the client failed to load", and the status widget prints the
difference.

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
| A **“Nothing is being saved”** banner | either no `DATABASE_URL` at all, or one that did not answer — see *First: a database (optional)*. Uploads vanish on the next cold start, so fix `DATABASE_URL` |
| `datastore.fallback: true` | the configured database was unreachable at startup, so this instance is on ephemeral SQLite. `datastore.reason` names the cause (wrong host, rejected credentials, paused project) |
| `datastore.pgvector: false` | connected, but the `vector` extension is unavailable, so retrieval ranks in Python. Material still persists; answers say they came from keyword search |
| `/api/health` says provider is `ollama` | `MODEL_PROVIDER` is pinned to a local Ollama on a host where nothing listens on `localhost`. Remove it, or set `hosted`, to use the gateway — health carries a `warning` for this case and the widget shows it |
| Everything unreachable, no reason given | check `llm.base_url` in `/api/health`: it names the endpoint actually being called, so a stale `HOSTED_BASE_URL` is visible rather than guessed at |
| `FUNCTION_INVOCATION_FAILED` on **every** route | the function died at cold start. Startup no longer raises for a bad database, so redeploy and read `/api/health` → `db_error`; an invalid *setting* (not a blank one) still fails at import, and the traceback is under Deployments → Functions → the runtime log |
| `status: degraded`, `db: true`, `llm.reachable: false` | wrong `HOSTED_BASE_URL`/`HOSTED_API_KEY`, or out of credits. `/api/health` carries `status_code` (401 = key rejected, 404 = wrong base URL) and the status widget names the reason |
| `● ready` but chat fails with 404 | `HOSTED_MODEL` is not in the provider's catalogue. Health reports `model_listed: false` when the provider enumerates models |
| Answers cite nothing, `degraded: true` on chat | embeddings unreachable — retrieval fell back to keyword search |
| `500` on first request, then fine | cold start hit a database connection limit — use the pooled connection string |
| `FUNCTION_PAYLOAD_TOO_LARGE` on upload | file over 4.5 MB |
| pgvector `dimension mismatch` after switching embed model | `chunks.embedding` is sized for the old model (768 for `nomic-embed-text`, 1536 for `text-embedding-3-small`). Run `DROP TABLE chunks;` and re-upload your material — vectors cannot be converted between dimensions |
