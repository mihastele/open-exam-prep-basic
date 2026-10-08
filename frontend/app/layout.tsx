import type { Metadata } from "next";
import "./globals.css";
import Nav from "../components/Nav";

export const metadata: Metadata = {
  title: "openExamPrep — free AI exam coach",
  description: "Turn your notes into a study plan, tutor, quizzes, mocks, and podcasts. Open source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
        <footer className="border-t border-stone-200 py-6 text-center text-sm text-stone-600">
          openExamPrep · MIT licensed · your notes stay on your machine
        </footer>
      </body>
    </html>
  );
}
