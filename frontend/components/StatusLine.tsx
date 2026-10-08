"use client";

import { useEffect, useState } from "react";
import { get, type Health } from "../lib/api";

export default function StatusLine() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    get<Health>("/api/health").then(setH).catch((e) => setErr(String(e)));
  }, []);
  if (err)
    return (
      <p className="border-l-4 border-ochre bg-sand px-3 py-2 text-sm">
        Backend not reachable at :8000 — start it with <code>uv run uvicorn app.main:app --port 8000</code> in
        backend/.
      </p>
    );
  if (!h) return <p className="text-sm text-stone-600">Checking backend…</p>;
  return (
    <p className="text-sm text-stone-700">
      <span className={h.status === "ok" ? "font-semibold text-pine" : "font-semibold text-ochre"}>
        {h.status === "ok" ? "● ready" : "● degraded"}
      </span>{" "}
      · model {h.llm.provider}/{h.llm.model} {h.llm.reachable ? "(reachable)" : "(unreachable — quizzes & tutor need it)"}{" "}
      · tracing {h.tracing ? "on" : "off"}
    </p>
  );
}
