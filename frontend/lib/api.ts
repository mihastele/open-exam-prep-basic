/**
 * API base URL.
 *
 * - Unset in production  -> "" (same origin). What you want when the Next.js
 *   app and the FastAPI backend share a domain: one Vercel project using
 *   Vercel Services, or any reverse proxy.
 * - Set                  -> absolute backend URL, e.g. two separate Vercel
 *   projects (NEXT_PUBLIC_API_URL=https://oep-api.vercel.app).
 * - Unset in development -> the local FastAPI server on :8000.
 *
 * Only the base URL reaches the browser. The model provider's API key stays in
 * the backend's server-side env vars and is never sent to the client.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`${r.status}: ${detail.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

export const get = <T,>(path: string) => api<T>(path);

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export async function upload<T>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extra || {})) form.append(k, v);
  const r = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

export type Health = {
  status: "ok" | "degraded";
  db: boolean;
  /** What we are storing in, and whether it survives a restart. */
  datastore?: {
    kind: string;
    persistent: boolean;
    detail: string;
    /** True when a configured database was ignored because it was unusable. */
    fallback?: boolean;
    /** Why it was ignored (redacted — never a password). */
    reason?: string;
  };
  llm: {
    provider: string;
    model: string;
    reachable: boolean;
    /** HTTP status from the provider's /models probe, when it failed. */
    status_code?: number;
    /** Transport error detail, when the request never got a response. */
    detail?: string;
    /** False when the provider's model list does not contain llm.model. */
    model_listed?: boolean;
  };
  /** Why the database is unusable, when it is. Present only on failure. */
  db_error?: string;
  tracing: boolean;
  /** Whether traces will really be sent (keys present AND client loaded). */
  tracing_status?: { enabled: boolean; available: boolean; detail: string };
};
