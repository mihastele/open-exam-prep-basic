# Architecture

```
┌──────────────┐   ┌───────────────────────────┐   ┌────────────────┐
│ Next.js UI   │──▶│ FastAPI (/api/...)        │──▶│ Postgres+      │
│ study        │◀──│ routers: thin, schema-    │◀──│ pgvector       │
│ workspace    │   │ validated, traced         │   │ docs+chunks,   │
└──────────────┘   │ services: llm / rag /     │   │ plans,progress │
                   │ parse / grade             │   └────────────────┘
                   └──────┬────────────┬───────┘
                          │            │
                   ┌──────▼───┐  ┌─────▼────────┐
                   │ Ollama   │  │ Hosted       │  (one switch:
                   │ (local)  │  │ OpenAI-compat│   MODEL_PROVIDER)
                   └──────┬───┘  └─────┬────────┘
                          └─────▶ Langfuse traces ◀─────┘
```

## Request flow (grounded tutor)

1. `POST /api/tutor/chat` receives `{message, level, document_ids?}`.
2. RAG retrieves top-k chunks from pgvector (or keyword fallback on SQLite).
3. `llm.chat()` builds the system prompt (level-adaptive, Socratic, cite
   sources) and calls the active provider; the call is wrapped in a Langfuse
   generation with the retrieved chunk ids attached.
4. The response returns `{answer, citations:[chunk_id], suggested_next}` so the
   UI can show exactly which material grounded the answer.

## Module map

| Area | Backend | Frontend |
|---|---|---|
| Ingest | `routers/ingest.py` + `services/parse.py` | `app/materials/` |
| Tutor | `routers/tutor.py` + `services/rag.py` | `app/tutor/` |
| Quiz / flashcards | `routers/practice.py` | `app/practice/` |
| Study plans | `routers/study_plan.py` | `app/plan/` |
| Mock + oral exams | `routers/exam.py` | `app/exam/` |
| Scan-a-question | `routers/solve.py` | `app/tutor/` (upload) |
| Podcast | `routers/podcast.py` | `app/podcast/` |
| Progress / mastery | `routers/progress.py` | `app/progress/` |
| Streaks / badges | `routers/gamification.py` | header widget |
| Puzzles / playground | `routers/games.py` | `app/playground/` |
| LLM switch | `services/llm.py` | settings badge |
| Tracing | `services/tracing.py` | — |

## Data model (essentials)

- `documents(id, title, source_type, created_at)` → `chunks(id, document_id,
  ord, text, embedding)` (pgvector; SQLite dev fallback stores text only).
- `study_plans(id, exam_date, topics[], state)` + `mastery(topic, level,
  updated_at)` updated from quiz/exam grades.
- `attempts(id, kind, items[], score, created_at)` for quizzes and mocks.
- `streaks(day, minutes)` + `badges(id, awarded_at)` for gamification.

## Why this shape

- Thin routers + shared services keep every LLM call traced and every answer
  cited the same way.
- The provider switch lives in exactly one module (`services/llm.py`), so
  adding a backend (e.g. llama.cpp, vLLM) is a ~20-line change.
- pgvector keeps retrieval SQL-simple; the SQLite fallback keeps `uv run`
  working with zero infrastructure for new contributors.
