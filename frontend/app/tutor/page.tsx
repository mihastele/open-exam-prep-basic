"use client";

import { useState } from "react";
import { post, upload } from "../../lib/api";

type Msg = { role: "user" | "assistant"; content: string };
type Cite = { chunk_id: number; document_id: number; excerpt: string };

export default function Tutor() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [level, setLevel] = useState("secondary");
  const [cites, setCites] = useState<Cite[]>([]);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState("");

  const ask = async () => {
    if (!input.trim() || busy) return;
    const history = [...msgs, { role: "user" as const, content: input }];
    setMsgs(history);
    setInput("");
    setBusy(true);
    try {
      const r = await post<{ answer: string; citations: Cite[]; degraded: boolean }>("/api/tutor/chat", {
        message: input, level, history: history.slice(0, -1),
      });
      setMsgs([...history, { role: "assistant", content: r.answer }]);
      setCites(r.citations);
    } catch (e) {
      setMsgs([...history, { role: "assistant", content: `Error: ${e}` }]);
    }
    setBusy(false);
  };

  const solvePhoto = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await upload<{ detected_text: string; guidance: string }>(`/api/solve/photo?level=${level}`, f);
      setPhoto(r.detected_text);
      setMsgs([...msgs, { role: "user", content: `[photo] ${r.detected_text}` }, { role: "assistant", content: r.guidance }]);
    } catch (e) { setMsgs([...msgs, { role: "assistant", content: `Error: ${e}` }]); }
    setBusy(false);
  };

  return (
    <div className="grid gap-8 pt-8 md:grid-cols-[1.6fr_1fr]">
      <div>
        <h1 className="font-display text-3xl font-bold">Tutor</h1>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <label>Level:
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="ml-2 border border-stone-300 p-1">
              <option value="elementary">Elementary</option>
              <option value="secondary">Secondary</option>
              <option value="university">University</option>
            </select>
          </label>
          <label className="cursor-pointer underline">
            Scan a question
            <input type="file" accept="image/*" className="hidden" onChange={(e) => solvePhoto(e.target.files?.[0])} />
          </label>
        </div>
        <div className="mt-4 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-sm bg-mist p-3" : "mr-8 whitespace-pre-wrap rounded-sm border border-stone-200 p-3"}>
              {m.content}
            </div>
          ))}
          {msgs.length === 0 && <p className="text-stone-600">Ask anything — the tutor answers from your materials first, general knowledge second, and always says which.</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Explain photosynthesis…" className="flex-1 rounded-sm border border-stone-300 p-2" />
          <button onClick={ask} disabled={busy} className="rounded-sm bg-ink px-4 font-semibold text-white disabled:opacity-50">
            {busy ? "…" : "Ask"}
          </button>
        </div>
      </div>
      <aside>
        <h2 className="font-display text-lg font-bold">Sources</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {cites.map((c) => (
            <li key={c.chunk_id} className="border border-stone-200 p-2">
              <span className="font-semibold">doc {c.document_id} · chunk {c.chunk_id}</span>
              <p className="text-stone-700">{c.excerpt}…</p>
            </li>
          ))}
          {cites.length === 0 && <li className="text-stone-600">Citations for the last answer appear here.</li>}
        </ul>
        {photo && <p className="mt-3 text-sm text-stone-600">Last scan read: “{photo.slice(0, 120)}…”</p>}
      </aside>
    </div>
  );
}
