# Parity map: commercial AI tutor → openExamPrep

Source: the vendor's `/sl/` landing page (Oct 2026): notes/slides/past-papers
→ personal plan; guided lessons, quizzes, flashcards, podcasts; timed mock
tests and graded oral exams; scan-a-question solver; streaks/badges; 3D sims;
mind games; progress numbers; level+pace adaptation; "learns from your material".

| Vendor claim | openExamPrep | Status |
|---|---|---|
| Upload notes/slides/old tests/photos | `POST /api/ingest` (PDF/PPTX/TXT/IMG) | ✅ shipped |
| Topic-by-topic plan to exam date | `POST /api/plan` + `app/plan` | ✅ shipped |
| Guided lessons, quizzes, flashcards | `routers/practice.py` + tutor | ✅ shipped |
| Auto-generated podcast | `POST /api/podcast/script` + browser TTS | ✅ shipped (MVP voice) |
| Timed mock test, graded | `POST /api/exam/mock` + grading | ✅ shipped |
| Realistic oral exam, graded | `POST /api/exam/oral/next` + speech I/O | ✅ shipped (browser speech) |
| Ask anything, step-by-step, at your level | `POST /api/tutor/chat` + RAG citations | ✅ shipped |
| Scan a task, guided solution | `POST /api/solve/photo` | ✅ shipped (OCR hook) |
| Streaks, badges, wins | `routers/gamification.py` | ✅ shipped |
| Progress in numbers, mastery | `routers/progress.py` | ✅ shipped |
| Adapts to level and pace | level param + mastery-weighted plans | ✅ shipped |
| Interactive 3D sims, visual models | `app/playground/` plugin slot + 1 example | 🟡 plugin + example |
| Mind games, daily challenges | `routers/games.py` | ✅ shipped |
| 40 locales | `lib/i18n.ts` EN+SL, contributed locales | 🟡 scaffold |
| "+2 grades or money back" | Free forever; track it yourself in Progress | ✅ free beats refund |
| Private data, deletable | Local-first; `DELETE /api/ingest/{id}` | ✅ shipped |

Legend: ✅ working end-to-end · 🟡 scaffolded, needs contributors.
