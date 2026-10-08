"use client";
// Free in-browser speech: TTS for podcasts, STT for oral exams. No keys.

export function speak(text: string, lang = "en-US") {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

type SpeechAlt = { transcript: string };
type SpeechRes = { length: number; [k: number]: SpeechAlt };
type Rec = {
  lang: string;
  onresult: (e: { results: { length: number; [k: number]: SpeechRes } }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export function listen(lang: string, onText: (text: string) => void): (() => void) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    onText(last[0].transcript);
  };
  rec.onend = () => undefined;
  rec.start();
  return () => rec.stop();
}
