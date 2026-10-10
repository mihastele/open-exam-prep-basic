"use client";

import { useEffect, useState } from "react";
import { api, getSession, upload, type Doc, type SessionInfo } from "../../lib/api";
import {
  Button,
  Callout,
  Card,
  Dropzone,
  EmptyState,
  PageHeader,
  TrashIcon,
  UploadIcon,
} from "../../components/ui";

/** A small type badge so a long file list is skimmable. */
function kindOf(title: string) {
  const ext = (title.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return { label: "PDF", tone: "bg-coral text-white" };
  if (ext === "pptx" || ext === "ppt") return { label: "PPT", tone: "bg-ink text-volt" };
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return { label: "IMG", tone: "bg-volt text-ink" };
  if (["md", "markdown"].includes(ext)) return { label: "MD", tone: "bg-mist text-ink" };
  return { label: "TXT", tone: "bg-mist text-ink" };
}

/**
 * "in 5 days" for a server timestamp.
 *
 * The server sends an explicit UTC offset, so this cannot drift by the viewer's
 * timezone — which is why the API returns "2026-10-17T21:30:00+00:00" and not a
 * bare "2026-10-17T21:30:00".
 */
function expiresIn(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 0) return "any moment now";
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

export default function Materials() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = () => {
    // The session rides along as a cookie, so this call is also what mints it on a
    // first visit. Non-fatal if it fails: the list below is the important part.
    getSession()
      .then(setSession)
      .catch(() => setSession(null));
    return api<Doc[]>("/api/ingest")
      .then((d) => {
        setDocs(d);
        setLoaded(true);
      })
      .catch((e) => {
        setErr(String(e));
        setLoaded(true);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  const onFile = async (f: File) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const d = await upload<Doc>("/api/ingest", f);
      setMsg(
        d.embedded === false
          ? `Indexed “${d.title}” — ${d.chunks} chunk${d.chunks === 1 ? "" : "s"}, but without vectors, so the tutor will search it by keyword. Check your embedding model.`
          : `Indexed “${d.title}” — ${d.chunks} chunk${d.chunks === 1 ? "" : "s"} ready to cite.`,
      );
      refresh();
    } catch (e) {
      const raw = String(e);
      // A 501 means this host cannot read images (no tesseract binary). The server
      // explains that precisely — including that the Docker image does include it — so
      // show its words instead of guessing at them.
      setErr(raw.includes("501") ? raw.replace(/^501:\s*/, "") : raw);
    }
    setBusy(false);
  };

  const del = async (id: number) => {
    await api(`/api/ingest/${id}`, { method: "DELETE" });
    refresh();
  };

  const chunks = docs.reduce((n, d) => n + d.chunks, 0);

  return (
    <div className="pt-8">
      <PageHeader title="Study materials">
        PDF, PPTX, images, text or Markdown. Everything is chunked and embedded so the tutor can quote it back to
        you — and it stays yours: this library belongs to this browser, not to everyone using the deployment.
      </PageHeader>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <Dropzone
            onFile={onFile}
            busy={busy}
            busyLabel="Reading and indexing…"
            title="Drop your notes here"
            hint="PDF · PPTX · TXT · Markdown · PNG/JPG — or click to browse"
            accept=".pdf,.pptx,.txt,.md,.markdown,image/*"
            icon={<UploadIcon />}
          />

          <div className="mt-4 space-y-2">
            {msg && (
              <Callout tone="info" onDismiss={() => setMsg("")}>
                {msg}
              </Callout>
            )}
            {err && (
              <Callout tone="error" onDismiss={() => setErr("")}>
                {err}
              </Callout>
            )}
          </div>

          <h2 className="mt-8 font-display text-lg font-extrabold">
            Your library{" "}
            <span className="text-sm font-semibold text-stone-500">
              {docs.length} file{docs.length === 1 ? "" : "s"} · {chunks} chunk{chunks === 1 ? "" : "s"}
            </span>
          </h2>

          {docs.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon={<UploadIcon />} title={loaded ? "Nothing here yet" : "Loading your library…"}>
                {loaded
                  ? "Upload a lecture deck, a past paper, or your own notes. The tutor, quizzes, plans and podcasts all draw from whatever is in here."
                  : undefined}
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {docs.map((d) => {
                const k = kindOf(d.title);
                return (
                  <li key={d.id}>
                    <Card className="flex items-center gap-3 p-3.5">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-ink font-display text-[11px] font-black ${k.tone}`}
                      >
                        {k.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{d.title}</span>
                        <span className="text-xs text-stone-500">
                          {d.chunks} chunk{d.chunks === 1 ? "" : "s"} · {d.source_type}
                          {expiresIn(d.expires_at) ? ` · deleted ${expiresIn(d.expires_at)}` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => del(d.id)}
                        aria-label={`Delete ${d.title}`}
                        title="Delete"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink/20 text-stone-500 transition hover:border-coral hover:text-coral"
                      >
                        <TrashIcon />
                      </button>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="space-y-4">
          {session && (
            <Card soft className="p-4">
              <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-stone-500">
                Your session
              </h2>
              <p className="mt-2.5 text-sm text-stone-700">
                <strong>Private to this browser</strong>
                <span className="ml-1 font-mono text-xs text-stone-500">#{session.fingerprint}</span>. Nobody else
                using this deployment can list, cite or delete these files.
              </p>
              <p className="mt-2 text-sm text-stone-700">
                {session.retention_days > 0 ? (
                  <>
                    Deleted automatically <strong>{session.retention_days} days</strong> after upload
                    {session.next_expiry ? ` — the next one goes ${expiresIn(session.next_expiry)}` : ""}. Delete
                    anything sooner and it goes immediately.
                  </>
                ) : (
                  <>Retention is switched off, so files stay until you delete them.</>
                )}
              </p>
            </Card>
          )}
          <Card soft className="p-4">
            <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-stone-500">
              What works best
            </h2>
            <ul className="mt-2.5 space-y-2 text-sm text-stone-700">
              <li>Lecture slides and past papers give the sharpest quizzes.</li>
              <li>Text you typed yourself beats a photo of handwriting.</li>
              <li>One file per topic makes citations easier to follow.</li>
            </ul>
          </Card>
          <Card soft className="p-4">
            <h2 className="font-display text-sm font-extrabold uppercase tracking-wide text-stone-500">Next</h2>
            <div className="mt-2.5 flex flex-col gap-2">
              <a href="/tutor">
                <Button variant="outline" size="sm" full>
                  Ask the tutor
                </Button>
              </a>
              <a href="/podcast">
                <Button variant="outline" size="sm" full>
                  Make a podcast
                </Button>
              </a>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
