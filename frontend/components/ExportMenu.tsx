"use client";

/**
 * "Export / copy" control for any generated content.
 *
 * One button, a small menu: clipboard, then Markdown / text / Word / PDF / HTML /
 * JSON (plus CSV when the content is tabular). PDF goes through the print dialog —
 * that is how a browser makes a real PDF without shipping a PDF library, and it
 * lets the reader pick page size and ranges.
 */

import { useEffect, useRef, useState } from "react";
import {
  copyText,
  download,
  printDoc,
  toCsv,
  toHtml,
  toJson,
  toMarkdown,
  toPlainText,
  toWordHtml,
  type ExportDoc,
} from "../lib/export";

function ShareIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export default function ExportMenu({
  doc,
  label = "Export",
  solid = false,
  align = "right",
}: {
  doc: ExportDoc;
  label?: string;
  solid?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [side, setSide] = useState<"left" | "right">(align);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);
  const [flash, setFlash] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const MENU_WIDTH = 256; // w-64
  const MENU_HEIGHT = 380; // roughly open, with every format offered

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && trigger.current) {
        // These controls live at the bottom of a chat thread, where a menu that
        // only ever drops downwards gets clipped — the last formats become
        // unreachable. Drop it into whichever side has more room, and cap the
        // height to that room so an awkwardly short window scrolls instead of
        // hiding entries off-screen.
        const rect = trigger.current.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        const goUp = below < MENU_HEIGHT && above > below;
        setUp(goUp);
        setMaxH(Math.max(180, goUp ? above : below));

        // And keep it on screen horizontally: `right-0` grows leftwards, which
        // walks off a phone screen when the chip sits near the left edge.
        let want = align;
        if (want === "right" && rect.right < MENU_WIDTH + 8) want = "left";
        else if (want === "left" && window.innerWidth - rect.left < MENU_WIDTH + 8) want = "right";
        setSide(want);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const timer = useRef<number | undefined>(undefined);
  const flag = (message: string) => {
    setFlash(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(""), 2200);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const csv = toCsv(doc);

  const save = (ext: string, content: string, message: string) => {
    download(doc.filename, content, ext);
    setOpen(false);
    flag(message);
  };

  const copy = async (text: string, message: string) => {
    const ok = await copyText(text);
    setOpen(false);
    flag(ok ? message : "Clipboard blocked — download it instead");
  };

  const item = (text: string, hint: string, onSelect: () => void) => (
    <button
      key={text}
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-mist"
    >
      <span className="font-semibold">{text}</span>
      <span className="ml-auto shrink-0 text-xs text-stone-500">{hint}</span>
    </button>
  );

  const group = (text: string) => (
    <p className="px-3 pb-0.5 pt-2 font-display text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
      {text}
    </p>
  );

  return (
    <span className="relative inline-flex items-center gap-2">
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          solid
            ? "inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-[15px] font-extrabold hover:bg-mist"
            : `inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-bold transition ${
                open ? "border-ink bg-ink text-volt" : "border-ink/20 bg-white text-stone-600 hover:border-ink"
              }`
        }
      >
        <ShareIcon className={solid ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {label}
      </button>

      {flash && (
        <span aria-live="polite" className="text-xs font-semibold text-stone-600">
          {flash}
        </span>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Export options"
          style={{ maxHeight: maxH }}
          className={`absolute z-50 w-64 overflow-y-auto overscroll-contain rounded-xl border-2 border-ink bg-white p-1.5 shadow-[6px_6px_0_#16180f] ${
            up ? "bottom-full mb-2" : "top-full mt-2"
          } ${side === "right" ? "right-0" : "left-0"}`}
        >
          {group("Clipboard")}
          {item("Copy text", "paste anywhere", () => copy(toPlainText(doc), "Copied as text"))}
          {item("Copy Markdown", "Notion · Obsidian", () => copy(toMarkdown(doc), "Copied as Markdown"))}

          <div className="my-1.5 h-px bg-ink/10" />

          {group("Download")}
          {item("Markdown", ".md", () => save("md", toMarkdown(doc), "Saved .md"))}
          {item("Plain text", ".txt", () => save("txt", toPlainText(doc), "Saved .txt"))}
          {item("Word", ".doc", () => save("doc", toWordHtml(doc), "Saved .doc"))}
          {item("PDF", "print dialog", () => {
            const ok = printDoc(doc);
            setOpen(false);
            flag(ok ? "Choose “Save as PDF”" : "Pop-up blocked — use HTML instead");
          })}
          {item("Web page", ".html", () => save("html", toHtml(doc), "Saved .html"))}
          {csv && item("Spreadsheet", ".csv", () => save("csv", csv, "Saved .csv"))}
          {item("Raw JSON", ".json", () => save("json", toJson(doc), "Saved .json"))}
        </div>
      )}
    </span>
  );
}
