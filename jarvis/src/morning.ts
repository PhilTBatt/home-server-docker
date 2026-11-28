import type { Speaker } from "./answer-speech.js";
import { beep, joinSound, silence } from "./beep.js";
import { clockReply, errorOf, hubAsk, reasonOf, requestIn, trainTimes } from "./code-words.js";
import { hubApiUrl } from "./hub-tools.js";
import { playSound } from "./speech.js";
import { pause } from "./wake.js";

export const morningPhases = ["none", "skipped", "before", "early", "brightening", "sound", "speaking", "snoozed", "up", "over"] as const;
export type MorningPhase = (typeof morningPhases)[number];
export type MorningView = { phase: MorningPhase; day: string; at: string; speakSlot: number | null };
export type MorningEvent = { kind: "morning"; view: MorningView } | { kind: "morning note"; line: string };
export type MorningNews = { events: AsyncIterable<MorningEvent> };
export type MorningAnswer = "up" | "snooze";
export type MorningHub = { answer(kind: MorningAnswer, signal: AbortSignal): Promise<MorningView> };
export type MorningDeps = { news: MorningNews; hub: MorningHub; loud(level: number | null): Promise<void>; sound(): Promise<void>; train(signal: AbortSignal): Promise<string | null>; volume: number };
export type MorningReply = { status: number; fields: Record<string, unknown> };
export type MorningWatchDeps = { ask: (signal: AbortSignal) => Promise<MorningReply>; signal: AbortSignal; pollMs?: number; wait?: (ms: number, signal: AbortSignal) => Promise<void> };

export const morningPollMs = 10_000;
export const morningSoundMs = 5_000;
export const morningTrainMs = 3_000;
export const quieterBy = 30;
export const louderBy = 10;
export const quietest = 10;
export const wakingPhases: readonly MorningPhase[] = ["early", "brightening", "sound", "speaking", "snoozed"];

export const morningOffNote = "the morning: the hub's morning is off, so set MORNING=on and MORNING_AT in api/.env and restart the hub, then start Jarvis again";
export const morningOldHubNote = "the morning: this hub doesn't have it yet, so rebuild it with docker compose up --build --wait api, then start Jarvis again";
export const morningBackNote = "the morning: the hub is answering again";
export const morningUpSay = "Good morning.";
export const morningSnoozeSay = "Five more minutes, then.";
export const morningFailedSay = "I couldn't tell the hub.";
export const morningHint = "Say I'm up, or five more minutes.";

export function morningUnreachableNote(why: string): string {
  return `the morning: couldn't ask the hub (${why}), so trying again every 10 seconds`;
}

export function readMorning(fields: Record<string, unknown>): MorningView | null {
  const { phase, day, at, speakSlot } = fields;
  if (typeof phase !== "string" || !(morningPhases as readonly string[]).includes(phase) || typeof day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(day) || typeof at !== "string" || !/^\d\d:\d\d$/.test(at)) return null;
  if (!(speakSlot === null || (typeof speakSlot === "number" && Number.isSafeInteger(speakSlot) && speakSlot >= 0 && speakSlot < 1000))) return null;
  if (phase === "speaking" && speakSlot === null) return null;
  return { phase: phase as MorningPhase, day, at, speakSlot };
}

export function askHubForMorning(token: string, url = hubApiUrl): MorningWatchDeps["ask"] {
  return (signal) => hubAsk("/morning", { headers: { Authorization: `Bearer ${token}` } }, signal, url);
}

export function watchMorning(deps: MorningWatchDeps): MorningNews {
  const wait = deps.wait ?? pause;
  async function* events(): AsyncGenerator<MorningEvent> {
    let failing: string | null = null;
    let last = "";
    while (!deps.signal.aborted) {
      let why: string | null = null;
      try {
        const reply = await deps.ask(deps.signal);
        const view = reply.status === 200 ? readMorning(reply.fields) : null;
        if (reply.status === 404 && typeof reply.fields.error === "string" && /switched off/i.test(reply.fields.error)) why = morningOffNote;
        else if (reply.status === 404) why = morningOldHubNote;
        else if (view === null) why = morningUnreachableNote(reply.status === 200 ? "its answer couldn't be read" : errorOf(reply.fields, reply.status));
        else {
          if (failing !== null) yield { kind: "morning note", line: morningBackNote };
          failing = null;
          const key = `${view.day} ${view.phase} ${view.speakSlot ?? ""}`;
          if (key !== last) {
            last = key;
            yield { kind: "morning", view };
          }
        }
      } catch (error) {
        if (deps.signal.aborted) return;
        why = morningUnreachableNote(reasonOf(error));
      }
      if (why !== null && why !== failing) yield { kind: "morning note", line: why };
      if (why !== null) failing = why;
      await wait(deps.pollMs ?? morningPollMs, deps.signal).catch(() => {});
    }
  }
  return { events: events() };
}

export function hubMorning(token: string, url = hubApiUrl): MorningHub {
  return {
    async answer(kind, signal) {
      const { status, fields } = await hubAsk(`/morning/${kind}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ by: "voice" }) }, signal, url);
      if (status !== 200) throw new Error(`the hub said: ${errorOf(fields, status)}`);
      const view = readMorning(fields);
      if (view === null) throw new Error("the hub's answer couldn't be read");
      return view;
    },
  };
}

const upWords = ["i'm up", "im up", "i am up", "i'm awake", "im awake", "i am awake", "i'm getting up", "im getting up", "i am getting up", "getting up", "i'm up now", "i'm awake now", "good morning", "morning"];
const snoozeWords = ["five more minutes", "5 more minutes", "five more mins", "5 more mins", "five minutes more", "give me five more minutes", "give me five minutes", "just five more minutes", "snooze", "snooze it"];

export function morningAnswerIn(said: string): MorningAnswer | null {
  const words = requestIn(said).replace(/^(?:ok|okay|alright|all right|yes|yeah) /, "");
  if (upWords.includes(words)) return "up";
  if (snoozeWords.includes(words)) return "snooze";
  return null;
}

export function morningLevel(volume: number, slot: number): number {
  return Math.min(100, Math.max(quietest, volume - quieterBy) + Math.max(0, slot) * louderBy);
}

export function soundLevel(volume: number): number {
  return Math.max(quietest, volume - quieterBy);
}

export function morningSay(now: Date, first: boolean, train: string | null): string {
  const time = clockReply("time", now).say;
  return first ? ["Good morning.", time, train, morningHint].filter((part) => part !== null).join(" ") : `${time} Time to get up.`;
}

export function morningSound(rate: number): Uint8Array {
  return joinSound([beep(rate, 523, 320), silence(rate, 160), beep(rate, 659, 320), silence(rate, 160), beep(rate, 784, 560)]);
}

export function firstTrain(token: string, url = hubApiUrl): (signal: AbortSignal) => Promise<string | null> {
  return async (signal) => {
    const reply = await trainTimes(token, signal, url, 1);
    return reply.say.startsWith("I couldn't") ? null : reply.say;
  };
}

export function morningWiring(options: { token: string; signal: AbortSignal; speaker: Speaker | null; volume: number; setVolume: ((level: number) => Promise<void>) | null; url?: string }): MorningDeps {
  const { speaker, volume, setVolume } = options;
  return {
    news: watchMorning({ ask: askHubForMorning(options.token, options.url), signal: options.signal }),
    hub: hubMorning(options.token, options.url),
    loud: async (level) => {
      await setVolume?.(level ?? volume);
    },
    sound: async () => {
      if (speaker === null) return;
      const rate = speaker.engine.sampleRate;
      await playSound(morningSound(rate), speaker.device, rate, (start) => {
        const player = speaker.startPlayer(start);
        speaker.lastPlayer.ended = player.ended ?? Promise.resolve();
        return player;
      }, AbortSignal.any([options.signal, AbortSignal.timeout(morningSoundMs)]));
    },
    train: firstTrain(options.token, options.url),
    volume,
  };
}
