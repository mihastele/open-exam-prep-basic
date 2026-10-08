"use client";

import { useEffect, useState } from "react";
import { post } from "../lib/api";
import { detectLang, t, type Lang } from "../lib/i18n";
import StatusLine from "../components/StatusLine";

const SUBJECTS = [
  "Biology", "Math", "Chemistry", "History", "Physics",
  "English", "Law", "Medicine", "Economics", "Slovenščina",
];

function QuickAsk() {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setA("");
    try {
      const r = await post<{ answer: string }>("/api/tutor/chat", { message: q, level: "secondary" });
      setA(r.answer.length > 420 ? r.answer.slice(0, 420) + "…" : r.answer);
    } catch (e) {
      setA(`Couldn't reach the AI (${e}). Is the backend running?`);
    }
    setBusy(false);
  };
  return (
    <div className="mt-6 max-w-md">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Why is the sky blue?"
          className="flex-1 rounded-full border-2 border-ink px-4 py-2 text-[15px] outline-none placeholder:text-stone-500 focus:bg-mist"
        />
        <button
          onClick={ask}
          disabled={busy}
          className="rounded-full bg-ink px-5 py-2 font-display font-extrabold text-white disabled:opacity-50"
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {a && (
        <div className="mt-3 rounded-xl bg-mist p-4 text-[15px] leading-relaxed">
          {a}{" "}
          <a href="/tutor" className="font-bold underline">
            Continue in Tutor →
          </a>
        </div>
      )}
    </div>
  );
}

function ChatMock() {
  return (
    <div>
      <div className="rounded-2xl border-2 border-ink bg-white p-4 shadow-[6px_6px_0_#16180f]">
        <div className="ml-10 rounded-2xl rounded-br-sm bg-ink p-3 text-[15px] text-white">
          Quiz me on mitosis — my test is Friday
        </div>
        <div className="mr-6 mt-3 rounded-2xl rounded-bl-sm bg-mist p-3 text-[15px]">
          Got it — pulled from <strong>your bio notes, ch. 4</strong>. Question 1: which phase pulls
          sister chromatids apart?
        </div>
        <div className="mt-3 flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-volt px-2.5 py-1">bio-notes.pdf</span>
          <span className="rounded-full bg-volt px-2.5 py-1">past-test-2024</span>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <div className="-rotate-2 rounded-xl bg-volt px-4 py-3 font-display font-black">
          Quiz 92%
          <div className="text-xs font-bold">mitosis · +mastery</div>
        </div>
        <div className="rotate-2 rounded-xl bg-coral px-4 py-3 font-display font-black text-white">
          6-day streak
          <div className="text-xs font-bold">keep it burning</div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const sync = () => setLang((localStorage.getItem("oep-lang") as Lang) || detectLang());
    sync();
    window.addEventListener("oep-lang", sync);
    return () => window.removeEventListener("oep-lang", sync);
  }, []);
  return (
    <div>
      <div className="grid items-start gap-10 pt-12 md:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="inline-block -rotate-2 rounded-full bg-volt px-4 py-1 font-display text-sm font-extrabold">
            {t(lang, "sticker")}
          </span>
          <h1 className="font-display mt-4 text-5xl font-black leading-[1.02] tracking-tight md:text-6xl">
            {t(lang, "heroA")}
            <br />
            <span className="bg-volt px-2">{t(lang, "heroB")}</span>
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-stone-700">{t(lang, "sub")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/materials"
              className="rounded-full bg-volt px-6 py-3 font-display font-extrabold text-ink hover:brightness-95"
            >
              {t(lang, "start")}
            </a>
            <a
              href="/tutor"
              className="rounded-full border-2 border-ink px-6 py-3 font-display font-extrabold hover:bg-mist"
            >
              {t(lang, "ask")}
            </a>
          </div>
          <p className="mt-8 font-display text-sm font-extrabold uppercase tracking-wide">{t(lang, "tryit")}</p>
          <QuickAsk />
        </div>
        <ChatMock />
      </div>

      <div className="mt-14 overflow-hidden rounded-xl bg-ink py-3">
        <div className="animate-ticker flex w-max gap-8 whitespace-nowrap pr-8 font-display text-lg font-extrabold text-volt">
          {[...SUBJECTS, ...SUBJECTS].map((s, i) => (
            <span key={i}>
              {s} <span className="ml-8 text-white/40">•</span>
            </span>
          ))}
        </div>
      </div>

      <h2 className="font-display mt-14 text-3xl font-black">Up and running in three moves</h2>
      <div className="mt-4 divide-y divide-stone-200 border-y-2 border-ink">
        {[
          ["1", "Drop in your material", "Lecture slides, notes, past tests, whiteboard photos. It reads them all."],
          ["2", "Get your plan", "Tell it the exam date. Weakest topics first, review the day before."],
          ["3", "Learn out loud", "Chat, quizzes, flashcards, timed mocks, oral rehearsal, podcasts."],
        ].map(([n, h, d]) => (
          <div key={n} className="flex items-center gap-4 py-4">
            <span className="font-display grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink text-2xl font-black text-volt">
              {n}
            </span>
            <div>
              <p className="font-display text-lg font-extrabold">{h}</p>
              <p className="text-[15px] text-stone-600">{d}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-display mt-14 text-3xl font-black">Everything included, nothing paywalled</h2>
      <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {[
          "Tutor that cites your actual files",
          "Quizzes + flashcards in seconds",
          "Timed mock exams with grading",
          "Oral exam rehearsal, graded",
          "Study podcasts from your notes",
          "Streaks, badges, mastery tracking",
          "Daily puzzles when your brain melts",
          "Private by default — runs on your machine",
        ].map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-[16px]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-volt text-xs font-black">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-14 grid gap-8 rounded-xl bg-mist p-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-extrabold">System status</h2>
          <div className="mt-2">
            <StatusLine />
          </div>
        </div>
        <div>
          <h2 className="font-display text-xl font-extrabold">Why open?</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-stone-700">
            Exam prep is too important to rent from a black box. Every prompt, grade, and trace here
            is inspectable — Langfuse shows exactly what the model saw.
          </p>
        </div>
      </div>
    </div>
  );
}
