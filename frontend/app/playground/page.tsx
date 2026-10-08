"use client";

import { useEffect, useRef, useState } from "react";
import { api, post } from "../../lib/api";

type Daily = { date: string; puzzle_id: string; kind: string; question: string; hint: string };

// Plugin slot: drop a new component in this file (or a sibling) per explainer.
function FunctionPlot() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [a, setA] = useState(1);
  const [b, setB] = useState(0);
  const [c, setC] = useState(-2);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#d6d3d1";
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.strokeStyle = "#166b5d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
      const x = (px - W / 2) / 30;
      const y = a * x * x + b * x + c;
      const py = H / 2 - y * 30;
      px === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }, [a, b, c]);
  const slider = (v: number, set: (n: number) => void, label: string) => (
    <label className="text-sm">{label} <input type="range" min={-3} max={3} step={0.5} value={v}
      onChange={(e) => set(Number(e.target.value))} className="align-middle" /> {v}</label>
  );
  return (
    <div className="border border-stone-200 p-4">
      <h3 className="font-display text-lg font-bold">Quadratic explorer <span className="text-sm font-normal text-stone-600">y = ax² + bx + c</span></h3>
      <canvas ref={ref} width={520} height={260} className="mt-2 w-full border border-stone-200" />
      <div className="mt-2 flex gap-4">{slider(a, setA, "a")}{slider(b, setB, "b")}{slider(c, setC, "c")}</div>
    </div>
  );
}

export default function Playground() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [ans, setAns] = useState("");
  const [verdict, setVerdict] = useState("");

  useEffect(() => { api<Daily>("/api/games/daily").then(setDaily).catch(() => undefined); }, []);
  const solve = async () => {
    if (!daily) return;
    const r = await post<{ correct: boolean; message: string }>("/api/games/solve", { puzzle_id: daily.puzzle_id, answer: ans });
    setVerdict(r.message);
  };

  return (
    <div className="grid gap-10 pt-8 md:grid-cols-2">
      <section>
        <h1 className="font-display text-3xl font-bold">Daily puzzle</h1>
        {daily ? (
          <div className="mt-4 border border-stone-200 p-4">
            <p className="text-sm text-stone-600">{daily.date} · {daily.kind}</p>
            <p className="mt-2 text-[17px] font-medium">{daily.question}</p>
            <div className="mt-3 flex gap-2">
              <input value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Your answer"
                className="flex-1 rounded-sm border border-stone-300 p-2" />
              <button onClick={solve} className="rounded-sm bg-pine px-4 font-semibold text-white">Check</button>
            </div>
            {verdict && <p className="mt-2 text-[15px]">{verdict}</p>}
          </div>
        ) : <p className="mt-4 text-stone-600">Loading…</p>}
        <p className="mt-4 text-sm text-stone-600">New puzzle every day, same for everyone — argue about it with your study group.</p>
      </section>
      <section>
        <h2 className="font-display text-3xl font-bold">Interactive explainers</h2>
        <p className="mt-2 text-sm text-stone-600">Example plugin below. Add yours: a React component + a line in this file.</p>
        <div className="mt-4"><FunctionPlot /></div>
      </section>
    </div>
  );
}
