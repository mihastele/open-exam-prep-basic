"use client";

import { useState } from "react";
import { post } from "../../lib/api";
import { safeName, type ExportBlock, type ExportDoc } from "../../lib/export";
import ExportMenu from "../../components/ExportMenu";
import {
  Button,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  Segmented,
  SparkIcon,
  StatTile,
  TextInput,
} from "../../components/ui";

type Item = { question: string; options: string[]; answer_index: number; explanation: string };
type Card_ = { front: string; back: string };
type Tab = "quiz" | "cards";

export default function Practice() {
  const [tab, setTab] = useState<Tab>("quiz");
  const [topic, setTopic] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [attempt, setAttempt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; correct: boolean[] } | null>(null);
  const [cards, setCards] = useState<Card_[]>([]);
  const [flip, setFlip] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  /** Export a graded (or ungraded) quiz, with the answer key marked up. */
  function quizDoc(): ExportDoc {
    const blocks: ExportBlock[] = [
      {
        kind: "meta",
        pairs: [
          ["Topic", topic || "from uploaded material"],
          ["Questions", String(items.length)],
          ["Score", result ? `${Math.round(result.score * 100)}%` : "not graded yet"],
          ["Generated", new Date().toLocaleString()],
        ],
      },
    ];
    items.forEach((it, i) => {
      blocks.push({ kind: "heading", text: `${i + 1}. ${it.question}`, level: 3 });
      blocks.push({
        kind: "bullets",
        items: it.options.map(
          (o, j) => `${String.fromCharCode(65 + j)}. ${o}${j === it.answer_index ? "   ← correct" : ""}`,
        ),
      });
      if (it.explanation) blocks.push({ kind: "paragraph", text: `Why: ${it.explanation}` });
    });
    return {
      title: topic ? `Quiz — ${topic}` : "Practice quiz",
      filename: `quiz-${safeName(topic || "practice")}`,
      blocks,
      // One row per question with the answer as text: imports into Anki or Sheets.
      csv: {
        headers: ["question", "option_a", "option_b", "option_c", "option_d", "answer", "explanation"],
        rows: items.map((it) => [
          it.question,
          ...it.options.slice(0, 4),
          it.options[it.answer_index] ?? "",
          it.explanation,
        ]),
      },
    };
  }

  function cardsDoc(): ExportDoc {
    const blocks: ExportBlock[] = [
      {
        kind: "meta",
        pairs: [
          ["Topic", topic || "from uploaded material"],
          ["Cards", String(cards.length)],
          ["Generated", new Date().toLocaleString()],
        ],
      },
      ...cards.flatMap((c) => [
        { kind: "paragraph", label: "Front", text: c.front } as ExportBlock,
        { kind: "paragraph", label: "Back", text: c.back } as ExportBlock,
      ]),
    ];
    return {
      title: topic ? `Flashcards — ${topic}` : "Flashcards",
      filename: `flashcards-${safeName(topic || "practice")}`,
      blocks,
      csv: { headers: ["front", "back"], rows: cards.map((c) => [c.front, c.back]) },
    };
  }

  const quiz = async () => {
    setBusy(true);
    setMsg("");
    setResult(null);
    try {
      const r = await post<{ attempt_id: number; items: Item[] }>("/api/practice/quiz", { topic, n: 5 });
      setItems(r.items);
      setAttempt(r.attempt_id);
      setAnswers(new Array(r.items.length).fill(-1));
      setCards([]);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const grade = async () => {
    if (attempt == null) return;
    setBusy(true);
    try {
      const r = await post<{ score: number; correct: boolean[] }>("/api/practice/quiz/grade", {
        attempt_id: attempt,
        answers,
      });
      setResult(r);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const flashcards = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await post<{ cards: Card_[] }>("/api/practice/flashcards", { topic, n: 8 });
      setCards(r.cards);
      setItems([]);
      setResult(null);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const answered = answers.filter((a) => a >= 0).length;

  return (
    <div className="pt-8">
      <PageHeader title="Practice">
        Quizzes and flashcards generated from a topic or straight out of your uploaded material. Grading feeds your
        mastery map.
      </PageHeader>

      <div className="mt-5 max-w-xl">
        <Segmented
          name="Practice mode"
          value={tab}
          onChange={setTab}
          options={[
            { value: "quiz", label: "Quiz", hint: "Multiple choice, graded" },
            { value: "cards", label: "Flashcards", hint: "Flip to reveal" },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <TextInput
            value={topic}
            onChange={setTopic}
            placeholder="Topic, e.g. quadratic equations (blank = your material)"
            ariaLabel="Topic"
            onEnter={tab === "quiz" ? quiz : flashcards}
          />
        </div>
        <Button variant="accent" loading={busy} onClick={tab === "quiz" ? quiz : flashcards} full>
          {tab === "quiz" ? "Quiz me" : "Make cards"}
        </Button>
      </div>

      {msg && (
        <div className="mt-4 max-w-2xl">
          <Callout tone="error" onDismiss={() => setMsg("")}>
            {msg}
          </Callout>
        </div>
      )}

      {tab === "quiz" && (
        <>
          {items.length === 0 ? (
            <div className="mt-6 max-w-2xl">
              <EmptyState icon={<SparkIcon />} title="No quiz yet">
                Hit “Quiz me” and five questions land here. Answer them, then grade to see what stuck.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-6 max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <StatTile value={`${answered}/${items.length}`} label="answered" />
                <StatTile value={result ? `${Math.round(result.score * 100)}%` : "—"} label="score" accent={!!result} />
                <ExportMenu doc={quizDoc()} label="Export quiz" />
              </div>

              <div className="mt-5 space-y-4">
                {items.map((it, i) => (
                  <Card key={i} className="p-4">
                    <p className="font-display text-[17px] font-extrabold">
                      {i + 1}. {it.question}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {it.options.map((o, j) => {
                        const chosen = answers[i] === j;
                        const isRight = result && j === it.answer_index;
                        const isWrongPick = result && chosen && j !== it.answer_index;
                        return (
                          <button
                            key={j}
                            type="button"
                            onClick={() =>
                              !result && setAnswers(answers.map((a, k) => (k === i ? j : a)))
                            }
                            aria-pressed={chosen}
                            className={`flex items-start gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-[15px] transition
                              ${isRight ? "border-ink bg-volt" : ""}
                              ${isWrongPick ? "border-coral bg-white text-coral" : ""}
                              ${!result && chosen ? "border-ink bg-mist font-semibold" : ""}
                              ${!result && !chosen ? "border-ink/15 hover:border-ink hover:bg-mist" : ""}
                              ${result && !isRight && !isWrongPick ? "border-ink/10 text-stone-500" : ""}`}
                          >
                            <span
                              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-[10px] font-black
                                ${chosen ? "bg-ink text-volt" : "bg-white text-ink"}`}
                            >
                              {String.fromCharCode(65 + j)}
                            </span>
                            <span>{o}</span>
                          </button>
                        );
                      })}
                    </div>
                    {result && (
                      <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-sm text-stone-700">
                        <strong className="font-display">Why:</strong> {it.explanation}
                      </p>
                    )}
                  </Card>
                ))}
              </div>

              <div className="mt-5">
                {!result ? (
                  <Button variant="danger" loading={busy} onClick={grade}>
                    Grade it
                  </Button>
                ) : (
                  <Card soft className="p-4">
                    <p className="font-display text-xl font-black">
                      {Math.round(result.score * 100)}% · mastery updated
                    </p>
                    <div className="mt-2">
                      <ProgressBar
                        value={result.score}
                        label={`${result.correct.filter(Boolean).length} of ${result.correct.length} correct`}
                      />
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "cards" && (
        <>
          {cards.length === 0 ? (
            <div className="mt-6 max-w-2xl">
              <EmptyState icon={<SparkIcon />} title="No cards yet">
                “Make cards” builds eight flip cards from your topic or material.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-6 max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-stone-600">Tap a card to flip it.</p>
                <ExportMenu doc={cardsDoc()} label="Export cards" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {cards.map((c, i) => (
                  <Card key={i} className="min-h-32">
                    <button
                      type="button"
                      onClick={() => setFlip(flip === i ? null : i)}
                      className="block h-full w-full p-4 text-left"
                    >
                      <span className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-500">
                        {flip === i ? "Back" : "Front"} · {i + 1}
                      </span>
                      <p className={`mt-2 text-[15px] leading-relaxed ${flip === i ? "text-ink" : ""}`}>
                        {flip === i ? c.back : c.front}
                      </p>
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
