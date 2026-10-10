# Self-hosting with Docker Compose

One command, one port, no accounts:

```bash
cp .env.example .env      # optional — every value has a working default
docker compose up --build
```

Then open **<http://localhost:8080>**. Change the port with `APP_PORT` in `.env`.

## What this stack is

It deliberately mirrors the Vercel deployment, so a problem you debug here is a problem
you understand there:

| | Vercel | This stack |
|---|---|---|
| Public entry point | one domain | one port (`APP_PORT`), Caddy |
| Routing | `vercel.json` rewrites | `deploy/Caddyfile` — the same two rules |
| `/api/*` | FastAPI service | FastAPI container, prefix **not** stripped |
| everything else | Next.js service | Next.js container |
| Model key | backend env var | backend env var — never reaches the browser |
| Database | Neon/Supabase | `pgvector/pgvector:pg16` in a volume |

Three things differ, and all three are reasons to run it yourself:

1. **Images work.** The backend image installs `tesseract`, so uploaded images and the
   scan-a-question feature are actually readable. A serverless host has no system
   binaries, which is why that path returns 501 there.
2. **Material persists.** A real Postgres in a named volume, instead of SQLite inside one
   short-lived instance.
3. **Sessions own their uploads.** See below.

## Sessions, privacy and retention

There are no accounts. On first contact the backend mints a random token and sets it as
an `HttpOnly` cookie; every document records that token as its owner.

- **Only you can see your library.** Listing, deleting, and the tutor's retrieval are all
  filtered by owner, so another visitor gets an empty library — and cannot fetch, cite or
  delete your files even by guessing a document id (that returns 404, not 403: confirming
  a document exists is itself a small leak).
- **Material expires by itself.** Documents are deleted `DOC_RETENTION_DAYS` (default 7)
  after upload — the row, its chunks, its embeddings, and the stored original file.
  Delete something yourself and it goes immediately. `0` switches expiry off.
  - On Compose a background timer sweeps every `RETENTION_SWEEP_MINUTES`.
  - On serverless there is no process to own a timer, so the same sweep also runs inside
    each session's own requests. Both shapes expire correctly.
- **The UI says all of this.** The Materials page shows your session fingerprint, the
  retention window, when the next deletion happens, and a countdown per file.

Two things to be clear about:

- **A session is a browser, not a person.** Clearing cookies, or using a private window,
  is a new session with an empty library — and the old one's material still exists until
  it expires. It is isolation between visitors, not authentication.
- **Uploads are isolated; progress is not.** Quiz attempts, study plans, mastery and
  badges are still shared across sessions. If you are putting this in front of a class,
  know that before you do.

## The variables that matter here

Everything has a working default, so this is only if you want to change something. The
full annotated list is in `.env.example`.

| Variable | Why you would set it |
|---|---|
| `APP_PORT` | The port the whole app is served on. Default `8080`. |
| `HOSTED_API_KEY` | The Vercel AI Gateway key. **Without one, generation 503s** — the stack defaults to the gateway because a container cannot reach a local Ollama on your host. |
| `MODEL_PROVIDER` | Compose defaults this to `hosted`. Set `ollama` **and** `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1` to use an Ollama running on the host instead. |
| `DOC_RETENTION_DAYS` | How long uploads survive. `0` = keep until deleted by hand. |
| `RETENTION_SWEEP_MINUTES` | How often the background sweep looks. |
| `SESSION_COOKIE_SECURE` | Leave `false` for plain HTTP. Set `true` once HTTPS is in front, or browsers will refuse to send the cookie. |
| `POSTGRES_PASSWORD` | Nothing outside the compose network can reach the database, but change it if this machine is on a network you do not trust. |

## Data, backups, resets

Two named volumes:

- `pgdata` — Postgres. **This is your material**: parsed text, chunks, embeddings, plans,
  attempts, mastery.
- `uploads` — convenience copies of the original files. Losing it loses no material.

```bash
docker compose exec -T db pg_dump -U oep oep > backup.sql     # back up
docker compose down                                            # stop, keep everything
docker compose down -v                                         # stop and delete EVERYTHING
```

Uploads inside the container live in `/app/uploads`. The backend also writes nothing else
to disk, so a mounted volume for that path is all the persistence it needs.

## Operating it

```bash
docker compose ps                       # what is running and healthy
docker compose logs -f backend         # application logs, including retention deletions
curl localhost:8080/api/health         # status, provider, datastore, retention policy
docker compose up -d --build backend   # rebuild just the API after a code change
```

`/api/health` is the first place to look for anything: it reports the database it is
actually using (`datastore`), which model endpoint requests really go to (`llm.base_url`),
whether tracing is on, and the retention window.

**Upgrading an existing volume.** `create_all` only creates missing tables, so a database
made by an older version would be missing columns added since. `init_db()` therefore
checks for them and adds what is absent — verified by dropping `owner_id` from a live
volume, restarting, and watching it and its index come back.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Generation 503s, health says `llm.reachable: false` | no gateway key. Set `HOSTED_API_KEY` (or `AI_GATEWAY_API_KEY`) in `.env`, then `docker compose up -d backend`. |
| Health says provider is `ollama` and is unreachable | `MODEL_PROVIDER=ollama` without a reachable host Ollama. From inside the container, `localhost` is the container — use `http://host.docker.internal:11434/v1`. |
| Image upload returns 501 | the backend is not the built image (tesseract missing). Rebuild: `docker compose build backend`. |
| "Nothing is being saved" style banner | `DATABASE_URL` inside the container is wrong, or the database was unreachable at boot. `docker compose logs backend` says which. |
| Uploads vanish, health says `fallback: true` | the configured database could not be used and the app fell back to SQLite. Check `docker compose logs backend` and the `datastore.reason` field. |
| Every visitor seems to be the same person | something is stripping cookies, or `SESSION_COOKIE_SECURE=true` while serving plain HTTP. |
| Port already in use | change `APP_PORT`. |
| `relation "documents" does not exist` | the backend came up before Postgres finished initialising. It waits on a healthcheck, so this should not happen; `docker compose restart backend` if it does. |

## What this is not

There is no user account, no password, and no HTTPS. Sessions keep honest visitors out of
each other's uploads; they are not a security boundary against anyone determined, and
everything is sent in the clear. Put it behind a reverse proxy with a certificate, and
set `SESSION_COOKIE_SECURE=true`, before it faces the internet.
