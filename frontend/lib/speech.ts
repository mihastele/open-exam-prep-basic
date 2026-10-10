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

// --- Podcast playback -------------------------------------------------------
// Reading a whole episode as one utterance gives no controls, no highlighting,
// and hits browser limits on long text. Speak one line at a time instead: the UI
// can follow along, jump anywhere, and give each host a distinct voice.

export type ScriptLine = { text: string; host?: 0 | 1 };

export type ScriptPlayer = {
  pause: () => void;
  resume: () => void;
  jump: (index: number) => void;
  stop: () => void;
};

/** Up to two English voices, so ADA and BEN do not sound identical. */
function hostVoices(): SpeechSynthesisVoice[] {
  const all = window.speechSynthesis.getVoices?.() ?? [];
  const english = all.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  const pool = english.length ? english : all;
  if (!pool.length) return [];
  const preferred = [
    "Google UK English Female",
    "Google US English",
    "Samantha",
    "Karen",
    "Daniel",
    "Alex",
  ];
  const rank = (v: SpeechSynthesisVoice) => {
    const hit = preferred.findIndex((p) => v.name.includes(p));
    return hit === -1 ? preferred.length : hit;
  };
  return [...pool].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
}

/**
 * Create a line-by-line script reader. Call `jump(i)` to start at a line; the
 * player reports the current line through `onIndex` and plays to the end.
 */
export function createScriptPlayer(
  lines: ScriptLine[],
  opts: { rate?: number; onIndex?: (i: number) => void; onDone?: () => void } = {}
): ScriptPlayer | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  const voices = hostVoices();
  let token = 0;
  let paused = false;
  let stopped = false;

  const say = (i: number, mine: number) => {
    if (stopped || mine !== token) return;
    if (i >= lines.length) {
      opts.onDone?.();
      return;
    }
    const line = lines[i];
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = "en-US";
    u.rate = opts.rate ?? 1;
    // Two hosts must not sound like one person even with a single voice.
    u.pitch = line.host === 1 ? 0.82 : 1.05;
    if (voices.length) u.voice = voices[Math.min(line.host ?? 0, voices.length - 1)];
    u.onstart = () => {
      if (mine === token) opts.onIndex?.(i);
    };
    u.onend = () => {
      if (mine === token && !paused) say(i + 1, mine);
    };
    u.onerror = () => {
      if (mine === token && !paused) say(i + 1, mine);
    };
    synth.speak(u);
  };

  return {
    jump(i: number) {
      token += 1;
      paused = false;
      synth.cancel();
      say(Math.max(0, i), token);
    },
    pause() {
      paused = true;
      synth.pause();
    },
    resume() {
      paused = false;
      synth.resume();
    },
    stop() {
      stopped = true;
      synth.cancel();
    },
  };
}
