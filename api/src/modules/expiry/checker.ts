import { readFile, rename, writeFile } from "node:fs/promises";
import { londonTime } from "../notify/daily.js";
import type { Notification } from "../notify/notifier.js";
import type { Problem } from "../system/alerts.js";
import { isRealDate, maxItems, type ExpiryItem } from "./list.js";

export type ExpiryStatus = ExpiryItem & {
  daysLeft: number;
  overdue: boolean;
};

export type Warned = { date: string; stage: number };

export type SentStore = {
  load(): Promise<Map<string, Warned> | null>;
  save(sent: Map<string, Warned>): Promise<void>;
};

export type CheckResult = "busy" | "list problem" | "too early" | "nothing due" | "sent" | "unsent";

export type ExpiryChecker = {
  run(now: Date): Promise<CheckResult>;
  list(now: Date): Promise<ExpiryStatus[]>;
  problems(): Problem[];
};

export const stages = [30, 14, 7, 3, 1, 0];
export const overdueStage = -1;
export const warnFromHour = 8;
export const urgentDays = 1;
const dayMs = 24 * 60 * 60 * 1000;

export function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs);
}

export function stageFor(daysLeft: number): number | null {
  if (daysLeft < 0) return overdueStage;
  return [...stages].reverse().find((stage) => daysLeft <= stage) ?? null;
}

export function statusFor(items: ExpiryItem[], now: Date): ExpiryStatus[] {
  const today = londonTime(now).day;
  return items
    .map((item) => {
      const daysLeft = daysBetween(today, item.date);
      return { ...item, daysLeft, overdue: daysLeft < 0 };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function dateText(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00Z`));
}

export function whenText(daysLeft: number): string {
  if (daysLeft > 1) return `in ${daysLeft} days`;
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === 0) return "today";
  if (daysLeft === -1) return "expired yesterday";
  return `expired ${-daysLeft} days ago`;
}

export function warningLine(item: ExpiryStatus): string {
  const when = item.daysLeft === 0 ? `${item.name} expires today.` : item.overdue ? `${item.name} ${whenText(item.daysLeft)}, on ${dateText(item.date)}.` : `${item.name} expires ${whenText(item.daysLeft)}, on ${dateText(item.date)}.`;
  return item.note === null ? when : `${when} Note: ${item.note}`;
}

export const warningMostBytes = 3_500;

export function warningFor(due: ExpiryStatus[]): Notification {
  const [first] = due;
  const title = due.length > 1 ? `Home Hub: ${due.length} expiry reminders` : first.overdue ? `Home Hub: ${first.name} has expired` : `Home Hub: ${first.name} expires ${whenText(first.daysLeft)}`;
  const urgent = due.some((item) => item.daysLeft <= urgentDays);
  const lines: string[] = [];
  let bytes = 0;
  for (const item of due) {
    const line = warningLine(item);
    bytes += Buffer.byteLength(line) + 1;
    if (bytes > warningMostBytes) break;
    lines.push(line);
  }
  if (lines.length < due.length) lines.push(`And ${due.length - lines.length} more: the hub page lists them all.`);
  return { title, message: lines.join("\n"), tags: "hourglass", ...(urgent ? { priority: 4 as const } : {}) };
}

export function expiringLine(items: ExpiryStatus[]): string | null {
  const soon = items.filter((item) => item.daysLeft <= stages[0]);
  if (soon.length === 0) return null;
  return `Expiring: ${soon.map((item) => `${item.name} ${whenText(item.daysLeft)}`).join(", ")}.`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSent(text: string): Map<string, Warned> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !isObject(parsed.sent)) return null;
  const sent = new Map<string, Warned>();
  for (const [name, value] of Object.entries(parsed.sent)) {
    if (sent.size >= maxItems) break;
    if (!isObject(value) || typeof value.date !== "string" || !isRealDate(value.date)) continue;
    if (typeof value.stage !== "number" || (value.stage !== overdueStage && !stages.includes(value.stage))) continue;
    sent.set(name, { date: value.date, stage: value.stage });
  }
  return sent;
}

export function writeSent(sent: Map<string, Warned>): string {
  return JSON.stringify({ sent: Object.fromEntries(sent) });
}

export function createSentStore(path: string): SentStore {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? new Map() : null;
      }
      return readSent(text);
    },
    async save(sent) {
      const temporary = `${path}.tmp`;
      try {
        await writeFile(temporary, writeSent(sent), { mode: 0o600 });
        await rename(temporary, path);
      } catch {
        throw new Error("Couldn't save the expiry warnings already sent");
      }
    },
  };
}

export function createExpiryChecker(options: {
  load: () => Promise<ExpiryItem[]>;
  store: SentStore;
  send: (notification: Notification) => Promise<void>;
  listProblem?: (message: string | null) => void;
  warn?: (message: string) => void;
}): ExpiryChecker {
  let sent: Map<string, Warned> | null = null;
  let listProblem: string | null = null;
  let saveFailed = false;
  let running = false;

  async function list(now: Date): Promise<ExpiryStatus[]> {
    let items: ExpiryItem[];
    try {
      items = await options.load();
    } catch (error) {
      const message = `The expiry list has a problem: ${error instanceof Error ? error.message : "it couldn't be read"}`;
      if (message !== listProblem) options.listProblem?.(message);
      listProblem = message;
      throw new Error(message);
    }
    if (listProblem !== null) options.listProblem?.(null);
    listProblem = null;
    return statusFor(items, now);
  }

  async function check(now: Date): Promise<CheckResult> {
    let items: ExpiryStatus[];
    try {
      items = await list(now);
    } catch {
      return "list problem";
    }
    if (londonTime(now).hour < warnFromHour) return "too early";
    if (sent === null) {
      const loaded = await options.store.load();
      if (loaded === null) options.warn?.("The expiry warnings already sent couldn't be read, so one may be sent again");
      sent = loaded ?? new Map();
    }
    const before = sent;
    const due = items.filter((item) => {
      const stage = stageFor(item.daysLeft);
      const last = before.get(item.name);
      return stage !== null && (last === undefined || last.date !== item.date || stage < last.stage);
    });
    if (due.length === 0) return "nothing due";
    try {
      await options.send(warningFor(due));
    } catch {
      return "unsent";
    }
    const next = new Map<string, Warned>();
    for (const item of items) {
      const stage = stageFor(item.daysLeft);
      const last = before.get(item.name);
      if (due.includes(item) && stage !== null) next.set(item.name, { date: item.date, stage });
      else if (last !== undefined && last.date === item.date) next.set(item.name, last);
    }
    sent = next;
    try {
      await options.store.save(next);
      saveFailed = false;
    } catch {
      saveFailed = true;
    }
    return "sent";
  }

  return {
    list,
    async run(now) {
      if (running) return "busy";
      running = true;
      try {
        return await check(now);
      } finally {
        running = false;
      }
    },
    problems() {
      const found: Problem[] = [];
      if (listProblem !== null) found.push({ code: "expiry-list", message: `${listProblem}.` });
      if (saveFailed) found.push({ code: "expiry-state", message: "The expiry checker couldn't save which warnings it has sent, so it may send one again after a restart." });
      return found;
    },
  };
}
