"use client";
// Minimal EN+SL dictionary. Add your locale here — PRs welcome.

export type Lang = "en" | "sl";

const dict = {
  en: {
    sticker: "Free forever · Open source",
    heroA: "Your notes.",
    heroB: "Your A.",
    sub: "Upload your class material and get a study plan, a personal tutor, quizzes, mock exams, and podcasts. No card, no catch.",
    start: "Upload your notes",
    ask: "Ask the tutor",
    tryit: "Try it right now — ask anything:",
    nav_materials: "Materials",
    nav_tutor: "Tutor",
    nav_practice: "Practice",
    nav_plan: "Plan",
    nav_exam: "Exams",
    nav_podcast: "Podcast",
    nav_progress: "Progress",
    nav_playground: "Playground",
  },
  sl: {
    sticker: "Vedno zastonj · Odprta koda",
    heroA: "Tvoji zapiski.",
    heroB: "Tvoja petica.",
    sub: "Naloži svoje gradivo in dobiš učni načrt, osebnega tutorja, kvize, poskusne teste in podkaste. Brez kartice, brez zank.",
    start: "Naloži zapiske",
    ask: "Vprašaj tutorja",
    tryit: "Preizkusi takoj — vprašaj karkoli:",
    nav_materials: "Gradivo",
    nav_tutor: "Tutor",
    nav_practice: "Vaja",
    nav_plan: "Načrt",
    nav_exam: "Izpiti",
    nav_podcast: "Podkast",
    nav_progress: "Napredek",
    nav_playground: "Igrišče",
  },
} satisfies Record<Lang, Record<string, string>>;

export type Key = keyof (typeof dict)["en"];

export function t(lang: Lang, key: Key): string {
  return dict[lang][key] ?? dict.en[key];
}

export function detectLang(): Lang {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("sl"))
    return "sl";
  return "en";
}
