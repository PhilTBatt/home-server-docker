import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { Notification } from "../notify/notifier.js";
import type { EventSink } from "../events/feed.js";
import { londonAt, modeNames, nextDay, type Mode, type Modes } from "../modes/modes.js";
import { clockText, londonNow } from "../trains/alerts.js";

export const repeats = ["daily", "weekdays", "weekly"] as const;
export const kinds = ["reminder", "mode"] as const;

export type Repeat = (typeof repeats)[number];
export type Kind = (typeof kinds)[number];

export type Reminder = {
  id: string;
  text: string;
  kind: Kind;
  mode: Mode | null;
  first: string;
  at: string | null;
  repeat: Repeat | null;
  urgent: boolean;
  snoozedTo: string | null;
  firedAt: string | null;
  createdAt: string;
};

export type Due = { seq: number; id: string; text: string; at: string; late: boolean; urgent: boolean; addedAt: string };
export type DueAnswer = { seq: number; due: Omit<Due, "seq" | "addedAt">[] };
export type Kept = { seq: number; reminders: Reminder[]; due: Due[] };
export type Asked = { text: string; at: Date; repeat: Repeat | null; urgent: boolean; kind: Kind; mode: Mode | null };

export type ReminderStore = {
  load(): Promise<Kept | "missing" | null>;
  save(kept: Kept): Promise<void>;
};

export type ReminderLog = {
  info?: (fields: Record<string, unknown>, message: string) => void;
  warn?: (fields: Record<string, unknown>, message: string) => void;
};

export type Reminders = {
  load(now: Date): Promise<void>;
  add(asked: Asked, now: Date): Promise<{ added: Reminder } | { refused: string }>;
  list(): Reminder[];
  cancel(id: string, now: Date): Promise<boolean>;
  snooze(id: string, minutes: number, now: Date): Promise<{ snoozed: Reminder } | { refused: string } | null>;
  done(id: string, now: Date): Promise<{ done: Reminder | null } | null>;
  due(after: number): DueAnswer;
  tick(now: Date): Promise<void>;
};

export const tickMs = 5_000;
export const mostReminders = 50;
export const keptDue = 50;
export const keptDueMs = 24 * 60 * 60 * 1000;
export const firedKeptMs = 24 * 60 * 60 * 1000;
export const lateMs = 2 * 60 * 1000;
export const modeLateMs = 30 * 60 * 1000;
export const unsentKeptMs = 60 * 60 * 1000;
export const aheadMostMs = 366 * 24 * 60 * 60 * 1000;
export const idPattern = /^[0-9a-f]{8}$/;

function newId(): string {
  return randomBytes(4).toString("hex");
}

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function nextOccurrence(repeat: Repeat, first: Date, after: Date): Date {
  const base = londonNow(first);
  const weekday = weekdayOf(base.day);
  let day = londonNow(after).day;
  for (let i = 0; i < 9; i++) {
    const at = londonAt(day, base.minutes);
    const today = weekdayOf(day);
    const fits = repeat === "daily" || (repeat === "weekdays" && today >= 1 && today <= 5) || (repeat === "weekly" && today === weekday);
    if (fits && at.getTime() > after.getTime()) return at;
    day = nextDay(day);
  }
  return new Date(after.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
}

export function plainText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 1 || [...text].length > 200 || /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/.test(text)) return null;
  return text;
}

function readReminder(value: unknown): Reminder | null {
  if (!isObject(value)) return null;
  const kind = kinds.find((one) => one === value.kind);
  const repeat = value.repeat === null ? null : repeats.find((one) => one === value.repeat);
  const mode = value.mode === null ? null : modeNames.find((one) => one === value.mode);
  const text = plainText(value.text);
  if (typeof value.id !== "string" || !idPattern.test(value.id) || kind === undefined || repeat === undefined || mode === undefined || text === null) return null;
  if ((kind === "mode") !== (mode !== null) || typeof value.urgent !== "boolean" || !isTime(value.first) || !isTime(value.createdAt)) return null;
  for (const key of ["at", "snoozedTo", "firedAt"]) if (value[key] !== null && !isTime(value[key])) return null;
  return { id: value.id, text, kind, mode, first: value.first, at: value.at as string | null, repeat, urgent: value.urgent, snoozedTo: value.snoozedTo as string | null, firedAt: value.firedAt as string | null, createdAt: value.createdAt };
}

function readDue(value: unknown): Due | null {
  if (!isObject(value) || typeof value.seq !== "number" || !Number.isSafeInteger(value.seq) || value.seq < 1) return null;
  const text = plainText(value.text);
  if (typeof value.id !== "string" || !idPattern.test(value.id) || text === null || !isTime(value.at) || !isTime(value.addedAt) || typeof value.late !== "boolean" || typeof value.urgent !== "boolean") return null;
  return { seq: value.seq, id: value.id, text, at: value.at, late: value.late, urgent: value.urgent, addedAt: value.addedAt };
}

export function readKept(text: string): Kept | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || typeof parsed.seq !== "number" || !Number.isSafeInteger(parsed.seq) || parsed.seq < 0 || !Array.isArray(parsed.reminders) || !Array.isArray(parsed.due)) return null;
  const reminders = parsed.reminders.map(readReminder);
  const due = parsed.due.map(readDue);
  if (reminders.some((one) => one === null) || due.some((one) => one === null) || reminders.length > mostReminders) return null;
  return { seq: parsed.seq, reminders: reminders as Reminder[], due: due as Due[] };
}

export function createReminderStore(path: string): ReminderStore {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : null;
      }
      const kept = readKept(text);
      if (kept === null) await rename(path, `${path}.bad`).catch(() => {});
      return kept;
    },
    async save(kept) {
      const temporary = `${path}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(kept), { mode: 0o600 });
        await rename(temporary, path);
      } catch {
        throw new Error("Couldn't save the reminders");
      }
    },
  };
}

export function reminderSequence(id: string): string {
  return `reminder-${id}`;
}

export function reminderNotification(reminder: Reminder, dueAt: Date, late: boolean): Notification {
  const when = late ? ` (due at ${clockText(londonNow(dueAt).minutes)}, sent late because the hub was down)` : "";
  return { title: "Reminder", message: `${reminder.text}${when}`, tags: "alarm_clock", sequence: reminderSequence(reminder.id), ...(reminder.urgent ? { priority: 4 as const, urgent: true } : {}) };
}

export function snoozedNotification(reminder: Reminder, until: Date): Notification {
  return { title: "Reminder snoozed", message: `${reminder.text} (snoozed until ${clockText(londonNow(until).minutes)})`, tags: "zzz", priority: 2, sequence: reminderSequence(reminder.id), ...(reminder.urgent ? { urgent: true } : {}) };
}

function nextFire(reminder: Reminder): number | null {
  const times = [reminder.at, reminder.snoozedTo].filter((one): one is string => one !== null).map(Date.parse);
  return times.length === 0 ? null : Math.min(...times);
}

export function createReminders(options: { store: ReminderStore; send: (notification: Notification) => Promise<void>; clear?: (sequence: string) => Promise<void>; modes?: Modes; makeId?: () => string; log?: ReminderLog; events?: EventSink }): Reminders {
  const { log } = options;
  const makeId = options.makeId ?? newId;
  let reminders: Reminder[] = [];
  let feed: Due[] = [];
  let seq = 0;
  type Unsent = { notification: Notification; until: number; id: string };
  type Flight = { id: string; dropped: boolean };
  let unsent: Unsent[] = [];
  let retrying: Unsent[] = [];
  const flying = new Set<Flight>();
  const shows = new Map<string, Notification>();
  let saving: Promise<void> = Promise.resolve();
  let running = false;

  function save(): Promise<void> {
    const snapshot: Kept = { seq, reminders: reminders.map((one) => ({ ...one })), due: feed.map((one) => ({ ...one })) };
    saving = saving
      .then(() => options.store.save(snapshot))
      .catch(() => {
        log?.warn?.({ reminders: snapshot.reminders.length }, "the reminders couldn't be saved, so a restart may forget a change");
      });
    return saving;
  }

  async function send(notification: Notification, id: string, now: Date, again?: Unsent): Promise<boolean> {
    const flight: Flight = { id, dropped: false };
    flying.add(flight);
    let sent = false;
    try {
      await options.send(notification);
      sent = true;
    } catch {
      sent = false;
    } finally {
      flying.delete(flight);
    }
    if (sent && again !== undefined) log?.info?.({ id }, "a reminder that couldn't be sent before was sent");
    if (sent && flight.dropped) await settleDropped(id, now);
    if (!sent && !flight.dropped) {
      unsent.push(again ?? { notification, until: now.getTime() + unsentKeptMs, id });
      if (again === undefined) log?.warn?.({ id }, "a reminder couldn't be sent to the phone, and will be tried again");
    }
    return sent;
  }

  async function fire(reminder: Reminder, dueAt: number, now: Date): Promise<void> {
    const lateBy = now.getTime() - dueAt;
    const late = lateBy > lateMs;
    const snoozed = reminder.snoozedTo !== null && Date.parse(reminder.snoozedTo) === dueAt;
    if (snoozed) reminder.snoozedTo = null;
    else if (reminder.repeat !== null) reminder.at = nextOccurrence(reminder.repeat, new Date(reminder.first), now).toISOString();
    else reminder.at = null;
    if (reminder.kind === "mode") {
      const mode = reminder.mode as Mode;
      if (lateBy > modeLateMs) log?.info?.({ id: reminder.id, mode, lateSeconds: Math.round(lateBy / 1000) }, "a timed mode switch was skipped, being too late");
      else if (options.modes === undefined) log?.info?.({ id: reminder.id, mode }, "a timed mode switch was skipped, since modes are off");
      else log?.info?.({ id: reminder.id, mode, result: await options.modes.scheduled(mode, now), lateSeconds: Math.round(lateBy / 1000) }, "timed mode switch");
      if (reminder.repeat === null) reminders = reminders.filter((one) => one.id !== reminder.id);
      return;
    }
    reminder.firedAt = now.toISOString();
    seq++;
    feed.push({ seq, id: reminder.id, text: reminder.text, at: new Date(dueAt).toISOString(), late, urgent: reminder.urgent, addedAt: now.toISOString() });
    if (feed.length > keptDue) feed = feed.slice(-keptDue);
    dropUnsent(reminder.id);
    const notification = reminderNotification(reminder, new Date(dueAt), late);
    options.events?.post("reminder.due", { id: reminder.id, urgent: reminder.urgent, late }, now);
    shows.set(reminder.id, notification);
    const sent = await send(notification, reminder.id, now);
    log?.info?.({ id: reminder.id, seq, late, lateSeconds: Math.round(lateBy / 1000), urgent: reminder.urgent, repeat: reminder.repeat, snoozed, sent, next: reminder.at }, "reminder due");
  }

  async function check(now: Date): Promise<void> {
    const at = now.getTime();
    let changed = false;
    for (const reminder of [...reminders]) {
      const when = nextFire(reminder);
      if (when !== null && when <= at) {
        await fire(reminder, when, now);
        changed = true;
      }
    }
    const before = reminders.length;
    reminders = reminders.filter((one) => one.repeat !== null || nextFire(one) !== null || one.firedAt === null || Date.parse(one.firedAt) + firedKeptMs > at);
    for (const id of [...shows.keys()]) if (find(id) === undefined) shows.delete(id);
    if (reminders.length !== before) {
      log?.info?.({ removed: before - reminders.length }, "reminders that fired a day ago and weren't snoozed or done were removed");
      changed = true;
    }
    const feedBefore = feed.length;
    feed = feed.filter((one) => Date.parse(one.addedAt) + keptDueMs > at);
    if (feed.length !== feedBefore) changed = true;
    retrying = unsent;
    unsent = [];
    for (let one = retrying.shift(); one !== undefined; one = retrying.shift()) {
      if (one.until <= at) {
        log?.warn?.({ id: one.id }, "a reminder was never sent to the phone, and was dropped after an hour of tries");
        continue;
      }
      await send(one.notification, one.id, now, one);
    }
    if (changed) await save();
  }

  function find(id: string): Reminder | undefined {
    return reminders.find((one) => one.id === id);
  }

  function dropUnsent(id: string): number {
    const before = unsent.length + retrying.length;
    unsent = unsent.filter((one) => one.id !== id);
    retrying = retrying.filter((one) => one.id !== id);
    let dropped = before - unsent.length - retrying.length;
    for (const flight of flying) {
      if (flight.id === id && !flight.dropped) {
        flight.dropped = true;
        dropped++;
      }
    }
    return dropped;
  }

  async function settleDropped(id: string, now: Date): Promise<void> {
    const showing = shows.get(id);
    log?.info?.({ id, putBack: showing !== undefined }, "a reminder's old message reached the phone after it changed, so it's put right");
    if (showing !== undefined) {
      await send(showing, id, now);
      return;
    }
    await options.clear?.(reminderSequence(id)).catch(() => log?.warn?.({ id }, "a reminder's message couldn't be cleared from the phone"));
  }

  async function clearPhone(reminder: Reminder): Promise<boolean> {
    if (reminder.firedAt === null || options.clear === undefined) return false;
    try {
      await options.clear(reminderSequence(reminder.id));
      return true;
    } catch {
      log?.warn?.({ id: reminder.id }, "a reminder's message couldn't be cleared from the phone");
      return false;
    }
  }

  return {
    async load(now) {
      const kept = await options.store.load();
      if (kept === null) log?.warn?.({}, "the saved reminders couldn't be read, so they were moved to reminders.json.bad and it starts with none");
      if (kept !== null && kept !== "missing") {
        reminders = kept.reminders.map((one) => ({ ...one }));
        feed = kept.due.map((one) => ({ ...one }));
        seq = Math.max(kept.seq, ...kept.due.map((one) => one.seq));
      }
      const missed = reminders.filter((one) => (nextFire(one) ?? Infinity) <= now.getTime()).length;
      log?.info?.({ reminders: reminders.length, repeating: reminders.filter((one) => one.repeat !== null).length, modeSwitches: reminders.filter((one) => one.kind === "mode").length, missed, seq, saved: kept === "missing" ? "none" : kept === null ? "unreadable" : "read" }, "reminders at start");
      await this.tick(now);
    },
    async add(asked, now) {
      if (reminders.length >= mostReminders) return { refused: `${mostReminders} reminders are already set, the most at once: cancel one first` };
      if (asked.kind === "mode" && options.modes === undefined) return { refused: "Modes are switched off, so a timed mode switch can't be set" };
      let id = makeId();
      while (find(id) !== undefined || !idPattern.test(id)) id = newId();
      const at = asked.at.toISOString();
      const reminder: Reminder = { id, text: asked.text, kind: asked.kind, mode: asked.mode, first: at, at, repeat: asked.repeat, urgent: asked.urgent, snoozedTo: null, firedAt: null, createdAt: now.toISOString() };
      reminders.push(reminder);
      log?.info?.({ id, kind: reminder.kind, mode: reminder.mode, repeat: reminder.repeat, urgent: reminder.urgent, at, inMinutes: Math.round((asked.at.getTime() - now.getTime()) / 60_000), reminders: reminders.length }, "reminder set");
      await save();
      return { added: { ...reminder } };
    },
    list() {
      return reminders.map((one) => ({ ...one })).sort((a, b) => (nextFire(a) ?? Infinity) - (nextFire(b) ?? Infinity));
    },
    async cancel(id) {
      const reminder = find(id);
      if (reminder === undefined) return false;
      reminders = reminders.filter((one) => one.id !== id);
      shows.delete(id);
      const unsentDropped = dropUnsent(id);
      const cleared = await clearPhone(reminder);
      log?.info?.({ id, reminders: reminders.length, cleared, unsentDropped }, "reminder cancelled");
      await save();
      return true;
    },
    async snooze(id, minutes, now) {
      const reminder = find(id);
      if (reminder === undefined) return null;
      if (reminder.kind === "mode") return { refused: "A timed mode switch can't be snoozed: cancel it and set a new one" };
      const until = new Date(now.getTime() + minutes * 60_000);
      reminder.snoozedTo = until.toISOString();
      const unsentDropped = dropUnsent(id);
      const message = reminder.firedAt === null ? null : snoozedNotification(reminder, until);
      if (message !== null) shows.set(id, message);
      const replaced = message === null ? false : await send(message, id, now);
      log?.info?.({ id, minutes, repeat: reminder.repeat, replaced, unsentDropped }, "reminder snoozed");
      await save();
      return { snoozed: { ...reminder } };
    },
    async done(id) {
      const reminder = find(id);
      if (reminder === undefined) return null;
      shows.delete(id);
      const unsentDropped = dropUnsent(id);
      const cleared = await clearPhone(reminder);
      if (reminder.repeat === null) {
        reminders = reminders.filter((one) => one.id !== id);
        log?.info?.({ id, repeat: null, cleared, unsentDropped }, "reminder done");
        await save();
        return { done: null };
      }
      reminder.snoozedTo = null;
      log?.info?.({ id, repeat: reminder.repeat, cleared, unsentDropped }, "reminder done, and its next time kept");
      await save();
      return { done: { ...reminder } };
    },
    due(after) {
      return { seq, due: feed.filter((one) => one.seq > after).map(({ seq: _seq, addedAt: _added, ...rest }) => rest) };
    },
    async tick(now) {
      if (running) return;
      running = true;
      try {
        await check(now);
      } finally {
        running = false;
      }
    },
  };
}
