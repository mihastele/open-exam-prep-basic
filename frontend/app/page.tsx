"use client";

import { useEffect, useState } from "react";
import { detectLang, t, type Lang } from "../lib/i18n";
import StatusLine from "../components/StatusLine";

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const sync = () => setLang((localStorage.getItem("oep-lang") as Lang) || detectLang());
    sync();
    window.addEventListener("oep-lang", sync);
    return () => window.removeEventListener("oep-lang", sync);
  }, []);
  return (
    <div className="grid gap-10 pt-10 md:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="text-lg text-stone-700">{t(lang, "tagline")}</p>
        <h1 className="font-display mt-3 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          {t(lang, "hero")}
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-stone-800">
          Upload lecture notes, slides, or past papers. openExamPrep turns them into a day-by-day
          plan, a tutor that cites your material, quizzes, flashcards, timed mocks, oral-exam
          rehearsal, and podcasts. Free and open source — local-first, so your notes never have
          to leave your machine.
        </p>
        <div className="mt-6 flex gap-3">
          <a
            href="/materials"
            className="rounded-sm bg-pine px-5 py-2.5 font-semibold text-white hover:bg-pine-dark"
          >
            {t(lang, "start")}
          </a>
          <a
            href="/tutor"
            className="rounded-sm border border-ink px-5 py-2.5 font-semibold hover:bg-sand"
          >
            Ask the tutor
          </a>
        </div>
        <ol className="mt-10 space-y-4 border-t border-stone-200 pt-6">
          {[
            ["01 · Feed it your material", "PDFs, slides, text, photos of the whiteboard."],
            ["02 · Get a plan to exam day", "Topic by topic, weakest areas first, review at the end."],
            ["03 · Learn actively", "Tutor chat, quizzes, flashcards, podcasts — all from your files."],
            ["04 · Rehearse for real", "Timed mocks and graded oral exams, then watch mastery climb."],
          ].map(([h, d]) => (
            <li key={h} className="grid grid-cols-[220px_1fr] gap-3 text-[15px]">
              <span className="font-semibold">{h}</span>
              <span className="text-stone-700">{d}</span>
            </li>
          ))}
        </ol>
      </div>
      <aside className="space-y-6 md:pt-2">
        <section className="border border-stone-200 bg-sand p-4">
          <h2 className="font-display text-lg font-bold">System status</h2>
          <div className="mt-2">
            <StatusLine />
          </div>
        </section>
        <section className="border border-stone-200 p-4">
          <h2 className="font-display text-lg font-bold">Today</h2>
          <p className="mt-2 text-[15px] text-stone-700">
            New here? The loop is: <a className="underline" href="/materials">materials</a> →{" "}
            <a className="underline" href="/plan">plan</a> →{" "}
            <a className="underline" href="/practice">practice</a> →{" "}
            <a className="underline" href="/exam">mock</a>. Take a break in the{" "}
            <a className="underline" href="/playground">playground</a> when your brain melts.
          </p>
        </section>
        <section className="border border-stone-200 p-4">
          <h2 className="font-display text-lg font-bold">Why open?</h2>
          <p className="mt-2 text-[15px] text-stone-700">
            Exam prep is too important to rent from a black box. Every prompt, grade, and trace
            here is inspectable — and Langfuse shows exactly what the model saw.
          </p>
        </section>
      </aside>
    </div>
  );
}
