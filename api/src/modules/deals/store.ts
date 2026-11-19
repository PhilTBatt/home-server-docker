import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { maxSearches } from "./searches.js";

export type Seen = {
  first: string;
  last: string;
  price?: number;
  ending?: true;
};

export type SearchMemory = {
  criteria: string;
  since: string;
  checked: string;
  wide: boolean;
  known: boolean;
  seen: Map<string, Seen>;
};

export type Counters = {
  day: string;
  calls: number;
  alerts: number;
  capNoted: boolean;
};

export type Memory = {
  searches: Map<string, SearchMemory>;
  counters: Counters;
  alertsToday: Map<string, number>;
  snoozed: Map<string, string | null>;
};

export type Store = {
  load(): Promise<{ memory: Memory; note: string | null }>;
  save(memory: Memory): Promise<void>;
};

const maxFileLength = 48 * 1024 * 1024;
export const maxSeenPerSearch = 2000;
const searchIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const listingIdPattern = /^[A-Za-z0-9|:.-]{1,64}$/;
const dayPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function emptyMemory(): Memory {
  return { searches: new Map(), counters: { day: "", calls: 0, alerts: 0, capNoted: false }, alertsToday: new Map(), snoozed: new Map() };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function time(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 30) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function count(value: unknown, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : 0;
}

function readSeen(raw: unknown): Map<string, Seen> {
  const entries: [string, Seen][] = [];
  if (!isObject(raw)) return new Map();
  for (const [id, value] of Object.entries(raw)) {
    if (!listingIdPattern.test(id) || !isObject(value)) continue;
    const first = time(value.first);
    const last = time(value.last);
    if (first === null || last === null) continue;
    const price = value.price;
    const entry: Seen = typeof price === "number" && Number.isInteger(price) && price >= 0 && price <= 1_000_000_000 ? { first, last, price } : { first, last };
    if (value.ending === true) entry.ending = true;
    entries.push([id, entry]);
  }
  entries.sort((a, b) => b[1].last.localeCompare(a[1].last));
  return new Map(entries.slice(0, maxSeenPerSearch));
}

export function readMemory(text: string, keepSeen: boolean): Memory | null {
  if (text.length > maxFileLength) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !isObject(parsed.searches) || !isObject(parsed.counters)) return null;

  const memory = emptyMemory();
  const counters = parsed.counters;
  if (typeof counters.day === "string" && dayPattern.test(counters.day)) {
    memory.counters = { day: counters.day, calls: count(counters.calls, 1_000_000), alerts: count(counters.alerts, 1_000_000), capNoted: counters.capNoted === true };
    for (const [id, value] of Object.entries(isObject(parsed.alertsToday) ? parsed.alertsToday : {})) {
      if (memory.alertsToday.size >= maxSearches) break;
      if (searchIdPattern.test(id) && id.length <= 40 && count(value, 1_000_000) > 0) memory.alertsToday.set(id, count(value, 1_000_000));
    }
  }
  for (const [id, value] of Object.entries(isObject(parsed.snoozed) ? parsed.snoozed : {})) {
    if (memory.snoozed.size >= maxSearches) break;
    if (!searchIdPattern.test(id) || id.length > 40) continue;
    const until = value === null ? null : time(value);
    if (value === null || until !== null) memory.snoozed.set(id, until);
  }
  for (const [id, value] of Object.entries(parsed.searches)) {
    if (memory.searches.size >= maxSearches) break;
    if (!searchIdPattern.test(id) || id.length > 40 || !isObject(value)) continue;
    const since = time(value.since);
    const checked = time(value.checked);
    if (typeof value.criteria !== "string" || !/^[0-9a-f]{16}$/.test(value.criteria) || since === null || checked === null) continue;
    const known = keepSeen && isObject(value.seen);
    memory.searches.set(id, { criteria: value.criteria, since, checked, wide: value.wide === true, known, seen: known ? readSeen(value.seen) : new Map() });
  }
  return memory;
}

export function writeMemory(memory: Memory, keepSeen: boolean): string {
  const searches: Record<string, unknown> = {};
  for (const [id, search] of memory.searches) {
    const saved: Record<string, unknown> = { criteria: search.criteria, since: search.since, checked: search.checked, wide: search.wide };
    if (keepSeen && search.known) saved.seen = Object.fromEntries(search.seen);
    searches[id] = saved;
  }
  const saved: Record<string, unknown> = { counters: memory.counters, searches };
  if (memory.alertsToday.size > 0) saved.alertsToday = Object.fromEntries(memory.alertsToday);
  if (memory.snoozed.size > 0) saved.snoozed = Object.fromEntries(memory.snoozed);
  return JSON.stringify(saved);
}

export function createStore(path: string, keepSeen: boolean): Store {
  return {
    async load() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { memory: emptyMemory(), note: null };
        return { memory: emptyMemory(), note: "The deal watcher's state file couldn't be read, so every search started fresh." };
      }
      const memory = readMemory(text, keepSeen);
      if (memory !== null) return { memory, note: null };
      if (!keepSeen) {
        await rm(path, { force: true }).catch(() => undefined);
        return { memory: emptyMemory(), note: "The deal watcher's state file was damaged, so every search started fresh." };
      }
      await rename(path, `${path}.bad`).catch(() => undefined);
      return { memory: emptyMemory(), note: "The deal watcher's state file was damaged, so every search started fresh. The old file was kept as state.json.bad." };
    },
    async save(memory) {
      const temporary = `${path}.tmp`;
      try {
        await writeFile(temporary, writeMemory(memory, keepSeen), { mode: 0o600 });
        await rename(temporary, path);
      } catch {
        throw new Error("Couldn't save the deal watcher's state");
      }
    },
  };
}