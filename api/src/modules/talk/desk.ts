import { randomBytes } from "node:crypto";

export const talkRate = 16_000;
export const mostTalkSeconds = 30;
export const mostTalkBytes = talkRate * 2 * mostTalkSeconds;
export const leastTalkBytes = talkRate / 2;
export const mostVoiceBytes = 6 * 1024 * 1024;
export const mostVoicePieces = 120;
export const mostTextChars = 4000;
export const mostQuestionChars = 500;
export const mostWaiting = 3;
export const mostKept = 20;
export const seenMs = 45_000;
export const pickUpMs = 60_000;
export const askMs = 60_000;
export const workMs = 6 * 60_000;
export const keptMs = 10 * 60_000;
export const idPattern = /^[0-9a-f]{16}$/;

export type TalkState = "waiting" | "taken" | "heard" | "asking" | "answered" | "failed";

export type TalkView = { id: string; state: TalkState; heard: string | null; text: string | null; question: string | null; asks: number; voiceComing: boolean; voice: boolean; voices: number };

export type Added = { id: string } | { refused: string; status: 400 | 409 | 503 };

export type Changed = "done" | "unknown" | "wrong state" | "too big";

type Entry = {
  id: string;
  state: TalkState;
  audio: Buffer | null;
  heard: string | null;
  text: string | null;
  question: string | null;
  askedAt: number | null;
  asks: number;
  answer: "yes" | "no" | null;
  voiceComing: boolean;
  voices: Buffer[];
  voiceBytes: number;
  voiceDone: boolean;
  addedAt: number;
};

export type TalkDesk = {
  jarvisSeen(at: number): boolean;
  add(audio: Buffer, at: number): Added;
  take(at: number): { id: string; audio: Buffer } | null;
  waitForWork(ms: number, signal: AbortSignal): Promise<void>;
  sweep(at: number): void;
  view(id: string, at: number): TalkView | null;
  heard(id: string, text: string, at: number): Changed;
  reply(id: string, text: string, voiceComing: boolean, at: number): Changed;
  fail(id: string, text: string, at: number): Changed;
  ask(id: string, question: string, at: number): Changed;
  answer(id: string, yes: boolean, at: number): Changed;
  answerFor(id: string, at: number): { answer: "yes" | "no" | null } | null;
  addVoice(id: string, wav: Buffer, at: number, part?: number): Changed;
  voiceDone(id: string, at: number): Changed;
  noVoice(id: string, at: number): Changed;
  voiceOf(id: string, at: number, part?: number): Buffer | null;
};

export function tidyText(text: string, most: number): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, most);
}

export function isWav(sound: Buffer): boolean {
  return sound.length > 44 && sound.toString("latin1", 0, 4) === "RIFF" && sound.toString("latin1", 8, 12) === "WAVE";
}

export function createTalkDesk(makeId: () => string = () => randomBytes(8).toString("hex")): TalkDesk {
  const entries = new Map<string, Entry>();
  const waiters = new Set<() => void>();
  let lastSeen = -Infinity;

  function sweep(at: number): void {
    for (const entry of entries.values()) {
      if (at - entry.addedAt > keptMs) entries.delete(entry.id);
      else if (entry.state === "waiting" && at - entry.addedAt > pickUpMs) {
        entry.state = "failed";
        entry.audio = null;
        entry.text = "Jarvis didn't pick it up within a minute.";
      } else if ((entry.state === "taken" || entry.state === "heard" || entry.state === "asking") && at - entry.addedAt > workMs) {
        entry.state = "failed";
        entry.text = "Jarvis stopped before he answered.";
        entry.question = null;
        entry.askedAt = null;
      } else if (entry.state === "asking" && entry.askedAt !== null && at - entry.askedAt > askMs) {
        entry.state = "heard";
        entry.question = null;
        entry.askedAt = null;
      }
    }
  }

  function found(id: string, at: number): Entry | null {
    sweep(at);
    return entries.get(id) ?? null;
  }

  function change(id: string, at: number, from: TalkState[], apply: (entry: Entry) => void): Changed {
    const entry = found(id, at);
    if (entry === null) return "unknown";
    if (!from.includes(entry.state)) return "wrong state";
    apply(entry);
    return "done";
  }

  return {
    jarvisSeen(at) {
      return at - lastSeen <= seenMs;
    },
    add(audio, at) {
      sweep(at);
      if (audio.length < leastTalkBytes) return { refused: "That recording was too short to hear anything", status: 400 };
      if (audio.length > mostTalkBytes) return { refused: `Recordings can be at most ${mostTalkSeconds} seconds`, status: 400 };
      if (audio.length % 2 !== 0) return { refused: "That recording isn't 16-bit sound", status: 400 };
      if (at - lastSeen > seenMs) return { refused: "Jarvis isn't running on the server", status: 503 };
      const waiting = [...entries.values()].filter((entry) => entry.state === "waiting").length;
      if (waiting >= mostWaiting) return { refused: `${mostWaiting} recordings are already waiting for Jarvis`, status: 409 };
      while (entries.size >= mostKept) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      const id = makeId();
      entries.set(id, { id, state: "waiting", audio, heard: null, text: null, question: null, askedAt: null, asks: 0, answer: null, voiceComing: false, voices: [], voiceBytes: 0, voiceDone: false, addedAt: at });
      for (const wake of [...waiters]) wake();
      return { id };
    },
    take(at) {
      sweep(at);
      lastSeen = at;
      for (const entry of entries.values()) {
        if (entry.state !== "waiting" || entry.audio === null) continue;
        const audio = entry.audio;
        entry.audio = null;
        entry.state = "taken";
        return { id: entry.id, audio };
      }
      return null;
    },
    waitForWork(ms, signal) {
      return new Promise((resolve) => {
        if (signal.aborted) return resolve();
        const done = () => {
          clearTimeout(timer);
          waiters.delete(done);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        waiters.add(done);
        signal.addEventListener("abort", done, { once: true });
      });
    },
    sweep,
    view(id, at) {
      const entry = found(id, at);
      if (entry === null) return null;
      return { id: entry.id, state: entry.state, heard: entry.heard, text: entry.text, question: entry.state === "asking" ? entry.question : null, asks: entry.asks, voiceComing: entry.voiceComing && !entry.voiceDone, voice: entry.voices.length > 0, voices: entry.voices.length };
    },
    heard(id, text, at) {
      return change(id, at, ["taken"], (entry) => {
        entry.state = "heard";
        entry.heard = tidyText(text, mostTextChars);
      });
    },
    reply(id, text, voiceComing, at) {
      return change(id, at, ["taken", "heard", "asking"], (entry) => {
        entry.state = "answered";
        entry.voiceComing = voiceComing;
        entry.text = tidyText(text, mostTextChars);
        entry.question = null;
        entry.askedAt = null;
      });
    },
    fail(id, text, at) {
      return change(id, at, ["taken", "heard", "asking"], (entry) => {
        entry.state = "failed";
        entry.text = tidyText(text, mostTextChars);
        entry.question = null;
        entry.askedAt = null;
      });
    },
    ask(id, question, at) {
      return change(id, at, ["taken", "heard"], (entry) => {
        entry.state = "asking";
        entry.question = tidyText(question, mostQuestionChars);
        entry.askedAt = at;
        entry.asks += 1;
        entry.answer = null;
      });
    },
    answer(id, yes, at) {
      return change(id, at, ["asking"], (entry) => {
        entry.state = "heard";
        entry.answer = yes ? "yes" : "no";
        entry.question = null;
        entry.askedAt = null;
      });
    },
    answerFor(id, at) {
      const entry = found(id, at);
      if (entry === null) return null;
      const answer = entry.answer;
      entry.answer = null;
      return { answer };
    },
    addVoice(id, wav, at, part) {
      const entry = found(id, at);
      if (entry === null) return "unknown";
      if (entry.state !== "answered" || entry.voiceDone) return "wrong state";
      if (part === undefined ? entry.voices.length > 0 : part !== entry.voices.length) return "wrong state";
      if (entry.voices.length >= mostVoicePieces || entry.voiceBytes + wav.length > mostVoiceBytes) return "too big";
      entry.voices.push(wav);
      entry.voiceBytes += wav.length;
      if (part === undefined) entry.voiceDone = true;
      return "done";
    },
    voiceDone(id, at) {
      const entry = found(id, at);
      if (entry === null) return "unknown";
      if (entry.state !== "answered" || entry.voiceDone || entry.voices.length === 0) return "wrong state";
      entry.voiceDone = true;
      return "done";
    },
    noVoice(id, at) {
      const entry = found(id, at);
      if (entry === null) return "unknown";
      if (entry.state !== "answered" || entry.voiceDone) return "wrong state";
      entry.voiceComing = false;
      entry.voiceDone = true;
      return "done";
    },
    voiceOf(id, at, part = 0) {
      return found(id, at)?.voices[part] ?? null;
    },
  };
}
