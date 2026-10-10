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
    <header className="sticky top-0 z-50 bg-ink text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
        <Link href="/" className="font-display text-xl font-black tracking-tight text-volt">
          openExamPrep
        </Link>
        <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px]">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={
                path === l.href
                  ? "rounded-full bg-volt px-3 py-0.5 font-display font-extrabold text-ink"
                  : "rounded-full px-3 py-0.5 text-stone-300 hover:bg-white/10 hover:text-white"
              }
            >
              {t(lang, l.key)}
            </Link>
          ))}
        </nav>
        <button
          onClick={flip}
          className="ml-auto rounded-full border border-white/30 px-3 py-0.5 text-sm text-stone-200 hover:border-volt hover:text-volt"
          title="Switch language / Zamenjaj jezik"
        >
          {lang === "en" ? "SL" : "EN"}
        </button>
      </div>
      <div className="h-1 bg-volt" />
    </header>
  );
}
