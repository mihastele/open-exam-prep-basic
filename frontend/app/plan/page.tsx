"use client";

import { useEffect, useState } from "react";
import { api, post } from "../../lib/api";
import { type ExportBlock, type ExportDoc } from "../../lib/export";
import ExportMenu from "../../components/ExportMenu";
import {
  Button,
  Callout,
  Card,
  CheckIcon,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  TextInput,
} from "../../components/ui";

type Day = { date: string; topic: string; minutes: number; done: boolean };
type Plan = { id: number; exam_date: string; topics: string[]; schedule: Day[] };

export default function PlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [exam, setExam] = useState("");
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = () =>
    api<Plan>("/api/plan/active")
      .then(setPlan)
      .catch(() => setPlan(null));

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await post<Plan>("/api/plan", {
        exam_date: exam,
        topics: topics
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        minutes_per_day: 45,
      });
      setPlan(r);
    } catch (e) {
      setMsg(String(e));
    }
    setBusy(false);
  };

  const toggle = async (d: Day) => {
    if (!plan) return;
    const r = await api<Plan>(`/api/plan/${plan.id}/day?day_date=${d.date}&done=${!d.done}`, {
      method: "PATCH",
    });
    setPlan({ ...plan, schedule: r.schedule });
  };

  const done = plan ? plan.schedule.filter((d) => d.done).length : 0;
  const total = plan ? plan.schedule.length : 0;
  const minutes = plan ? plan.schedule.reduce((n, d) => n + d.minutes, 0) : 0;

  /** The schedule is generated too, so it can leave the app like everything else. */
  function planDoc(): ExportDoc {
    if (!plan) return { title: "Study plan", filename: "study-plan", blocks: [] };
    const rows = plan.schedule.map((d) => [d.date, d.topic, String(d.minutes), d.done ? "yes" : "no"]);
    return {
      title: `Study plan — exam ${plan.exam_date}`,
      filename: `study-plan-${plan.exam_date}`,
      blocks: [
        {
          kind: "meta",
          pairs: [
            ["Exam day", plan.exam_date],
            ["Topics", plan.topics.join(", ") || "—"],
            ["Days", String(total)],
            ["Planned", `${minutes} min`],
            ["Progress", `${done} of ${total} done`],
            ["Exported", new Date().toLocaleString()],
          ],
        },
        { kind: "heading", text: "Schedule", level: 2 },
        { kind: "table", headers: ["Date", "Topic", "Minutes", "Done"], rows },
      ],
      csv: { headers: ["date", "topic", "minutes", "done"], rows },
    };
  }

  return (
    <div className="pt-8">
      <PageHeader title="Study plan">
        Set the exam date and your topics. The plan front-loads your weakest topics by mastery and lands a review the
        day before.
      </PageHeader>

      <Card className="mt-5 max-w-3xl p-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className="font-display text-sm font-extrabold uppercase tracking-wide">Exam date</span>
            <input
              type="date"
              value={exam}
              onChange={(e) => setExam(e.target.value)}
              className="mt-1.5 w-full rounded-xl border-2 border-ink/25 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-ink focus:bg-mist"
            />
          </label>
          <label className="block">
            <span className="font-display text-sm font-extrabold uppercase tracking-wide">Topics</span>
            <div className="mt-1.5">
              <TextInput
                value={topics}
                onChange={setTopics}
                placeholder="mitosis, meiosis, photosynthesis"
                ariaLabel="Topics, comma separated"
                onEnter={create}
              />
            </div>
          </label>
          <div>
            <Button variant="accent" loading={busy} onClick={create} full>
              Build plan
            </Button>
          </div>
        </div>
        {msg && (
          <div className="mt-3">
            <Callout tone="error" onDismiss={() => setMsg("")}>
              {msg}
            </Callout>
          </div>
        )}
      </Card>

      {plan ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <StatTile value={`${done}/${total}`} label="days done" accent={done === total && total > 0} />
            <StatTile value={`${minutes}m`} label="planned" />
            <StatTile value={plan.exam_date} label="exam day" />
            <ExportMenu doc={planDoc()} label="Export plan" />
          </div>

          <div className="mt-4 max-w-3xl">
            <ProgressBar value={total ? done / total : 0} label={`${plan.topics.join(" · ")}`} />
          </div>

          <h2 className="mt-7 font-display text-lg font-extrabold">Schedule</h2>
          <ul className="mt-3 max-w-3xl space-y-2">
            {plan.schedule.map((d) => (
              <li key={d.date}>
                <Card className={`flex items-center gap-3 p-3.5 ${d.done ? "bg-mist" : ""}`}>
                  <button
                    type="button"
                    onClick={() => toggle(d)}
                    role="checkbox"
                    aria-checked={d.done}
                    aria-label={`Mark ${d.topic} ${d.done ? "not done" : "done"}`}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-ink transition ${
                      d.done ? "bg-volt text-ink" : "bg-white hover:bg-mist"
                    }`}
                  >
                    {d.done && <CheckIcon className="h-4 w-4" />}
                  </button>
                  <span className="w-24 shrink-0 font-mono text-xs text-stone-500">{d.date}</span>
                  <span className={`min-w-0 flex-1 font-semibold ${d.done ? "text-stone-500 line-through" : ""}`}>
                    {d.topic}
                  </span>
                  <span className="shrink-0 rounded-full bg-mist px-2.5 py-1 text-xs font-bold text-stone-700">
                    {d.minutes} min
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-6 max-w-3xl">
          <EmptyState title="No plan yet">Set a date and a few topics above and a day-by-day schedule appears here.</EmptyState>
        </div>
      )}
    </div>
  );
}
