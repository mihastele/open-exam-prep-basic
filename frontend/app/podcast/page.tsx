"use client";

import { useState } from "react";
import { post } from "../../lib/api";
import { speak, stopSpeaking } from "../../lib/speech";

type Seg = { speaker: string; line: string };

export default function Podcast() {
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [segs, setSegs] = useState<Seg[]>([]);
  const [msg, setMsg] = useState("");
  const [playing, setPlaying] = useState(false);

  const gen = async () => {
    setMsg("Writing script…");
    try {
      const r = await post<{ title: string; segments: Seg[] }>("/api/podcast/script", { topic, minutes: 5 });
      setTitle(r.title); setSegs(r.segments); setMsg("");
    } catch (e) { setMsg(String(e)); }
  };
  const play = () => {
    const full = segs.map((s) => `${s.speaker}: ${s.line}`).join("\n");
    if (speak(full)) setPlaying(true);
    else setMsg("This browser has no speech synthesis — read along below instead.");
  };

  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl font-bold">Study podcast</h1>
      <p className="mt-2 text-stone-700">A two-host episode from your material, read aloud free in-browser.</p>
      <div className="mt-3 flex gap-2">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic"
          className="max-w-sm flex-1 rounded-sm border border-stone-300 p-2" />
        <button onClick={gen} className="rounded-sm bg-pine px-4 font-semibold text-white">Generate</button>
        {segs.length > 0 && !playing && <button onClick={play} className="rounded-sm border border-ink px-4 font-semibold">Play</button>}
        {playing && <button onClick={() => { stopSpeaking(); setPlaying(false); }} className="rounded-sm border border-ink px-4 font-semibold">Stop</button>}
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      {title && <h2 className="font-display mt-6 text-xl font-bold">{title}</h2>}
      <div className="mt-3 max-w-2xl space-y-2">
        {segs.map((s, i) => (
          <p key={i} className="text-[15px] leading-relaxed">
            <strong className={s.speaker === "ADA" ? "text-pine" : "text-ochre"}>{s.speaker}:</strong> {s.line}
          </p>
        ))}
      </div>
    </div>
  );
}
