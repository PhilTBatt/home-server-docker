import { readFile, rename, writeFile } from "node:fs/promises";
import type { EventSink } from "../events/feed.js";
import { clockText, londonNow } from "../trains/alerts.js";

export const brightenMinutes = 15;
export const soundMinutes = 5;
export const speakEveryMinutes = 2;
export const windowMinutes = 60;
export const snoozeMinutes = 5;
export const earlyMinutes = 120;
export const earliestAt = 4 * 60;
export const latestAt = 11 * 60;
export const morningBys = ["phone", "voice"] as const;

export type MorningBy = (typeof morningBys)[number];
export type MorningSettings = { at: number; days: string[] };
export type MorningPhase = "none" | "skipped" | "before" | "early" | "brightening" | "sound" | "speaking" | "snoozed" | "up" | "over";
export type MorningView = { phase: MorningPhase; day: string; at: string; speakSlot: number | null; upAt: string | null; by: MorningBy | null; snoozedUntil: string | null };
export type MorningDay = { day: string; upAt: string | null; by: MorningBy | null; snoozedUntil: string | null };
export type MorningStore = { load(): Promise<MorningDay | "missing" | null>; save(day: MorningDay): Promise<void> };
export type MorningLog = { info?: (fields: Record<string, unknown>, message: string) => void; warn?: (fields: Record<string, unknown>, message: string) => void };
export type MorningAnswer = { done: true; view: MorningView } | { refused: string };
export type Morning = { load(now: Date): Promise<void>; view(now: Date): MorningView; up(by: MorningBy, now: Date): Promise<MorningAnswer>; snooze(by: MorningBy, now: Date): Promise<MorningAnswer> };

export const notWakingTime = "It isn't near wake-up time, so there's nothing to stop";
export const notSpeakingTime = "Jarvis isn't saying morning yet, so there's nothing to put off";

export function isMorningBy(value: unknown): value is MorningBy {
  return typeof value === "string" && (morningBys as readonly string[]).includes(value);
}

export function readMorningAt(text: string): number | null {
  const match = /^(\d\d):(\d\d)$/.exec(text);
  if (match === null) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes >= earliestAt && minutes <= latestAt ? minutes : null;
}

function readDay(text: string): MorningDay | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const fields = parsed as Record<string, unknown>;
  const isTime = (value: unknown) => value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
  if (typeof fields.day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(fields.day) || !isTime(fields.upAt) || !isTime(fields.snoozedUntil) || !(fields.by === null || isMorningBy(fields.by))) return null;
  return { day: fields.day, upAt: fields.upAt as string | null, by: fields.by as MorningBy | null, snoozedUntil: fields.snoozedUntil as string | null };
}

export function createMorningStore(path: string): MorningStore {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : null;
      }
      return readDay(text);
    },
    async save(day) {
      const temporary = `${path}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(day), { mode: 0o600 });
        await rename(temporary, path);
      } catch {
        throw new Error("Couldn't save the morning");
      }
    },
  };
}

export function createMorning(options: { settings: MorningSettings; store: MorningStore; mode?: () => string | null; log?: MorningLog; events?: EventSink }): Morning {
  const { settings, store, log, events } = options;
  let today: MorningDay | null = null;

  const kept = (day: string): MorningDay => (today !== null && today.day === day ? today : { day, upAt: null, by: null, snoozedUntil: null });

  const view = (now: Date): MorningView => {
    const london = londonNow(now);
    const mine = kept(london.day);
    const base = { day: london.day, at: clockText(settings.at), upAt: mine.upAt, by: mine.by, snoozedUntil: null, speakSlot: null };
    const m = london.minutes;
    const end = settings.at + windowMinutes;
    if (!settings.days.includes(london.weekday)) return { ...base, phase: "none" };
    const mode = options.mode?.() ?? null;
    if (mode === "away" || mode === "guest") return { ...base, phase: "skipped" };
    if (mine.upAt !== null) return { ...base, phase: m < end ? "up" : "over" };
    if (m < settings.at - earlyMinutes) return { ...base, phase: "before" };
    if (m < settings.at - brightenMinutes) return { ...base, phase: "early" };
    if (m < settings.at - soundMinutes) return { ...base, phase: "brightening" };
    if (m < settings.at) return { ...base, phase: "sound" };
    if (m >= end) return { ...base, phase: "over" };
    if (mine.snoozedUntil !== null && Date.parse(mine.snoozedUntil) > now.getTime()) return { ...base, phase: "snoozed", snoozedUntil: mine.snoozedUntil };
    return { ...base, phase: "speaking", speakSlot: Math.floor((m - settings.at) / speakEveryMinutes) };
  };

  const keep = async (day: MorningDay) => {
    today = day;
    try {
      await store.save(day);
    } catch {
      log?.warn?.({ morning: { day: day.day } }, "the morning couldn't be saved, so a restart today would start it again");
    }
  };

  return {
    async load(now) {
      const saved = await store.load().catch(() => null);
      if (saved === null) log?.warn?.({}, "the saved morning couldn't be read, so today starts fresh");
      today = saved === null || saved === "missing" ? null : saved;
      const shown = view(now);
      log?.info?.({ morning: { at: shown.at, days: settings.days.join(","), phase: shown.phase, up: shown.upAt !== null } }, "the morning at start");
    },
    view,
    async up(by, now) {
      const before = view(now);
      if (before.phase === "up") return { done: true, view: before };
      if (!["early", "brightening", "sound", "speaking", "snoozed"].includes(before.phase)) return { refused: notWakingTime };
      await keep({ ...kept(before.day), upAt: now.toISOString(), by, snoozedUntil: null });
      log?.info?.({ morning: { by, was: before.phase, slot: before.speakSlot } }, "up for the morning");
      events?.post("morning.up", { by }, now);
      return { done: true, view: view(now) };
    },
    async snooze(by, now) {
      const before = view(now);
      if (before.phase !== "speaking" && before.phase !== "snoozed") return { refused: notSpeakingTime };
      const until = new Date(now.getTime() + snoozeMinutes * 60_000).toISOString();
      await keep({ ...kept(before.day), snoozedUntil: until });
      log?.info?.({ morning: { by, slot: before.speakSlot } }, "the morning was put off for five minutes");
      return { done: true, view: view(now) };
    },
  };
}
