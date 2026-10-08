"use client";

import { useEffect, useState } from "react";
import { api, upload } from "../../lib/api";

type Doc = { id: number; title: string; source_type: string; chunks: number };

export default function Materials() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [msg, setMsg] = useState("");
  const refresh = () => api<Doc[]>("/api/ingest").then(setDocs).catch((e) => setMsg(String(e)));
  useEffect(() => { refresh(); }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg("Uploading & indexing…");
    try {
      const d = await upload<Doc>("/api/ingest", f);
      setMsg(`Indexed “${d.title}” → ${d.chunks} chunks.`);
      refresh();
    } catch (e) { setMsg(String(e)); }
  };
  const del = async (id: number) => {
    await api(`/api/ingest/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="pt-8">
      <h1 className="font-display text-3xl font-bold">Study materials</h1>
      <p className="mt-2 text-stone-700">PDF, PPTX, TXT, Markdown, or images. Everything is chunked and embedded locally.</p>
      <label className="mt-5 block max-w-md cursor-pointer rounded-sm border-2 border-dashed border-stone-300 p-6 text-center hover:border-pine">
        Drop a file here or click to browse
        <input type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
      <ul className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-3">
            <span className="font-semibold">{d.title}</span>
            <span className="text-sm text-stone-600">{d.chunks} chunks</span>
            <button onClick={() => del(d.id)} className="ml-auto text-sm text-red-800 underline">delete</button>
          </li>
        ))}
        {docs.length === 0 && <li className="py-4 text-stone-600">No materials yet — upload your first file above.</li>}
      </ul>
    </div>
  );
}
