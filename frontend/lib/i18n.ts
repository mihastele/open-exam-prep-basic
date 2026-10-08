"use client";
// Minimal EN+SL dictionary. Add your locale here — PRs welcome.

export type Lang = "en" | "sl";

const dict = {
  en: {
    tagline: "Your notes in, exam confidence out.",
    hero: "Study from your own material, with a tutor that never sleeps.",
    start: "Upload your first material",
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
    tagline: "Tvoji zapiski noter, samozavest na izpitu ven.",
    hero: "Uči se iz svojega gradiva, s tutorjem, ki nikoli ne spi.",
    start: "Naloži prvo gradivo",
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
