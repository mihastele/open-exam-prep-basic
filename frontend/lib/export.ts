"use client";

/**
 * Copy / export helpers for generated content.
 *
 * Deliberately dependency-free and entirely client-side: the same document is
 * rendered to Markdown, plain text, HTML, Word or JSON, copied to the clipboard,
 * or handed to the print dialog for "Save as PDF". Nothing round-trips through
 * the server, so it behaves identically on a deployed free tier and locally.
 *
 * Content is described as blocks rather than HTML strings so each format can
 * render it appropriately — plain text wants indentation, Markdown wants `**`,
 * Word wants a real table.
 */

export type ExportBlock =
  | { kind: "heading"; text: string; level?: 1 | 2 | 3 }
  | { kind: "meta"; pairs: [string, string][] }
  | { kind: "paragraph"; text: string; label?: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

export type ExportDoc = {
  title: string;
  blocks: ExportBlock[];
  /** Filename without extension. Made filesystem-safe by `safeName()`. */
  filename: string;
  /** Optional flat rows so "Download CSV" can appear (Anki, Sheets, Excel). */
  csv?: { headers: string[]; rows: string[][] };
};

/* ------------------------------------------------------------------- naming */

export function safeName(name: string, fallback = "openexamprep"): string {
  const cleaned = name
    .replace(/[^\w\-. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/* --------------------------------------------------------------- serializers */

function markdownBlock(b: ExportBlock): string {
  switch (b.kind) {
    case "heading":
      return `${"#".repeat(b.level ?? 2)} ${b.text}`;
    case "meta":
      return b.pairs.map(([k, v]) => `**${k}:** ${v}`).join("  \n");
    case "paragraph":
      return b.label ? `**${b.label}:** ${b.text}` : b.text;
    case "bullets":
      return b.items.map((i) => `- ${i}`).join("\n");
    case "table":
      return [
        `| ${b.headers.join(" | ")} |`,
        `| ${b.headers.map(() => "---").join(" | ")} |`,
        ...b.rows.map((r) => `| ${r.join(" | ")} |`),
      ].join("\n");
  }
}

export function toMarkdown(doc: ExportDoc): string {
  const parts = [doc.title ? `# ${doc.title}` : "", ...doc.blocks.map(markdownBlock)];
  return `${parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function toPlainText(doc: ExportDoc): string {
  const out: string[] = [];
  if (doc.title) {
    out.push(doc.title, "=".repeat(doc.title.length), "");
  }
  for (const b of doc.blocks) {
    switch (b.kind) {
      case "heading":
        out.push(b.text, "");
        break;
      case "meta":
        b.pairs.forEach(([k, v]) => out.push(`${k}: ${v}`));
        out.push("");
        break;
      case "paragraph":
        out.push(b.label ? `${b.label}: ${b.text}` : b.text, "");
        break;
      case "bullets":
        b.items.forEach((i) => out.push(`  - ${i}`));
        out.push("");
        break;
      case "table":
        out.push(b.headers.join(" | "));
        b.rows.forEach((r) => out.push(r.join(" | ")));
        out.push("");
        break;
    }
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function renderBody(doc: ExportDoc): string {
  return doc.blocks
    .map((b) => {
      switch (b.kind) {
        case "heading": {
          const level = Math.min(b.level ?? 2, 3);
          return `<h${level}>${escapeHtml(b.text)}</h${level}>`;
        }
        case "meta":
          return `<p class="meta">${b.pairs
            .map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`)
            .join(" · ")}</p>`;
        case "paragraph":
          return `<p>${b.label ? `<strong class="speaker">${escapeHtml(b.label)}</strong> ` : ""}${escapeHtml(
            b.text,
          ).replace(/\n/g, "<br/>")}</p>`;
        case "bullets":
          return `<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
        case "table":
          return `<table><thead><tr>${b.headers
            .map((h) => `<th>${escapeHtml(h)}</th>`)
            .join("")}</tr></thead><tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`;
      }
    })
    .join("\n");
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
         color: #16180f; background: #fff; line-height: 1.55; max-width: 46rem; margin: 2rem auto; padding: 0 1.2rem; }
  h1 { font-size: 1.6rem; margin: 0 0 .4rem; }
  h2 { font-size: 1.2rem; margin: 1.6rem 0 .5rem; border-bottom: 2px solid #16180f; padding-bottom: .2rem; }
  h3 { font-size: 1rem; margin: 1.1rem 0 .4rem; }
  p { margin: .5rem 0; }
  .meta { color: #555; font-size: .85rem; }
  .speaker { display: inline-block; background: #d7f542; border-radius: 999px; padding: 0 .5rem; margin-right: .3rem; }
  ul { margin: .5rem 0 .5rem 1.2rem; }
  li { margin: .2rem 0; }
  table { border-collapse: collapse; width: 100%; margin: .8rem 0; font-size: .9rem; }
  th, td { border: 1px solid #999; padding: .35rem .5rem; text-align: left; vertical-align: top; }
  footer { margin-top: 2rem; padding-top: .6rem; border-top: 1px solid #ccc; color: #777; font-size: .75rem; }
  @media print { body { margin: 0; max-width: none; } h2 { break-after: avoid; } }
`;

export function toHtml(doc: ExportDoc): string {
  const title = doc.title ? `<h1>${escapeHtml(doc.title)}</h1>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title || "openExamPrep export")}</title>
<style>${PRINT_CSS}</style></head>
<body>${title}
${renderBody(doc)}
<footer>Exported from openExamPrep${doc.title ? ` — ${escapeHtml(doc.title)}` : ""}</footer>
</body></html>`;
}

/** Word opens HTML saved with a .doc extension; the mso bits keep page setup sane. */
export function toWordHtml(doc: ExportDoc): string {
  const title = doc.title ? `<h1>${escapeHtml(doc.title)}</h1>` : "";
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page { size: A4; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 18pt; } h2 { font-size: 14pt; } h3 { font-size: 12pt; }
  .meta { color: #555; font-size: 9pt; }
  .speaker { font-weight: bold; }
  table { border-collapse: collapse; } th, td { border: 1px solid #666; padding: 4pt 6pt; }
</style></head>
<body>${title}
${renderBody(doc)}
</body></html>`;
}

export function toJson(doc: ExportDoc): string {
  return `${JSON.stringify({ title: doc.title, blocks: doc.blocks }, null, 2)}\n`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(doc: ExportDoc): string | null {
  if (!doc.csv) return null;
  const { headers, rows } = doc.csv;
  return `${[headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")}\n`;
}

/* ------------------------------------------------------------------ delivery */

const MIME: Record<string, string> = {
  md: "text/markdown;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  doc: "application/msword",
  json: "application/json;charset=utf-8",
  csv: "text/csv;charset=utf-8",
};

export function download(name: string, content: string, ext: string): void {
  const blob = new Blob([content], { type: MIME[ext] ?? "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(name)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Clipboard with a fallback: `navigator.clipboard` needs a secure context. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* insecure context or permission denied — fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Open the print dialog on a standalone copy of the document, which is how a
 * browser produces a real PDF without shipping a PDF library.
 * Returns false when the window was blocked, so callers can offer the HTML file.
 */
export function printDoc(doc: ExportDoc): boolean {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.opener = null;
  win.document.write(toHtml(doc));
  win.document.close();
  win.focus();
  // Let layout settle before the dialog, or the preview can come up blank.
  setTimeout(() => win.print(), 300);
  return true;
}
