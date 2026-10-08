# Contributing to openExamPrep

Thanks for helping build free exam prep for everyone.

## Ground rules

- Keep PRs small and focused; one feature or fix per PR.
- New API behavior needs a backend test (`backend/tests/`).
- Never commit secrets, `.env` files, or uploaded study material.
- User material is private by design: don't add telemetry, and keep the
  Ollama-local default path working offline (except model pulls).
- Match the existing API shape (`/api/...`, Pydantic schemas) and reuse the
  shared LLM/RAG helpers instead of calling providers directly.

## Dev setup

```bash
cd backend && uv venv && uv sync && uv run pytest
cd ../frontend && npm install && npm run build
```

## Good first contributions

- New ingest parsers (DOCX, EPUB, LaTeX, handwriting OCR).
- New locales in `frontend/lib/i18n.ts` (SLO + EN ship; 40 more welcome).
- Interactive explainers (`frontend/app/playground/`, any subject).
- Eval prompts + datasets wired to Langfuse scores.

## Code of conduct

Be kind, assume good faith, and remember the users are students.
