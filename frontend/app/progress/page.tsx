"use client";

import { useEffect, useState } from "react";
import { api, post } from "../../lib/api";

type Overview = {
  mastery: { topic: string; level: number; attempts: number }[];
  attempts: Record<string, number>;
  avg_score: number | null;
  study_minutes_total: number;
};
type Status = {
  streak_days: number;
  minutes_today: number;
  badges: { id: string; label: string; earned: boolean }[];
};

export default function Progress() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [mins, setMins] = useState(25);
  const refresh = () => {
    api<Overview>("/api/progress/overview").then(setOv).catch(() => undefined);
    api<Status>("/api/gamification/status").then(setSt).catch(() => undefined);
  };
  useEffect(() => { refresh(); }, []);
  const log = async () => {
    await post("/api/gamification/log", { minutes: mins });
    refresh();
  };

  return (
    <div className="grid gap-10 pt-8 md:grid-cols-2">
      <section>
        <h1 className="font-display text-3xl font-bold">Progress</h1>
        {ov ? (
          <div className="mt-4">
            <p className="text-stone-700">
              {ov.study_minutes_total} min studied · avg score{" "}
              {ov.avg_score === null ? "—" : `${Math.round(ov.avg_score * 100)}%`} · attempts{" "}
              {Object.entries(ov.attempts).map(([k, v]) => `${k}: ${v}`).join(", ") || "none yet"}
            </p>
            <ul className="mt-4 space-y-3">
              {ov.mastery.map((m) => (
                <li key={m.topic}>
                  <div className="flex justify-between text-[15px]">
                    <span className="font-medium">{m.topic}</span>
                    <span className="text-stone-600">{Math.round(m.level * 100)}% · {m.attempts} tries</span>
                  </div>
                  <div className="mt-1 h-2 bg-stone-200">
                    <div className="h-2 bg-pine" style={{ width: `${Math.round(m.level * 100)}%` }} />
                  </div>
                </li>
              ))}
              {ov.mastery.length === 0 && <li className="text-stone-600">Grade a quiz or mock to start tracking mastery.</li>}
            </ul>
            <div className="mt-6 flex items-center gap-2">
              <input type="number" value={mins} min={1} onChange={(e) => setMins(Number(e.target.value))}
                className="w-20 rounded-sm border border-stone-300 p-1.5" />
              <button onClick={log} className="rounded-sm bg-pine px-4 py-1.5 font-semibold text-white">Log minutes</button>
            </div>
          </div>
        ) : <p className="mt-4 text-stone-600">Loading…</p>}
      </section>
      <section>
        <h2 className="font-display text-3xl font-bold">Streak & badges</h2>
        {st ? (
          <div className="mt-4">
            <p className="font-display text-5xl font-bold">{st.streak_days}<span className="text-lg font-normal text-stone-600"> day streak · {st.minutes_today} min today</span></p>
            <ul className="mt-4 space-y-2">
              {st.badges.map((b) => (
                <li key={b.id} className={`border p-2.5 text-[15px] ${b.earned ? "border-pine bg-sand" : "border-stone-200 text-stone-500"}`}>
                  <span className="font-semibold">{b.earned ? "★" : "☆"} {b.id}</span> — {b.label}
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="mt-4 text-stone-600">Loading…</p>}
      </section>
    </div>
  );
}
