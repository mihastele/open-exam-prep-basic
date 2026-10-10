"use client";

import { useEffect, useState } from "react";
import { get, API_BASE, type Health } from "../lib/api";

export default function StatusLine() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    get<Health>("/api/health").then(setH).catch((e) => setErr(String(e)));
  }, []);
  if (err)
    return (
      <p className="rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm">
        Backend not reachable at <code>{API_BASE || "this origin"}</code> — start it with{" "}
        <code>uv run uvicorn app.main:app --port 8000</code> in backend/.
      </p>
    );
  if (!h) return <p className="text-sm text-stone-600">Checking backend…</p>;
  const reason = !h.llm.reachable
    ? h.llm.status_code === 401 || h.llm.status_code === 403
      ? " — the API key was rejected"
      : h.llm.status_code === 404
        ? " — check the provider base URL"
        : h.llm.detail
          ? ` — ${h.llm.detail}`
          : ""
    : h.llm.model_listed === false
      ? " — but the provider does not list that model"
      : "";
  return (
    <>
      <p className="text-[15px] text-stone-700">
        <span className={`font-display font-extrabold ${h.status === "ok" ? "text-ink" : "text-coral"}`}>
          {h.status === "ok" ? "● ready" : "● degraded"}
        </span>{" "}
        · {h.llm.provider}/{h.llm.model} {h.llm.reachable ? "connected" : "unreachable — quizzes & tutor need it"}
        {reason} · tracing {h.tracing ? "on" : "off"}
      </p>
      {h.db_error && (
        <p className="mt-2 rounded-sm border border-coral bg-white px-2.5 py-1.5 text-sm text-coral">
          <strong>Database:</strong> {h.db_error}
        </p>
      )}
    </>
  );
}
