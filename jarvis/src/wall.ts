import type { EarsVoice } from "./ears-client.js";
import { hubApiUrl } from "./hub-tools.js";
import type { Heard } from "./talk.js";

export const wallSendMs = 3_000;
export const heartbeatMs = 20_000;
export const gapMs = 250;
export const heardFlashMs = 1_200;
export const doneFlashMs = 2_500;
export const speakingLingerMs = 1_500;
export const wordsShownMs = 45_000;
export const mostSaidChars = 600;
export const slots = 5;

export type WallActivity = "waiting" | "heard" | "listening" | "thinking" | "looking" | "speaking" | "done" | "needs";
export type WallVoice = "owner" | "other" | "unknown";
export type WallHeard = { text: string; voice: WallVoice | null; slot: number | null };
export type WallReport = { activity: WallActivity; muted: boolean | null; heard: WallHeard | null; said: string | null };
export type WallAnswer = { text(delta: string): void; restart(): void; asking<T>(waiting: Promise<T>): Promise<T>; end(answered: boolean): void };
export type WallChat = { answer(): WallAnswer; listening(on: boolean): void; woke(): void; heard(heard: Heard): void; quiet: WallChat };
export type Wall = { chat: WallChat; during<T>(kind: "speaking" | "looking", work: () => Promise<T>): Promise<T>; speech(over: Promise<unknown>): void; muted(on: boolean | null): void; ready(): Promise<string>; close(): void };
export type WallSend = (report: WallReport, signal: AbortSignal) => Promise<void>;
export type WallDeps = { send: WallSend; now?: () => number; note?: (line: string) => void; heartbeatMs?: number; gapMs?: number };

export type Counts = { needs: number; playing: number; speakingUntil: number; looking: number; thinking: number; listening: boolean; heardUntil: number; doneUntil: number };

export const wallOnLine = "Wall: on, the hub is showing him";
export const wallOffLine = "Wall: the hub's WALL switch is off, so set WALL=on in api/.env and rebuild the hub, and the wall will pick him up";

export function wallProblemLine(why: string): string {
  return `Wall: couldn't tell the hub (${why}), so trying again every ${heartbeatMs / 1000} seconds`;
}

export function wallStoppedNote(why: string): string {
  return `wall: couldn't tell the hub (${why}), so the wall may be behind until it answers again`;
}

export const wallBackNote = "wall: the hub is answering again";

export function slotGiver(): (who: string) => number {
  const given = new Map<string, number>();
  return (who) => {
    const known = given.get(who);
    if (known !== undefined) return known;
    const slot = given.size % slots;
    given.set(who, slot);
    return slot;
  };
}

export function voiceOnWall(voice: EarsVoice | undefined, slotFor: (who: string) => number): { voice: WallVoice | null; slot: number | null } {
  if (voice === undefined) return { voice: null, slot: null };
  if (voice.owner) return { voice: "owner", slot: null };
  if (voice.who === null) return { voice: "unknown", slot: null };
  return { voice: "other", slot: slotFor(voice.who) };
}

export function activityOf(counts: Counts, at: number): WallActivity {
  if (counts.needs > 0) return "needs";
  if (counts.playing > 0 || at < counts.speakingUntil) return "speaking";
  if (at < counts.heardUntil) return "heard";
  if (counts.listening) return "listening";
  if (counts.looking > 0) return "looking";
  if (counts.thinking > 0) return "thinking";
  if (at < counts.doneUntil) return "done";
  return "waiting";
}

function tail(text: string): string {
  if (text.length <= mostSaidChars) return text;
  const cut = text.slice(text.length - mostSaidChars);
  const space = cut.indexOf(" ");
  return space === -1 || space > 40 ? cut : cut.slice(space + 1);
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWall(deps: WallDeps): Wall {
  const now = deps.now ?? (() => performance.now());
  const every = deps.heartbeatMs ?? heartbeatMs;
  const between = deps.gapMs ?? gapMs;
  const closing = new AbortController();
  const counts: Counts = { needs: 0, playing: 0, speakingUntil: 0, looking: 0, thinking: 0, listening: false, heardUntil: 0, doneUntil: 0 };
  let voices = 0;
  let doneDue = false;
  let muted: boolean | null = null;
  let heard: WallHeard | null = null;
  let said: string | null = null;
  let heardTimer: ReturnType<typeof setTimeout> | null = null;
  let saidTimer: ReturnType<typeof setTimeout> | null = null;
  const wakeTimers = new Set<ReturnType<typeof setTimeout>>();
  let dirty = true;
  let sending: Promise<void> | null = null;
  let failing: string | null = null;
  let first: Promise<string> | null = null;
  const slotFor = slotGiver();

  const idle = (at: number) => counts.needs === 0 && counts.playing === 0 && at >= counts.speakingUntil && counts.looking === 0 && counts.thinking === 0 && !counts.listening && voices === 0;

  const settle = () => {
    const at = now();
    if (doneDue && idle(at)) {
      doneDue = false;
      counts.doneUntil = at + doneFlashMs;
      wakeAt(counts.doneUntil);
    }
  };

  const report = (): WallReport => {
    settle();
    return { activity: activityOf(counts, now()), muted, heard, said };
  };

  const pump = () => {
    dirty = true;
    if (sending !== null || closing.signal.aborted) return;
    sending = (async () => {
      while (dirty && !closing.signal.aborted) {
        dirty = false;
        try {
          await deps.send(report(), AbortSignal.any([closing.signal, AbortSignal.timeout(wallSendMs)]));
          if (failing !== null) deps.note?.(wallBackNote);
          failing = null;
        } catch (error) {
          if (closing.signal.aborted) return;
          const why = reasonOf(error);
          if (failing === null) deps.note?.(wallStoppedNote(why));
          failing = why;
          return;
        }
        if (dirty && between > 0) await new Promise((resolve) => setTimeout(resolve, between));
      }
    })().finally(() => {
      sending = null;
      if (dirty && failing === null && !closing.signal.aborted) pump();
    });
  };

  const wakeAt = (at: number) => {
    const timer = setTimeout(() => {
      wakeTimers.delete(timer);
      pump();
    }, Math.max(0, at - now()) + 5);
    timer.unref?.();
    wakeTimers.add(timer);
  };

  const beat = setInterval(pump, every);
  beat.unref?.();

  const forgetLater = (which: "heard" | "said") => {
    const old = which === "heard" ? heardTimer : saidTimer;
    if (old !== null) clearTimeout(old);
    const timer = setTimeout(() => {
      if (which === "heard") heard = null;
      else said = null;
      pump();
    }, wordsShownMs);
    timer.unref?.();
    if (which === "heard") heardTimer = timer;
    else saidTimer = timer;
  };

  const makeChat = (words: boolean): WallChat => {
    const chat: WallChat = {
      answer() {
        let ended = false;
        let text = "";
        counts.thinking++;
        if (words) {
          said = null;
          if (saidTimer !== null) clearTimeout(saidTimer);
          saidTimer = null;
        }
        pump();
        return {
          text(delta) {
            if (!words || ended || delta === "") return;
            text = tail(text + delta);
            said = text.trim() === "" ? null : text.trim();
            pump();
          },
          restart() {
            if (!words || ended) return;
            text = "";
            said = null;
            pump();
          },
          async asking(waiting) {
            counts.needs++;
            pump();
            try {
              return await waiting;
            } finally {
              counts.needs--;
              pump();
            }
          },
          end(answered) {
            if (ended) return;
            ended = true;
            counts.thinking--;
            if (answered) doneDue = true;
            if (words && said !== null) forgetLater("said");
            pump();
          },
        };
      },
      listening(on) {
        if (counts.listening === on) return;
        counts.listening = on;
        pump();
      },
      woke() {
        counts.heardUntil = now() + heardFlashMs;
        wakeAt(counts.heardUntil);
        pump();
      },
      heard(got) {
        if (!words) return;
        const text = got.text.replace(/\s+/g, " ").trim();
        if (text === "") return;
        heard = { text, ...voiceOnWall(got.voice, slotFor) };
        forgetLater("heard");
        pump();
      },
      get quiet() {
        return words ? makeChat(false) : chat;
      },
    };
    return chat;
  };

  return {
    chat: makeChat(true),
    async during(kind, work) {
      if (kind === "speaking") counts.playing++;
      else counts.looking++;
      pump();
      try {
        return await work();
      } finally {
        if (kind === "speaking") {
          counts.playing--;
          counts.speakingUntil = now() + speakingLingerMs;
          wakeAt(counts.speakingUntil);
        } else counts.looking--;
        pump();
      }
    },
    speech(over) {
      voices++;
      const end = () => {
        voices--;
        pump();
      };
      void over.then(end, end);
    },
    muted(on) {
      if (muted === on) return;
      muted = on;
      pump();
    },
    ready() {
      first ??= deps.send(report(), AbortSignal.any([closing.signal, AbortSignal.timeout(wallSendMs)])).then(
        () => wallOnLine,
        (error: unknown) => {
          const why = reasonOf(error);
          failing = why;
          return why === wallOffWhy ? wallOffLine : wallProblemLine(why);
        },
      );
      return first;
    },
    close() {
      closing.abort();
      clearInterval(beat);
      for (const timer of wakeTimers) clearTimeout(timer);
      wakeTimers.clear();
      if (heardTimer !== null) clearTimeout(heardTimer);
      if (saidTimer !== null) clearTimeout(saidTimer);
    },
  };
}

export const wallOffWhy = "the hub's WALL switch is off";

export function playOnWall<Parts extends { play: (sound: Uint8Array, signal: AbortSignal) => Promise<void> }>(parts: Parts, wall: Wall | undefined): Parts {
  if (wall === undefined) return parts;
  return { ...parts, play: (sound: Uint8Array, signal: AbortSignal) => wall.during("speaking", () => parts.play(sound, signal)) };
}

export function lookingOnWall<Ask extends (question: string, signal: AbortSignal) => Promise<unknown>>(ask: Ask, wall: Wall | undefined): Ask {
  if (wall === undefined) return ask;
  return ((question: string, signal: AbortSignal) => wall.during("looking", () => ask(question, signal))) as Ask;
}

export function hubWall(token: string, url = hubApiUrl): WallSend {
  return async (report, signal) => {
    const response = await fetch(`${url}/wall/jarvis`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(report), redirect: "error", signal });
    await response.body?.cancel().catch(() => {});
    if (response.status === 404) throw new Error(wallOffWhy);
    if (response.status === 401) throw new Error("the hub refused his token");
    if (response.status !== 200) throw new Error(`the hub answered ${response.status}`);
  };
}
