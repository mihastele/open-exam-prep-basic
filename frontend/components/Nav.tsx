"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { detectLang, t, type Key, type Lang } from "../lib/i18n";

const links: { href: string; key: Key }[] = [
  { href: "/materials", key: "nav_materials" },
  { href: "/tutor", key: "nav_tutor" },
  { href: "/practice", key: "nav_practice" },
  { href: "/plan", key: "nav_plan" },
  { href: "/exam", key: "nav_exam" },
  { href: "/podcast", key: "nav_podcast" },
  { href: "/progress", key: "nav_progress" },
  { href: "/playground", key: "nav_playground" },
];

export default function Nav() {
  const path = usePathname();
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang((localStorage.getItem("oep-lang") as Lang) || detectLang());
  }, []);
  const flip = () => {
    const next = lang === "en" ? "sl" : "en";
    setLang(next);
    localStorage.setItem("oep-lang", next);
    window.dispatchEvent(new Event("oep-lang"));
  };
  return (
    <header className="border-b-2 border-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          openExamPrep
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                path === l.href
                  ? "font-semibold text-pine underline underline-offset-4"
                  : "text-stone-700 hover:text-pine"
              }
            >
              {t(lang, l.key)}
            </Link>
          ))}
        </nav>
        <button
          onClick={flip}
          className="ml-auto rounded-sm border border-stone-300 px-2 py-0.5 text-sm text-stone-700 hover:border-pine"
          title="Switch language / Zamenjaj jezik"
        >
          {lang === "en" ? "SL" : "EN"}
        </button>
      </div>
    </header>
  );
}
