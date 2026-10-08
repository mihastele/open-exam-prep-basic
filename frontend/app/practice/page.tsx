"use client";

import { useState } from "react";
import { post } from "../../lib/api";

type Item = { question: string; options: string[]; answer_index: number; explanation: string };

export default function Practice() {
  const [topic, setTopic] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [attempt, setAttempt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; correct: boolean[] } | null>(null);
  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [flip, setFlip] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const quiz = async () => {
    setMsg("Generating quiz…");
    setResult(null);
    try {
      const r = await post<{ attempt_id: number; items: Item[] }>("/api/practice/quiz", { topic, n: 5 });
      setItems(r.items); setAttempt(r.attempt_id);
      setAnswers(new Array(r.items.length).fill(-1));
      setMsg("");
    } catch (e) { setMsg(String(e)); }
  };
  const grade = async () => {
    if (attempt == null) return;
    const r = await post<{ score: number; correct: boolean[] }>("/api/practice/quiz/grade", { attempt_id: attempt, answers });
    setResult(r);
  };
  const flashcards = async () => {
    setMsg("Generating flashcards…");
    try {
      const r = await post<{ cards: { front: string; back: string }[] }>("/api/practice/flashcards", { topic, n: 8 });
      setCards(r.cards); setMsg("");
    } catch (e) { setMsg(String(e)); }
  };

  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl font-bold">Practice</h1>
      <div className="mt-3 flex gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. quadratic equations"
          className="max-w-sm flex-1 rounded-sm border border-stone-300 p-2" />
        <button onClick={quiz} className="rounded-sm bg-pine px-4 font-semibold text-white">Quiz me</button>
        <button onClick={flashcards} className="rounded-sm border border-ink px-4 font-semibold">Flashcards</button>
      </div>
      {msg && <p className="mt-3 text-sm">{msg}</p>}

      {items.length > 0 && (
        <section className="mt-6 space-y-4">
          {items.map((it, i) => (
            <div key={i} className="border border-stone-200 p-3">
              <p className="font-semibold">{i + 1}. {it.question}</p>
              <div className="mt-2 grid gap-1">
                {it.options.map((o, j) => (
                  <label key={j} className={`cursor-pointer rounded-sm px-2 py-1 text-[15px] ${answers[i] === j ? "bg-sand font-semibold" : "hover:bg-sand"} ${result ? (j === it.answer_index ? "outline outline-2 outline-pine" : answers[i] === j ? "outline outline-2 outline-red-700" : "") : ""}`}>
                    <input type="radio" name={`q${i}`} className="mr-2" checked={answers[i] === j}
                      onChange={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))} />{o}
                  </label>
                ))}
              </div>
              {result && <p className="mt-2 text-sm text-stone-700">{it.explanation}</p>}
            </div>
          ))}
          {!result ? (
            <button onClick={grade} className="rounded-sm bg-ochre px-4 py-2 font-semibold text-white">Grade it</button>
          ) : (
            <p className="text-lg font-semibold">Score: {Math.round(result.score * 100)}% — mastery updated.</p>
          )}
        </section>
      )}

      {cards.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">Flashcards (click to flip)</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {cards.map((c, i) => (
              <button key={i} onClick={() => setFlip(flip === i ? null : i)}
                className="min-h-24 rounded-sm border border-stone-200 p-4 text-left hover:border-pine">
                <span className="text-sm font-semibold text-stone-500">{flip === i ? "Back" : "Front"}</span>
                <p className="mt-1">{flip === i ? c.back : c.front}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
