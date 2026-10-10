"use client";

import { useEffect, useState } from "react";
import { api, post } from "../../lib/api";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  StatTile,
  TextInput,
} from "../../components/ui";

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
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api<Overview>("/api/progress/overview").then(setOv).catch(() => undefined);
    api<Status>("/api/gamification/status").then(setSt).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
  }, []);

  const log = async () => {
    setBusy(true);
    await post("/api/gamification/log", { minutes: mins });
    refresh();
    setBusy(false);
  };

  return (
    <div className="pt-8">
      <PageHeader title="Progress">Every graded quiz and mock feeds your mastery map. The plan reads it to decide what to study first.</PageHeader>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {ov ? (
            <>
              <div className="flex flex-wrap gap-3">
                <StatTile value={`${ov.study_minutes_total}m`} label="studied" />
                <StatTile value={ov.avg_score === null ? "—" : `${Math.round(ov.avg_score * 100)}%`} label="avg score" accent />
                <StatTile value={ov.mastery.length} label="topics tracked" />
              </div>

              <h2 className="mt-7 font-display text-lg font-extrabold">Mastery</h2>
              {ov.mastery.length === 0 ? (
                <div className="mt-3">
                  <EmptyState title="Nothing tracked yet">
                    Grade a quiz or a mock exam and each topic starts filling in here.
                  </EmptyState>
                </div>
              ) : (
                <ul className="mt-3 max-w-2xl space-y-3">
                  {ov.mastery.map((m) => {
                    const pct = Math.round(m.level * 100);
                    return (
                      <li key={m.topic} className="rounded-xl border-2 border-ink/15 bg-white p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-semibold">{m.topic}</span>
                          <span className="shrink-0 font-display text-sm font-black">{pct}%</span>
                        </div>
                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-mist">
                          <div
                            className={`h-full ${pct >= 70 ? "bg-ink" : pct >= 40 ? "bg-volt" : "bg-coral"}`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-stone-500">
                          {m.attempts} attempt{m.attempts === 1 ? "" : "s"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Card className="mt-6 max-w-md p-4">
                <SectionTitle hint="shows up in your streak">Log study time</SectionTitle>
                <div className="mt-3 flex items-end gap-2">
                  <div className="w-24">
                    <TextInput value={mins} onChange={(v) => setMins(Number(v) || 0)} type="number" min={1} ariaLabel="Minutes studied" />
                  </div>
                  <span className="pb-3 text-sm text-stone-600">minutes</span>
                  <div className="ml-auto">
                    <Button variant="accent" loading={busy} onClick={log}>
                      Log it
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <p className="text-stone-600">Loading…</p>
          )}
        </div>

        <aside className="space-y-4">
          {st ? (
            <>
              <Card className="bg-ink p-5 text-white">
                <p className="font-display text-6xl font-black leading-none text-volt">{st.streak_days}</p>
                <p className="mt-1 font-display text-sm font-extrabold uppercase tracking-wide text-stone-300">
                  day streak
                </p>
                <p className="mt-2 text-sm text-stone-300">{st.minutes_today} min logged today</p>
              </Card>

              <Card soft className="p-4">
                <SectionTitle>Badges</SectionTitle>
                <ul className="mt-2.5 space-y-1.5">
                  {st.badges.map((b) => (
                    <li
                      key={b.id}
                      className={`flex items-start gap-2 rounded-lg border-2 px-2.5 py-2 text-sm ${
                        b.earned ? "border-ink bg-volt/40" : "border-ink/10 bg-white text-stone-500"
                      }`}
                    >
                      <span aria-hidden="true">{b.earned ? "★" : "☆"}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{b.label}</span>
                        <span className="text-xs text-stone-500">{b.id}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <Card soft className="p-4">
              <p className="text-sm text-stone-600">Loading your streak…</p>
            </Card>
          )}

          <Card soft className="p-4">
            <SectionTitle hint="one per graded set">Attempts</SectionTitle>
            <p className="mt-2 text-sm text-stone-600">
              {ov && Object.keys(ov.attempts).length
                ? Object.entries(ov.attempts)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : "No graded attempts yet."}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
