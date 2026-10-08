import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import Nav from "../components/Nav";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "openExamPrep — free AI exam coach",
  description: "Turn your notes into a study plan, tutor, quizzes, mocks, and podcasts. Open source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24">{children}</main>
        <footer className="bg-ink py-6 text-center text-sm text-stone-300">
          <span className="font-display font-extrabold text-volt">openExamPrep</span> · MIT licensed ·
          your notes stay on your machine
        </footer>
      </body>
    </html>
  );
}
