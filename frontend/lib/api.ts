const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
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
  const r = await fetch(`${API}${path}`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

export type Health = {
  status: "ok" | "degraded";
  db: boolean;
  llm: { provider: string; model: string; reachable: boolean };
  tracing: boolean;
};
