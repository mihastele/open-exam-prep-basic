"use client";

import { useEffect, useState } from "react";
import { post } from "../../lib/api";
import { listen, speak } from "../../lib/speech";

type MockItem = { question: string; options: string[] | null; answer_index: number | null; model_answer: string };

export default function Exam() {
  const [topic, setTopic] = useState("");
  const [items, setItems] = useState<MockItem[]>([]);
  const [attempt, setAttempt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [oralQ, setOralQ] = useState("");
  const [transcript, setTranscript] = useState("");
  const [oralFb, setOralFb] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (left <= 0 || score !== null) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, score]);

  const startMock = async () => {
    setMsg("Writing your mock exam…");
    setScore(null);
    try {
      const r = await post<{ attempt_id: number; minutes: number; items: MockItem[] }>("/api/exam/mock", { topic, n: 8, minutes: 20 });
      setItems(r.items); setAttempt(r.attempt_id);
      setAnswers(new Array(r.items.filter((i) => i.options).length).fill(-1));
      setLeft(r.minutes * 60); setMsg("");
    } catch (e) { setMsg(String(e)); }
  };
  const submit = async () => {
    if (attempt == null) return;
    const r = await post<{ score: number }>(`/api/exam/mock/${attempt}/submit`, { answers });
    setScore(r.score);
  };
  const nextOral = async () => {
    const r = await post<{ question: string }>("/api/exam/oral/next", { topic });
    setOralQ(r.question); setOralFb(""); setTranscript("");
    speak(r.question);
  };
  const gradeOral = async () => {
    const r = await post<{ score: number; feedback: string; follow_up: string }>(
      "/api/exam/oral/grade", { topic, question: oralQ, transcript });
    setOralFb(`${Math.round(r.score * 100)}% — ${r.feedback} Follow-up: ${r.follow_up}`);
  };
  const mic = () => {
    const stop = listen("en-US", (t) => setTranscript((p) => p + " " + t));
    if (!stop) setMsg("Browser speech recognition not available — type your answer instead.");
    else setTimeout(stop, 15000);
  };

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  let mcqIdx = -1;

  return (
    <div className="grid gap-10 pt-8 md:grid-cols-2">
      <section>
        <h1 className="font-display text-3xl font-bold">Timed mock</h1>
        <div className="mt-3 flex gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic"
            className="flex-1 rounded-sm border border-stone-300 p-2" />
          <button onClick={startMock} className="rounded-sm bg-ink px-4 font-semibold text-white">Start</button>
        </div>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
        {items.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-2xl font-bold">{score !== null ? `Done: ${Math.round(score * 100)}%` : mm}</p>
            <div className="mt-3 space-y-3">
              {items.map((it, i) => {
                if (!it.options) return <div key={i} className="border border-stone-200 p-3"><p className="font-semibold">{i + 1}. {it.question}</p><p className="mt-1 text-sm text-stone-600">Short answer — model answer shown after submit.</p></div>;
                mcqIdx++;
                const k = mcqIdx;
                return (
                  <div key={i} className="border border-stone-200 p-3">
                    <p className="font-semibold">{i + 1}. {it.question}</p>
                    {it.options.map((o, j) => (
                      <label key={j} className="block cursor-pointer px-1 py-0.5 text-[15px] hover:bg-mist">
                        <input type="radio" name={`m${i}`} className="mr-2" checked={answers[k] === j}
                          onChange={() => setAnswers(answers.map((a, x) => (x === k ? j : a)))} />{o}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            {score === null && <button onClick={submit} className="mt-4 rounded-sm bg-coral px-4 py-2 font-semibold text-white">Submit before time runs out</button>}
            {score !== null && items.map((it, i) => <p key={i} className="mt-2 text-sm text-stone-700"><strong>{i + 1}.</strong> {it.model_answer}</p>)}
          </div>
        )}
      </section>
      <section>
        <h2 className="font-display text-3xl font-bold">Oral exam</h2>
        <p className="mt-2 text-sm text-stone-600">Questions are read aloud; answer by mic (15 s) or typing. Free browser speech, no keys.</p>
        <button onClick={nextOral} className="mt-3 rounded-sm border border-ink px-4 py-2 font-semibold">Next question</button>
        {oralQ && (
          <div className="mt-3 border border-stone-200 p-3">
            <p className="font-semibold">{oralQ}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={mic} className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-sm font-semibold text-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <path d="M12 19v3" />
                </svg>
                answer by voice
              </button>
              <button onClick={() => speak(oralQ)} className="rounded-full border border-stone-300 px-3 py-1 text-sm font-semibold">replay</button>
            </div>
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3}
              className="mt-2 w-full rounded-sm border border-stone-300 p-2" placeholder="Your answer…" />
            <button onClick={gradeOral} className="mt-2 rounded-sm bg-ink px-4 py-1.5 font-semibold text-white">Grade</button>
            {oralFb && <p className="mt-2 text-[15px]">{oralFb}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
