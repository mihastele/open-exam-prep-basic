"use client";

import { useEffect, useState } from "react";
import { api, post } from "../../lib/api";

type Day = { date: string; topic: string; minutes: number; done: boolean };
type Plan = { id: number; exam_date: string; topics: string[]; schedule: Day[] };

export default function PlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [exam, setExam] = useState("");
  const [topics, setTopics] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => api<Plan>("/api/plan/active").then(setPlan).catch(() => setPlan(null));
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    try {
      const r = await post<Plan>("/api/plan", {
        exam_date: exam, topics: topics.split(",").map((s) => s.trim()).filter(Boolean), minutes_per_day: 45,
      });
      setPlan(r); setMsg("");
    } catch (e) { setMsg(String(e)); }
  };
  const toggle = async (d: Day) => {
    const r = await api<Plan>(`/api/plan/${plan!.id}/day?day_date=${d.date}&done=${!d.done}`, { method: "PATCH" });
    setPlan({ ...plan!, schedule: r.schedule });
  };

  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl font-bold">Study plan</h1>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm">Exam date <input type="date" value={exam} onChange={(e) => setExam(e.target.value)} className="ml-1 border border-stone-300 p-1.5" /></label>
        <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Topics, comma separated"
          className="min-w-64 flex-1 rounded-sm border border-stone-300 p-2" />
        <button onClick={create} className="rounded-sm bg-pine px-4 py-2 font-semibold text-white">Build plan</button>
      </div>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
      {plan ? (
        <div className="mt-6">
          <p className="text-stone-700">Exam <strong>{plan.exam_date}</strong> · {plan.topics.join(" · ")}</p>
          <ul className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
            {plan.schedule.map((d) => (
              <li key={d.date} className="flex items-center gap-3 py-2.5">
                <input type="checkbox" checked={d.done} onChange={() => toggle(d)} className="h-4 w-4 accent-[#166b5d]" />
                <span className="w-28 font-mono text-sm">{d.date}</span>
                <span className={d.done ? "line-through text-stone-500" : "font-medium"}>{d.topic}</span>
                <span className="ml-auto text-sm text-stone-600">{d.minutes} min</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 text-stone-600">No plan yet — set a date and topics above. Weakest topics (by mastery) go first, review lands the day before.</p>
      )}
    </div>
  );
}
