import { readFile, rename, writeFile } from "node:fs/promises";
import type { Notification } from "../notify/notifier.js";
import { clockText, londonNow } from "../trains/alerts.js";

export const modeNames = ["normal", "guest", "bedtime", "gaming", "coding", "away"] as const;
export const askedBy = ["voice", "typed", "phone", "owner"] as const;

export type Mode = (typeof modeNames)[number];
export type AskedBy = (typeof askedBy)[number];
export type ModeBy = AskedBy | "schedule" | "start";
export type ModeSettings = { bedtimeFrom: number | null; bedtimeUntil: number | null };
export type ModeState = { mode: Mode; since: string; until: string | null; by: ModeBy };
export type ModeView = ModeState & { held: number };
export type Saved = ModeState & { held: number; bedtimeDay: string | null };
export type Asked = { mode: Mode; until: Date | null; by: AskedBy };
export type SetResult = { view: ModeView } | { refused: string };
export type Scheduled = "switched" | "already" | "skipped while away" | "skipped while guest";

export type ModeStore = {
  load(): Promise<Saved | "missing" | null>;
  save(saved: Saved): Promise<void>;
};

export type ModeLog = {
  info?: (fields: Record<string, unknown>, message: string) => void;
  warn?: (fields: Record<string, unknown>, message: string) => void;
};

export type Modes = {
  load(now: Date): Promise<void>;
  view(): ModeView;
  set(asked: Asked, now: Date): Promise<SetResult>;
  scheduled(mode: Mode, now: Date): Promise<Scheduled>;
  take(topic: string, notification: Notification, now: Date): boolean;
  tick(now: Date): Promise<void>;
};

type Held = { topic: string; notification: Notification; at: Date };

export const tickMs = 30_000;
export const mostHeld = 100;
export const heldMostBytes = 3_500;
export const latestBedtimeFrom = 5 * 60 + 59;
export const latestBedtimeUntil = 11 * 60 + 59;
export const untilMostMs: Partial<Record<Mode, number>> = { away: 30 * 24 * 60 * 60 * 1000, bedtime: 24 * 60 * 60 * 1000 };
const dayMs = 24 * 60 * 60 * 1000;
const fromSchedule: readonly Mode[] = ["normal", "gaming", "coding"];

export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + dayMs).toISOString().slice(0, 10);
}

export function londonAt(day: string, minutes: number): Date {
  const midnight = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  for (const offset of [60, 0]) {
    const at = new Date(midnight - offset * 60_000);
    const seen = londonNow(at);
    if (seen.day === day && seen.minutes === minutes) return at;
  }
  return new Date(midnight);
}

export function nextLondon(now: Date, minutes: number): Date {
  const today = londonNow(now).day;
  const at = londonAt(today, minutes);
  return at.getTime() > now.getTime() ? at : londonAt(nextDay(today), minutes);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
}

export function readSaved(text: string): Saved | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const mode = modeNames.find((name) => name === parsed.mode);
  const by = [...askedBy, "schedule", "start"].find((name) => name === parsed.by) as ModeBy | undefined;
  if (mode === undefined || by === undefined || !isTime(parsed.since)) return null;
  if (parsed.until !== null && !isTime(parsed.until)) return null;
  if (typeof parsed.held !== "number" || !Number.isSafeInteger(parsed.held) || parsed.held < 0) return null;
  if (parsed.bedtimeDay !== null && (typeof parsed.bedtimeDay !== "string" || !/^\d{4}-\d\d-\d\d$/.test(parsed.bedtimeDay))) return null;
  return { mode, since: parsed.since, until: parsed.until as string | null, by, held: parsed.held, bedtimeDay: parsed.bedtimeDay as string | null };
}

export function createModeStore(path: string): ModeStore {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : null;
      }
      return readSaved(text);
    },
    async save(saved) {
      const temporary = `${path}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
        await rename(temporary, path);
      } catch {
        throw new Error("Couldn't save the mode");
      }
    },
  };
}

function heldLine(held: Held): string {
  return `${clockText(londonNow(held.at).minutes)} ${held.notification.title}\n${held.notification.message}`;
}

export function heldNotification(held: Held[], more: number, lost: number): Notification {
  const lines: string[] = [];
  let bytes = 0;
  for (const one of held) {
    const line = heldLine(one);
    bytes += Buffer.byteLength(line) + 2;
    if (bytes > heldMostBytes) break;
    lines.push(line);
  }
  const left = held.length - lines.length + more;
  if (left > 0) lines.push(`And ${left} more.`);
  if (lost > 0) lines.push(`${lost} more ${lost === 1 ? "was" : "were"} held before the API restarted, and ${lost === 1 ? "is" : "are"} lost.`);
  const count = held.length + more;
  const title = count === 0 ? "Held during bedtime: lost in a restart" : `Held during bedtime: ${count} alert${count === 1 ? "" : "s"}`;
  return { title, message: lines.join("\n\n"), tags: "zzz" };
}

export function createModes(options: { store: ModeStore; settings: ModeSettings; send: (topic: string, notification: Notification) => Promise<void>; topic: string; log?: ModeLog }): Modes {
  const { settings, log } = options;
  let state: ModeState = { mode: "normal", since: new Date(0).toISOString(), until: null, by: "start" };
  let bedtimeDay: string | null = null;
  let held: Held[] = [];
  let more = 0;
  let lost = 0;
  let saving: Promise<void> = Promise.resolve();
  let flushing = false;

  const heldCount = () => held.length + more;

  function save(): Promise<void> {
    const snapshot: Saved = { ...state, held: heldCount(), bedtimeDay };
    saving = saving
      .then(() => options.store.save(snapshot))
      .catch(() => {
        log?.warn?.({ mode: snapshot.mode, held: snapshot.held }, "the mode couldn't be saved, so a restart may forget it");
      });
    return saving;
  }

  function untilFor(mode: Mode, asked: Date | null, now: Date): string | null {
    if (asked !== null) return asked.toISOString();
    if (mode === "bedtime" && settings.bedtimeUntil !== null) return nextLondon(now, settings.bedtimeUntil).toISOString();
    return null;
  }

  async function flush(now: Date): Promise<void> {
    if (flushing || state.mode === "bedtime" || (held.length === 0 && more === 0 && lost === 0)) return;
    flushing = true;
    try {
      const topics = [...new Set([...held.map((one) => one.topic), ...(held.length === 0 && options.topic !== "" ? [options.topic] : [])])];
      for (const [index, topic] of topics.entries()) {
        const these = held.filter((one) => one.topic === topic);
        const extra = index === 0 ? more : 0;
        const gone = index === 0 ? lost : 0;
        const notification = heldNotification(these, extra, gone);
        try {
          await options.send(topic, notification);
        } catch {
          log?.warn?.({ held: these.length + extra, lost: gone }, "the phone alerts held during bedtime couldn't be sent, and will be tried again");
          continue;
        }
        const sent = new Set(these);
        held = held.filter((one) => !sent.has(one));
        if (index === 0) {
          more = Math.max(0, more - extra);
          lost = Math.max(0, lost - gone);
        }
        log?.info?.({ sent: these.length + extra, lost: gone, bytes: Buffer.byteLength(notification.message), heldFromAt: these[0]?.at.toISOString() ?? null, sentAt: now.toISOString() }, "sent the phone alerts held during bedtime as one message");
      }
      await save();
    } finally {
      flushing = false;
    }
  }

  async function change(next: ModeState, now: Date): Promise<void> {
    const before = state;
    state = next;
    log?.info?.({ from: before.mode, to: next.mode, by: next.by, until: next.until, wasSince: before.since, held: heldCount() }, before.mode === next.mode ? "mode kept, with a new end or source" : "mode switched");
    await save();
    if (before.mode === "bedtime" && next.mode !== "bedtime") await flush(now);
  }

  return {
    async load(now) {
      const saved = await options.store.load();
      if (saved === null) log?.warn?.({}, "the saved mode couldn't be read, so it starts as normal");
      if (saved === null || saved === "missing") {
        state = { mode: "normal", since: now.toISOString(), until: null, by: "start" };
        log?.info?.({ mode: state.mode, saved: saved === "missing" ? "none" : "unreadable" }, "mode at start");
        await save();
        await this.tick(now);
        return;
      }
      state = { mode: saved.mode, since: saved.since, until: saved.until, by: saved.by };
      bedtimeDay = saved.bedtimeDay;
      lost = saved.held;
      log?.info?.({ mode: state.mode, since: state.since, until: state.until, by: state.by, lost }, "mode at start, as saved");
      if (lost > 0) log?.warn?.({ lost }, "phone alerts held during bedtime were lost when the API restarted");
      await this.tick(now);
    },
    view() {
      return { ...state, held: heldCount() };
    },
    async set(asked, now) {
      if (state.mode === "guest" && asked.mode !== "guest" && asked.by === "voice") {
        log?.info?.({ from: state.mode, to: asked.mode, by: asked.by }, "mode switch refused");
        return { refused: "Guest mode is switched off only by typing /guest off or from the phone page" };
      }
      const since = state.mode === asked.mode ? state.since : now.toISOString();
      await change({ mode: asked.mode, since, until: untilFor(asked.mode, asked.until, now), by: asked.by }, now);
      return { view: this.view() };
    },
    async scheduled(mode, now) {
      if (state.mode === "away" || state.mode === "guest") {
        log?.info?.({ from: state.mode, to: mode }, "timed mode switch skipped");
        return state.mode === "away" ? "skipped while away" : "skipped while guest";
      }
      if (state.mode === mode) return "already";
      await change({ mode, since: now.toISOString(), until: untilFor(mode, null, now), by: "schedule" }, now);
      return "switched";
    },
    take(topic, notification, now) {
      if (state.mode !== "bedtime") return false;
      if (held.length < mostHeld) held.push({ topic, notification, at: now });
      else more++;
      log?.info?.({ held: heldCount(), kind: notification.tags, priority: notification.priority ?? 3 }, "phone alert held for bedtime");
      void save();
      return true;
    },
    async tick(now) {
      if (state.until !== null && Date.parse(state.until) <= now.getTime()) {
        await change({ mode: "normal", since: now.toISOString(), until: null, by: "schedule" }, now);
      }
      const london = londonNow(now);
      const { bedtimeFrom, bedtimeUntil } = settings;
      if (bedtimeFrom !== null && bedtimeUntil !== null && bedtimeDay !== london.day && london.minutes >= bedtimeFrom && london.minutes < bedtimeUntil) {
        bedtimeDay = london.day;
        if (fromSchedule.includes(state.mode)) {
          await change({ mode: "bedtime", since: now.toISOString(), until: londonAt(london.day, bedtimeUntil).toISOString(), by: "schedule" }, now);
        } else {
          log?.info?.({ mode: state.mode }, state.mode === "bedtime" ? "bedtime was already on at its start time" : "bedtime's start time skipped");
          await save();
        }
      }
      await flush(now);
    },
  };
}
