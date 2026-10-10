"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, post } from "../../lib/api";
import { safeName, type ExportDoc } from "../../lib/export";
import ExportMenu from "../../components/ExportMenu";
import { createScriptPlayer, type ScriptLine, type ScriptPlayer } from "../../lib/speech";

type Doc = { id: number; title: string; source_type: string; chunks: number };
type PlanSection = { heading: string; goal: string };
type Outline = { title: string; blurb: string; sections: PlanSection[]; planned_minutes: number };
type Seg = { speaker: string; line: string };
type Section = { heading: string; goal: string; segments: Seg[] };
type Phase = "idle" | "planning" | "writing" | "ready" | "error";

const LENGTHS = [5, 15, 30, 45];
const SPEEDS = [1, 1.25, 1.5];
const WORDS_PER_MINUTE = 150;

/** Write several sections at once without firing every request at the provider. */
async function inWaves(count: number, limit: number, run: (i: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      await run(i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, count)) }, worker));
}

export default function Podcast() {
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [picked, setPicked] = useState<number[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [outline, setOutline] = useState<Outline | null>(null);
  const [sections, setSections] = useState<(Section | null)[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const [cursor, setCursor] = useState(-1);
  const [playState, setPlayState] = useState<"stopped" | "playing" | "paused">("stopped");
  const [speed, setSpeed] = useState(1);
  const playerRef = useRef<ScriptPlayer | null>(null);

  useEffect(() => { api<Doc[]>("/api/ingest").then(setDocs).catch(() => undefined); }, []);

  // Some browsers only populate the voice list after a tick.
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => window.speechSynthesis.getVoices();
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      playerRef.current?.stop();
    };
  }, []);

  const lines = useMemo<ScriptLine[]>(() => {
    const out: ScriptLine[] = [];
    for (const s of sections) {
      if (!s) continue;
      for (const g of s.segments) out.push({ text: g.line, host: g.speaker === "BEN" ? 1 : 0 });
    }
    return out;
  }, [sections]);

  const sectionStarts = useMemo(() => {
    const starts: number[] = [];
    let n = 0;
    for (const s of sections) {
      starts.push(n);
      n += s ? s.segments.length : 0;
    }
    return starts;
  }, [sections]);

  const words = useMemo(() => lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0), [lines]);
  const ready = sections.filter(Boolean).length;

  /**
   * The episode as one document. Memoised because playback updates `cursor` on
   * every line, and rebuilding a 4,500-line transcript on each of those renders
   * would be pure waste.
   */
  const exportDoc = useMemo<ExportDoc | null>(() => {
    if (!outline) return null;
    const written = sections.filter((s): s is Section => Boolean(s));
    const blocks: ExportDoc["blocks"] = [
      {
        kind: "meta",
        pairs: [
          ["Planned length", `${outline.planned_minutes} min`],
          ["Sections", `${written.length} of ${outline.sections.length}`],
          ["Lines", String(written.reduce((n, s) => n + s.segments.length, 0))],
          ["Hosts", "ADA & BEN"],
          ["Generated", new Date().toLocaleString()],
        ],
      },
    ];
    if (outline.blurb) blocks.push({ kind: "paragraph", text: outline.blurb });

    const rows: string[][] = [];
    written.forEach((s, i) => {
      blocks.push({ kind: "heading", text: `${i + 1}. ${s.heading}`, level: 2 });
      if (s.goal) blocks.push({ kind: "meta", pairs: [["Goal", s.goal]] });
      for (const g of s.segments) {
        blocks.push({ kind: "paragraph", label: g.speaker, text: g.line });
        rows.push([s.heading, g.speaker, g.line]);
      }
    });

    return {
      title: outline.title,
      filename: safeName(outline.title || "podcast-episode"),
      blocks,
      csv: { headers: ["section", "speaker", "line"], rows },
    };
  }, [outline, sections]);

  useEffect(() => {
    if (cursor < 0) return;
    document.getElementById(`line-${cursor}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursor]);

  const stop = () => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlayState("stopped");
    setCursor(-1);
  };

  const play = (from: number, rate = speed) => {
    if (!lines.length) return;
    playerRef.current?.stop();
    const player = createScriptPlayer(lines, {
      rate,
      onIndex: setCursor,
      onDone: () => { setPlayState("stopped"); setCursor(-1); },
    });
    if (!player) {
      setErr("This browser has no speech synthesis — read along below instead.");
      return;
    }
    playerRef.current = player;
    player.jump(Math.min(Math.max(from, 0), lines.length - 1));
    setPlayState("playing");
  };

  const toggle = () => {
    if (playState === "playing") { playerRef.current?.pause(); setPlayState("paused"); }
    else if (playState === "paused") { playerRef.current?.resume(); setPlayState("playing"); }
    else play(cursor >= 0 ? cursor : 0);
  };

  const changeSpeed = (next: number) => {
    setSpeed(next);
    if (playState !== "stopped") play(cursor >= 0 ? cursor : 0, next);
  };

  const generate = async () => {
    stop();
    setErr(""); setOutline(null); setSections([]); setCursor(-1); setProgress({ done: 0, total: 0 });
    setPhase("planning");
    const document_ids = picked.length ? picked : null;
    try {
      const plan = await post<Outline>("/api/podcast/outline", { topic, minutes, document_ids });
      setOutline(plan);
      const total = plan.sections.length;
      setSections(new Array(total).fill(null));
      setProgress({ done: 0, total });
      setPhase("writing");

      let done = 0;
      let failed = 0;
      await inWaves(total, 3, async (i) => {
        try {
          const section = await post<Section>("/api/podcast/section", {
            outline: plan, index: i, minutes, document_ids,
          });
          setSections((prev) => {
            const next = [...prev];
            next[i] = section;
            return next;
          });
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ done, total });
      });

      if (failed === total) {
        setErr("Every section failed. Check the model provider under System status on the home page.");
        setPhase("error");
      } else {
        setPhase("ready");
      }
    } catch (e) {
      setErr(String(e));
      setPhase("error");
    }
  };

  const currentSection = useMemo(() => {
    let found = -1;
    sectionStarts.forEach((start, i) => { if (cursor >= start) found = i; });
    return found;
  }, [cursor, sectionStarts]);

  const jumpToSection = (i: number) => {
    const start = sectionStarts[i];
    if (playState === "stopped") { setCursor(start); return; }
    play(start);
  };

  const busy = phase === "planning" || phase === "writing";
  const canGenerate = !busy && (topic.trim().length > 0 || docs.length > 0);

  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl font-bold">Study podcast</h1>
      <p className="mt-2 max-w-2xl text-stone-700">
        A planned, sectioned two-host episode built from your material. It writes the arc first,
        then each section against it — so a long episode still sounds like one episode.
      </p>

      <div className="mt-5 max-w-2xl rounded-xl border-2 border-ink bg-white p-5 shadow-[6px_6px_0_#16180f]">
        <label className="block font-display text-sm font-extrabold uppercase tracking-wide">
          Topic <span className="font-normal normal-case text-stone-500">(optional — leave blank to cover all your material)</span>
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canGenerate && generate()}
          placeholder="e.g. cell division and its phases"
          className="mt-1.5 w-full rounded-sm border border-stone-300 p-2.5 outline-none focus:bg-mist"
        />

        <p className="mt-4 font-display text-sm font-extrabold uppercase tracking-wide">Episode length</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {LENGTHS.map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              aria-pressed={minutes === m}
              className={`rounded-full px-4 py-1.5 font-display text-sm font-extrabold ${
                minutes === m ? "bg-volt text-ink" : "border-2 border-ink hover:bg-mist"
              }`}
            >
              ~{m} min
            </button>
          ))}
        </div>

        {docs.length > 0 && (
          <>
            <p className="mt-4 font-display text-sm font-extrabold uppercase tracking-wide">Ground it in</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {docs.map((d) => {
                const on = picked.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))}
                    aria-pressed={on}
                    className={`max-w-[16rem] truncate rounded-full px-3 py-1 text-sm ${
                      on ? "bg-ink text-volt" : "border border-stone-300 text-stone-700 hover:border-ink"
                    }`}
                  >
                    {d.title}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-sm text-stone-500">
              {picked.length ? `${picked.length} selected` : "Nothing selected — using all your material."}
            </p>
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={generate}
            disabled={!canGenerate}
            className="rounded-full bg-ink px-6 py-2.5 font-display font-extrabold text-white disabled:opacity-40"
          >
            {busy ? "Writing…" : outline ? "Regenerate episode" : "Generate episode"}
          </button>
          {outline && !busy && exportDoc && (
            <ExportMenu doc={exportDoc} label="Export episode" solid align="left" />
          )}
        </div>
        {!canGenerate && !busy && (
          <p className="mt-3 text-sm text-stone-600">
            Add a topic, or <a className="font-bold underline" href="/materials">upload some material</a> first.
          </p>
        )}
      </div>

      {busy && (
        <div className="mt-5 max-w-2xl rounded-xl border-2 border-ink bg-mist p-5">
          <p className="font-display font-extrabold">
            {phase === "planning"
              ? "Planning the episode arc…"
              : `Writing section ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white">
            <div
              className="h-full bg-ink transition-[width] duration-500"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 4}%` }}
            />
          </div>
          {outline && <p className="mt-2 text-sm text-stone-600">“{outline.title}” · {ready} of {progress.total} sections written</p>}
        </div>
      )}

      {err && (
        <p className="mt-5 max-w-2xl rounded-xl border-2 border-coral bg-white p-4 text-sm text-coral">{err}</p>
      )}

      {outline && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-black">{outline.title}</h2>
            {outline.blurb && <p className="mt-1 max-w-2xl text-stone-700">{outline.blurb}</p>}
            <p className="mt-2 text-sm text-stone-500">
              {ready} sections · {lines.length} lines · ~{Math.round(words / WORDS_PER_MINUTE)} min of speech
            </p>

            <div className="sticky top-20 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-ink bg-white p-3 shadow-[4px_4px_0_#16180f]">
              <button
                onClick={toggle}
                disabled={!lines.length}
                className="rounded-full bg-volt px-5 py-2 font-display font-extrabold text-ink disabled:opacity-40"
              >
                {playState === "playing" ? "❚❚ Pause" : "▶ Play"}
              </button>
              <button onClick={stop} disabled={playState === "stopped"} className="rounded-full border-2 border-ink px-4 py-2 font-display font-extrabold disabled:opacity-40">
                ■ Stop
              </button>
              <div className="flex items-center gap-1.5">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeSpeed(s)}
                    aria-pressed={speed === s}
                    className={`rounded-full px-3 py-1 text-sm font-bold ${speed === s ? "bg-ink text-volt" : "border border-stone-300 hover:border-ink"}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <span className="ml-auto text-sm text-stone-600">
                {cursor >= 0 ? `line ${cursor + 1} / ${lines.length}` : "two hosts: ADA & BEN"}
              </span>
            </div>

            <div className="scroll-slim mt-6 max-h-[65vh] overflow-y-auto pr-1">
              {sections.map((s, si) => (
                <section key={si} id={`section-${si}`} className="mb-8">
                  <header className={`mb-3 border-l-4 pl-3 ${currentSection === si ? "border-volt" : "border-stone-200"}`}>
                    <button onClick={() => jumpToSection(si)} className="text-left">
                      <span className="font-display text-lg font-extrabold">
                        {si + 1}. {outline.sections[si]?.heading ?? s?.heading ?? "Section"}
                      </span>
                    </button>
                    {outline.sections[si]?.goal && (
                      <p className="text-sm text-stone-600">{outline.sections[si].goal}</p>
                    )}
                  </header>
                  {!s ? (
                    <p className="pl-4 text-sm italic text-stone-500">writing…</p>
                  ) : (
                    s.segments.map((g, gi) => {
                      const idx = sectionStarts[si] + gi;
                      const active = idx === cursor;
                      return (
                        <p
                          key={gi}
                          id={`line-${idx}`}
                          onClick={() => { setCursor(idx); if (playState !== "stopped") play(idx); }}
                          className={`cursor-pointer rounded-sm px-2 py-1 text-[15px] leading-relaxed ${active ? "bg-volt" : "hover:bg-mist"}`}
                        >
                          <strong className={`mr-1.5 rounded-full px-2 py-0.5 text-xs font-black ${g.speaker === "ADA" ? "bg-ink text-volt" : "bg-coral text-white"}`}>
                            {g.speaker}
                          </strong>
                          {g.line}
                        </p>
                      );
                    })
                  )}
                </section>
              ))}
            </div>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-stone-500">Chapters</h3>
            <ol className="mt-2 divide-y divide-stone-200 border-y-2 border-ink">
              {outline.sections.map((p, i) => {
                const s = sections[i];
                const mins = s ? Math.max(1, Math.round(s.segments.reduce((n, g) => n + g.line.split(/\s+/).length, 0) / WORDS_PER_MINUTE)) : 0;
                return (
                  <li key={i}>
                    <button
                      onClick={() => jumpToSection(i)}
                      className={`flex w-full items-start gap-3 py-2.5 text-left ${currentSection === i ? "text-ink" : "text-stone-700"}`}
                    >
                      <span className={`font-display text-sm font-black ${currentSection === i ? "text-coral" : "text-stone-400"}`}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.heading}</span>
                        <span className="text-xs text-stone-500">
                          {s ? `${s.segments.length} lines · ~${mins} min` : "queued…"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-stone-500">
              Click any line or chapter to jump there. Playback uses your browser&apos;s built-in voices — free, no keys.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
