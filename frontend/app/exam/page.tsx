"use client";

import { useEffect, useState } from "react";
import { post } from "../../lib/api";
import { listen, speak } from "../../lib/speech";
import {
  Button,
  Callout,
  Card,
  EmptyState,
  MicIcon,
  PageHeader,
  ProgressBar,
  Segmented,
  StatTile,
  TextArea,
  TextInput,
} from "../../components/ui";

type MockItem = { question: string; options: string[] | null; answer_index: number | null; model_answer: string };
type Mode = "mock" | "oral";

export default function Exam() {
  const [mode, setMode] = useState<Mode>("mock");
  const [topic, setTopic] = useState("");

  const [items, setItems] = useState<MockItem[]>([]);
  const [attempt, setAttempt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [oralQ, setOralQ] = useState("");
  const [transcript, setTranscript] = useState("");
  const [oralFb, setOralFb] = useState("");
  const [msg, setMsg] = useState("");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (left <= 0 || score !== null) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, score]);

  const startMock = async () => {
    setBusy(true);
    setMsg("");
    setScore(null);
    try {
      const r = await post<{ attempt_id: number; minutes: number; items: MockItem[] }>("/api/exam/mock", {
        topic,
        n: 8,
        minutes: 20,
      });
      setItems(r.items);
      setAttempt(r.attempt_id);
      setAnswers(new Array(r.items.filter((i) => i.options).length).fill(-1));
      setLeft(r.minutes * 60);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const submit = async () => {
    if (attempt == null) return;
    setBusy(true);
    try {
      const r = await post<{ score: number }>(`/api/exam/mock/${attempt}/submit`, { answers });
      setScore(r.score);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const nextOral = async () => {
    setBusy(true);
    setOralFb("");
    setTranscript("");
    try {
      const r = await post<{ question: string }>("/api/exam/oral/next", { topic });
      setOralQ(r.question);
      speak(r.question);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const gradeOral = async () => {
    if (!transcript.trim()) return;
    setBusy(true);
    try {
      const r = await post<{ score: number; feedback: string; follow_up: string }>(
        "/api/exam/oral/grade",
        { topic, question: oralQ, transcript },
      );
      setOralFb(`${Math.round(r.score * 100)}% — ${r.feedback} Follow-up: ${r.follow_up}`);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const mic = () => {
    const stop = listen("en-US", (t) => setTranscript((p) => `${p} ${t}`.trim()));
    if (!stop) {
      setMsg("Browser speech recognition is not available here — type your answer instead.");
      return;
    }
    setListening(true);
    setTimeout(() => {
      stop();
      setListening(false);
    }, 15000);
  };

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const mcqTotal = items.filter((i) => i.options).length;
  const mcqAnswered = answers.filter((a) => a >= 0).length;
  let mcqIdx = -1;

  return (
    <div className="pt-8">
      <PageHeader title="Exams">
        A timed mock with marking, and an oral rehearsal read aloud — both free, both using your browser&apos;s own
        speech, no keys.
      </PageHeader>

      <div className="mt-5 max-w-xl">
        <Segmented
          name="Exam mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "mock", label: "Timed mock", hint: "Mixed questions, marked" },
            { value: "oral", label: "Oral exam", hint: "Spoken, graded" },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:max-w-xl sm:flex-row">
        <div className="flex-1">
          <TextInput
            value={topic}
            onChange={setTopic}
            placeholder="Topic (blank = your material)"
            ariaLabel="Topic"
            onEnter={mode === "mock" ? startMock : nextOral}
          />
        </div>
        <Button
          variant="accent"
          loading={busy}
          onClick={mode === "mock" ? startMock : nextOral}
          full
        >
          {mode === "mock" ? "Start mock" : "Next question"}
        </Button>
      </div>

      {msg && (
        <div className="mt-4 max-w-3xl">
          <Callout tone="error" onDismiss={() => setMsg("")}>
            {msg}
          </Callout>
        </div>
      )}

      {mode === "mock" && (
        <>
          {items.length === 0 ? (
            <div className="mt-6 max-w-3xl">
              <EmptyState title="No mock running">
                Start a mock and you get eight questions and twenty minutes on the clock. Submit before it runs out —
                marking happens straight away.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-6 max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`rounded-xl border-2 border-ink px-4 py-2.5 ${
                    score !== null ? "bg-volt" : left <= 60 ? "bg-coral text-white" : "bg-white"
                  }`}
                >
                  <p className="font-mono text-3xl font-black leading-none">
                    {score !== null ? "done" : mm}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-80">
                    {score !== null ? "submitted" : left <= 60 ? "hurry" : "time left"}
                  </p>
                </div>
                <StatTile value={`${mcqAnswered}/${mcqTotal}`} label="answered" />
                {score !== null && <StatTile value={`${Math.round(score * 100)}%`} label="score" accent />}
              </div>

              <div className="mt-5 space-y-4">
                {items.map((it, i) => {
                  if (!it.options) {
                    return (
                      <Card key={i} className="p-4">
                        <p className="font-display text-[17px] font-extrabold">
                          {i + 1}. {it.question}
                        </p>
                        <p className="mt-2 text-sm text-stone-600">
                          Short answer — the model answer appears after you submit.
                        </p>
                        {score !== null && (
                          <p className="mt-2 rounded-lg bg-mist px-3 py-2 text-sm text-stone-700">{it.model_answer}</p>
                        )}
                      </Card>
                    );
                  }
                  mcqIdx += 1;
                  const k = mcqIdx;
                  return (
                    <Card key={i} className="p-4">
                      <p className="font-display text-[17px] font-extrabold">
                        {i + 1}. {it.question}
                      </p>
                      <div className="mt-3 grid gap-2">
                        {it.options.map((o, j) => {
                          const chosen = answers[k] === j;
                          const revealed = score !== null && j === it.answer_index;
                          return (
                            <button
                              key={j}
                              type="button"
                              onClick={() => score === null && setAnswers(answers.map((a, x) => (x === k ? j : a)))}
                              aria-pressed={chosen}
                              className={`flex items-start gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-[15px] transition
                                ${revealed ? "border-ink bg-volt" : ""}
                                ${score === null && chosen ? "border-ink bg-mist font-semibold" : ""}
                                ${score === null && !chosen ? "border-ink/15 hover:border-ink hover:bg-mist" : ""}
                                ${score !== null && !revealed ? "border-ink/10 text-stone-500" : ""}`}
                            >
                              <span
                                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-[10px] font-black ${
                                  chosen ? "bg-ink text-volt" : "bg-white text-ink"
                                }`}
                              >
                                {String.fromCharCode(65 + j)}
                              </span>
                              <span>{o}</span>
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="mt-5">
                {score === null ? (
                  <Button variant="danger" loading={busy} onClick={submit}>
                    Submit for marking
                  </Button>
                ) : (
                  <Card soft className="p-4">
                    <p className="font-display text-xl font-black">{Math.round(score * 100)}% marked</p>
                    <div className="mt-2">
                      <ProgressBar value={score} label="correct answers across the mock" />
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {mode === "oral" && (
        <div className="mt-6 max-w-3xl">
          {!oralQ ? (
            <EmptyState title="No question yet">
              Hit “Next question” and it is read aloud. Answer by voice for 15 seconds, or type it — then grade.
            </EmptyState>
          ) : (
            <Card className="p-5">
              <p className="font-display text-xl font-black leading-snug">{oralQ}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant={listening ? "danger" : "primary"} onClick={mic}>
                  <MicIcon className="h-4 w-4" />
                  {listening ? "listening…" : "answer by voice"}
                </Button>
                <Button variant="outline" onClick={() => speak(oralQ)}>
                  Replay
                </Button>
              </div>

              <div className="mt-4">
                <TextArea
                  value={transcript}
                  onChange={setTranscript}
                  rows={4}
                  ariaLabel="Your spoken answer"
                  placeholder="Your answer appears here as you speak — or just type it…"
                />
              </div>

              <div className="mt-3">
                <Button variant="accent" loading={busy} onClick={gradeOral}>
                  Grade my answer
                </Button>
              </div>

              {oralFb && (
                <p className="mt-4 rounded-xl border-2 border-ink bg-mist px-4 py-3 text-[15px] leading-relaxed">
                  {oralFb}
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
