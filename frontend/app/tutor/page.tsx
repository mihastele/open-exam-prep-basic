"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, post, upload } from "../../lib/api";
import { safeName, type ExportDoc } from "../../lib/export";
import ExportMenu from "../../components/ExportMenu";
import {
  ArrowUpIcon,
  BookIcon,
  Button,
  Callout,
  CapIcon,
  Card,
  Chip,
  Dropzone,
  EmptyState,
  PageHeader,
  ScanIcon,
  SectionTitle,
  Segmented,
  SparkIcon,
  SproutIcon,
  Spinner,
  type SegmentOption,
} from "../../components/ui";

type Cite = { chunk_id: number; document_id: number; excerpt: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  citations?: Cite[];
  degraded?: boolean;
  photo?: boolean;
  failed?: boolean;
};
type Doc = { id: number; title: string; chunks: number };
type Level = "elementary" | "secondary" | "university";

const LEVELS: SegmentOption<Level>[] = [
  {
    value: "elementary",
    label: "Elementary",
    hint: "Plain words, everyday examples",
    icon: <SproutIcon className="h-5 w-5" />,
  },
  {
    value: "secondary",
    label: "Secondary",
    hint: "Proper terms, defined once",
    icon: <BookIcon className="h-5 w-5" />,
  },
  {
    value: "university",
    label: "University",
    hint: "Precise, method, derivations",
    icon: <CapIcon className="h-5 w-5" />,
  },
];

const STARTERS = [
  "Explain photosynthesis like I'm new to it",
  "Quiz me on this topic, one question at a time",
  "Why does this formula work — not just what it is?",
];

export default function Tutor() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [level, setLevel] = useState<Level>("secondary");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState("");

  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<Doc[]>("/api/ingest").then(setDocs).catch(() => undefined);
  }, []);

  // Follow the conversation as it grows, but never scroll the page on load.
  useEffect(() => {
    if (msgs.length) bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs, busy]);

  // Grow the composer with the draft instead of clipping it.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const lastCitations = useMemo(
    () => [...msgs].reverse().find((m) => m.role === "assistant" && m.citations?.length)?.citations ?? [],
    [msgs],
  );

  /** Anything the tutor produced can leave the app: question, answer, provenance. */
  function tutorDoc(m: Msg, previous: Msg | undefined, index: number): ExportDoc {
    const question = previous?.role === "user" ? previous.content : "";
    const pairs: [string, string][] = [["Level", level]];
    if (question) pairs.push(["Asked", new Date().toLocaleString()]);
    pairs.push([
      "Sources",
      m.citations?.length
        ? m.citations.map((c) => `doc ${c.document_id} · chunk ${c.chunk_id}`).join(", ")
        : "general knowledge, no material quoted",
    ]);
    if (m.degraded) pairs.push(["Note", "answered from keyword search — embeddings were unavailable"]);

    return {
      title: question ? question.slice(0, 70) : `Tutor answer ${Math.floor(index / 2) + 1}`,
      filename: `tutor-${safeName(question.slice(0, 40) || `answer-${index + 1}`)}`,
      blocks: [
        { kind: "meta", pairs },
        ...(question
          ? ([
              { kind: "heading", text: "Question", level: 3 },
              { kind: "paragraph", text: question },
            ] as ExportDoc["blocks"])
          : []),
        { kind: "heading", text: "Answer", level: 3 },
        { kind: "paragraph", text: m.content },
      ],
    };
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = [...msgs, { role: "user" as const, content: question }];
    setMsgs(history);
    setInput("");
    setNotice("");
    setBusy(true);
    try {
      const r = await post<{ answer: string; citations: Cite[]; degraded: boolean }>("/api/tutor/chat", {
        message: question,
        level,
        document_ids: picked.length ? picked : null,
        history: history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
      });
      setMsgs([...history, { role: "assistant", content: r.answer, citations: r.citations, degraded: r.degraded }]);
    } catch (e) {
      setMsgs([...history, { role: "assistant", content: String(e), failed: true }]);
    }
    setBusy(false);
  }

  async function scan(file: File) {
    setScanning(true);
    setNotice("");
    try {
      const r = await upload<{ detected_text: string; guidance: string }>(
        `/api/solve/photo?level=${level}`,
        file,
      );
      setMsgs((prev) => [
        ...prev,
        { role: "user", content: r.detected_text, photo: true },
        { role: "assistant", content: r.guidance },
      ]);
      setScanOpen(false);
    } catch (e) {
      // OCR needs the system tesseract binary, which serverless hosts do not
      // have — say that plainly rather than showing a raw 501.
      const raw = String(e);
      setNotice(
        raw.includes("501")
          ? "Reading photos needs the tesseract binary, which this host does not have. Type the question instead — or run the app locally."
          : raw,
      );
    }
    setScanning(false);
  }

  const reset = () => {
    setMsgs([]);
    setNotice("");
    field.current?.focus();
  };

  return (
    <div className="pt-8">
      <PageHeader title="Tutor" right={msgs.length > 0 ? <Button variant="outline" size="sm" onClick={reset}>New chat</Button> : undefined}>
        Step-by-step, level-adaptive, and grounded in your material first — general knowledge second, and it always
        says which.
      </PageHeader>

      <div className="mt-5">
        <SectionTitle hint="answers are pitched to this">Explaining at</SectionTitle>
        <div className="mt-2">
          <Segmented
            name="Explanation level"
            options={LEVELS}
            value={level}
            onChange={setLevel}
            size="sm"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          {msgs.length === 0 && !busy ? (
            <EmptyState
              icon={<SparkIcon />}
              title="Ask anything"
              action={
                <div className="flex flex-col items-center gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-semibold hover:bg-volt"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              }
            >
              {docs.length
                ? `${docs.length} document${docs.length === 1 ? "" : "s"} ready to quote. Pick specific ones on the right, or leave it to all of them.`
                : "No material yet — the tutor will teach from general knowledge and label it as such. Upload notes under Materials to get cited answers."}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[88%] rounded-2xl rounded-br-sm border-2 border-ink bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-white sm:max-w-[75%]">
                      {m.photo && (
                        <span className="mb-1.5 flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-volt">
                          <ScanIcon className="h-3.5 w-3.5" /> scanned
                        </span>
                      )}
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-ink bg-volt font-display text-xs font-black text-ink">
                      T
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`rounded-2xl rounded-bl-sm border-2 px-4 py-3 text-[15px] leading-relaxed shadow-[3px_3px_0_#16180f] ${
                          m.failed ? "border-coral bg-white text-coral" : "border-ink bg-white"
                        }`}
                      >
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      </div>
                      {m.degraded && (
                        <p className="mt-2 text-xs text-stone-500">
                          Answered from keyword search — embeddings are unavailable, so citations may be rougher.
                        </p>
                      )}
                      {!m.failed && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <ExportMenu doc={tutorDoc(m, msgs[i - 1], i)} label="Export" />
                          {m.citations?.map((c) => (
                            <span
                              key={c.chunk_id}
                              title={c.excerpt}
                              className="rounded-full border border-ink/20 bg-mist px-2.5 py-1 text-xs font-semibold text-stone-700"
                            >
                              doc {c.document_id} · chunk {c.chunk_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
              {busy && (
                <div className="flex items-center gap-2.5 text-sm text-stone-600">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-volt">
                    <Spinner className="h-4 w-4 text-ink" />
                  </span>
                  thinking it through…
                </div>
              )}
            </div>
          )}

          <div ref={bottom} />

          {scanOpen && (
            <div className="mt-5">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <SectionTitle hint="photo, screenshot or PDF">Scan a question</SectionTitle>
                  <button type="button" onClick={() => setScanOpen(false)} className="text-sm font-semibold text-stone-500 underline">
                    close
                  </button>
                </div>
                <div className="mt-3">
                  <Dropzone
                    onFile={scan}
                    busy={scanning}
                    busyLabel="Reading your question…"
                    title="Drop a photo of the problem"
                    hint="or click to browse · PNG, JPG, PDF"
                    accept="image/*,.pdf"
                    icon={<ScanIcon />}
                    compact
                  />
                </div>
              </Card>
            </div>
          )}

          {notice && (
            <div className="mt-4">
              <Callout tone="warn" onDismiss={() => setNotice("")}>
                {notice}
              </Callout>
            </div>
          )}

          {/* Composer: sticky, so it stays reachable under a long answer. */}
          <div className="sticky bottom-0 z-30 -mx-5 mt-6 border-t-2 border-ink bg-white/95 px-5 py-3 backdrop-blur">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setScanOpen((v) => !v)}
                aria-pressed={scanOpen}
                aria-label="Scan a question from a photo"
                title="Scan a question"
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink transition ${
                  scanOpen ? "bg-volt" : "bg-white hover:bg-mist"
                }`}
              >
                <ScanIcon />
              </button>
              <textarea
                ref={field}
                value={input}
                rows={1}
                aria-label="Ask the tutor"
                placeholder="Ask anything — e.g. why does mitosis matter?"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                className="max-h-52 min-h-12 flex-1 resize-none rounded-2xl border-2 border-ink/25 bg-white px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-stone-400 focus:border-ink focus:bg-mist"
              />
              <button
                type="button"
                onClick={() => ask(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-volt text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Spinner className="h-5 w-5" /> : <ArrowUpIcon />}
              </button>
            </div>
            <p className="mt-2 hidden text-xs text-stone-500 sm:block">
              Enter sends · Shift+Enter starts a new line
            </p>
          </div>
        </div>

        <aside className="space-y-5">
          <Card soft className="p-4">
            <SectionTitle hint={picked.length ? `${picked.length} picked` : "all"}>Ground it in</SectionTitle>
            {docs.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {docs.map((d) => (
                  <Chip
                    key={d.id}
                    active={picked.includes(d.id)}
                    title={`${d.title} · ${d.chunks} chunks`}
                    onClick={() =>
                      setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]))
                    }
                  >
                    {d.title}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-stone-600">
                Nothing uploaded yet — <a className="font-bold underline" href="/materials">add your notes</a> to get
                cited answers.
              </p>
            )}
          </Card>

          <Card soft className="p-4">
            <SectionTitle>Sources</SectionTitle>
            {lastCitations.length ? (
              <ul className="mt-2.5 space-y-2">
                {lastCitations.map((c) => (
                  <li key={c.chunk_id} className="rounded-lg border-2 border-ink/15 bg-white p-2.5">
                    <p className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-500">
                      doc {c.document_id} · chunk {c.chunk_id}
                    </p>
                    <p className="mt-1 text-sm text-stone-700">{c.excerpt}…</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-stone-600">The chunks behind the last answer show up here.</p>
            )}
          </Card>

          <Card soft className="p-4">
            <SectionTitle hint="free, no keys">Read it aloud</SectionTitle>
            <p className="mt-2 text-sm text-stone-600">
              Turn any answer into a two-host episode with chapters under{" "}
              <a className="font-bold underline" href="/podcast">Podcast</a>.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
