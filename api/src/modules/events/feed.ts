import { appendFile, chmod, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { londonNow } from "../trains/alerts.js";

export const audiences = ["room", "home", "owner"] as const;
export type Audience = (typeof audiences)[number];

export const eventKinds = {
  "hub.started": "home",
  "mode.switched": "room",
  "reminder.due": "home",
  "trains.changed": "home",
  "phone.rang": "room",
  "session.waiting": "owner",
  "screen.paired": "owner",
  "projector.switched": "room",
} as const satisfies Record<string, Audience>;
export type EventKind = keyof typeof eventKinds;

export type Fact = string | number | boolean;
export type Facts = Record<string, Fact>;
export type HubEvent = { seq: number; at: string; kind: EventKind; audience: Audience; title: string; facts: Facts };
export type EventSink = { post(kind: EventKind, facts?: Facts, at?: Date): HubEvent | null };
export type FeedAnswer = { day: string; seq: number; all: boolean; events: HubEvent[]; more: number };
export type EventLog = {
  info?: (fields: Record<string, unknown>, message: string) => void;
  warn?: (fields: Record<string, unknown>, message: string) => void;
};
export type EventStore = {
  load(day: string): Promise<string[] | "missing">;
  append(day: string, line: string): Promise<void>;
  prune(keep: string): Promise<number>;
};
export type EventFeed = EventSink & {
  load(): Promise<void>;
  answer(after: number, reach: Audience, most?: number): FeedAnswer;
  waitForChange(after: number, ms: number, signal: AbortSignal): Promise<void>;
  waiters(): number;
};

export const mostPerDay = 5000;
export const seqPerDay = 1_000_000;
export const mostShown = 200;
export const factWord = /^[a-z0-9][a-z0-9-]{0,39}$/;

type FactKind = "word" | "count" | "yes";
const factShapes: Record<EventKind, Record<string, FactKind>> = {
  "hub.started": {},
  "mode.switched": { to: "word", from: "word", by: "word" },
  "reminder.due": { id: "word", urgent: "yes", late: "yes" },
  "trains.changed": { count: "count" },
  "phone.rang": {},
  "session.waiting": { name: "word" },
  "screen.paired": {},
  "projector.switched": { on: "yes" },
};

const rank: Record<Audience, number> = { room: 0, home: 1, owner: 2 };

export function canSee(audience: Audience, reach: Audience): boolean {
  return rank[audience] <= rank[reach];
}

export function narrower(a: Audience, b: Audience): Audience {
  return rank[a] <= rank[b] ? a : b;
}

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (audiences as readonly string[]).includes(value);
}

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === "string" && Object.hasOwn(eventKinds, value);
}

export function firstSeq(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000) * seqPerDay;
}

export function checkFacts(kind: EventKind, facts: Record<string, unknown>): Facts | null {
  const shape = factShapes[kind];
  const names = Object.keys(facts);
  if (names.length !== Object.keys(shape).length || !names.every((name) => Object.hasOwn(shape, name))) return null;
  const checked: Facts = {};
  for (const [name, wanted] of Object.entries(shape)) {
    const value = facts[name];
    if (wanted === "word" && (typeof value !== "string" || !factWord.test(value))) return null;
    if (wanted === "count" && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1000)) return null;
    if (wanted === "yes" && typeof value !== "boolean") return null;
    checked[name] = value as Fact;
  }
  return checked;
}

const byWords: Record<string, string> = { voice: "by voice", typed: "typed", phone: "from the phone", schedule: "on a timer", start: "as the hub started" };

function named(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function titleFor(kind: EventKind, facts: Facts): string {
  switch (kind) {
    case "hub.started":
      return "The hub started";
    case "mode.switched":
      return `Mode: ${named(String(facts.to))}, ${byWords[String(facts.by)] ?? String(facts.by)}`;
    case "reminder.due":
      return `${facts.urgent === true ? "An urgent reminder" : "A reminder"} went off${facts.late === true ? ", late" : ""}`;
    case "trains.changed":
      return facts.count === 1 ? "A train you watch changed" : `${String(facts.count)} trains you watch changed`;
    case "phone.rang":
      return "Your phone was rung";
    case "session.waiting":
      return `Claude Code session ${String(facts.name)} is waiting for you`;
    case "screen.paired":
      return "A screen was paired with the wall";
    case "projector.switched":
      return facts.on === true ? "The projector came on" : "The projector went off";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readEvent(line: string, day: string): HubEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "at,facts,kind,seq") return null;
  const { seq, at, kind, facts } = value;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq <= firstSeq(day) || seq >= firstSeq(day) + seqPerDay) return null;
  if (typeof at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || londonNow(new Date(at)).day !== day) return null;
  if (!isEventKind(kind) || !isObject(facts)) return null;
  const checked = checkFacts(kind, facts);
  if (checked === null) return null;
  return { seq, at, kind, audience: eventKinds[kind], title: titleFor(kind, checked), facts: checked };
}

export function savedLine(event: HubEvent): string {
  return JSON.stringify({ seq: event.seq, at: event.at, kind: event.kind, facts: event.facts });
}

const dayFile = /^\d{4}-\d\d-\d\d\.jsonl$/;

export function createEventStore(folder = "/data/events"): EventStore {
  const file = (day: string) => join(folder, `${day}.jsonl`);
  return {
    async load(day) {
      try {
        return (await readFile(file(day), "utf8")).split("\n").filter((line) => line !== "");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
        throw error;
      }
    },
    async append(day, line) {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await appendFile(file(day), `${line}\n`, { mode: 0o600 });
      await chmod(file(day), 0o600);
    },
    async prune(keep) {
      let names: string[];
      try {
        names = await readdir(folder);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
        throw error;
      }
      const old = names.filter((name) => dayFile.test(name) && name !== `${keep}.jsonl`);
      for (const name of old) await rm(join(folder, name), { force: true });
      return old.length;
    },
  };
}

function reasonOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,30}$/.test(code) ? code : "unknown";
}

export function createEventFeed(options: { store: EventStore; log?: EventLog; now?: () => Date }): EventFeed {
  const { store, log } = options;
  const now = options.now ?? (() => new Date());
  let open = false;
  let dropped = 0;
  const held: Array<{ kind: EventKind; facts: Facts; at: Date }> = [];
  let day = londonNow(now()).day;
  let events: HubEvent[] = [];
  let seq = firstSeq(day);
  let refused = 0;
  let saving: Promise<void> = Promise.resolve();
  const waiting = new Set<() => void>();

  const wake = () => {
    for (const done of [...waiting]) done();
  };

  const prune = (keep: string) => {
    store
      .prune(keep)
      .then((removed) => {
        if (removed > 0) log?.info?.({ events: { removed, kept: keep } }, "events from earlier days were removed");
      })
      .catch((error: unknown) => log?.warn?.({ events: { why: reasonOf(error) } }, "events from earlier days couldn't be removed"));
  };

  const roll = (at: Date) => {
    const today = londonNow(at).day;
    if (today === day) return;
    log?.info?.({ events: { day: today, was: day, events: events.length, refused } }, "a new day for the events feed");
    day = today;
    events = [];
    seq = firstSeq(day);
    refused = 0;
    prune(day);
    wake();
  };

  const keep = (kind: EventKind, facts: Facts, asked: Date): HubEvent | null => {
    const at = londonNow(asked).day === londonNow(now()).day ? asked : now();
    roll(at);
    const checked = checkFacts(kind, facts);
    if (checked === null) {
      log?.warn?.({ events: { kind } }, "an event's details didn't fit its kind, so it wasn't kept");
      return null;
    }
    if (events.length >= mostPerDay) {
      refused++;
      if (refused === 1) log?.warn?.({ events: { kind, most: mostPerDay } }, "the events feed has kept the most it keeps in a day, so later ones today aren't kept");
      return null;
    }
    seq++;
    const event: HubEvent = { seq, at: at.toISOString(), kind, audience: eventKinds[kind], title: titleFor(kind, checked), facts: checked };
    events.push(event);
    const line = savedLine(event);
    const into = day;
    saving = saving.then(() =>
      store.append(into, line).catch((error: unknown) => {
        log?.warn?.({ events: { seq: event.seq, kind, why: reasonOf(error) } }, "an event couldn't be saved, so a restart will forget it");
      }),
    );
    log?.info?.({ events: { seq: event.seq, kind, audience: event.audience } }, "event");
    wake();
    return event;
  };

  return {
    async load() {
      open = false;
      try {
        roll(now());
        let lines: string[] | "missing";
        try {
          lines = await store.load(day);
        } catch (error) {
          log?.warn?.({ events: { day, why: reasonOf(error) } }, "today's events couldn't be read, so the feed starts empty");
          prune(day);
          return;
        }
        if (lines !== "missing") {
          let bad = 0;
          const read: HubEvent[] = [];
          for (const line of lines) {
            const event = readEvent(line, day);
            if (event === null) bad++;
            else read.push(event);
          }
          read.sort((a, b) => a.seq - b.seq);
          const kept = read.filter((event, i) => i === 0 || event.seq !== (read[i - 1] as HubEvent).seq).slice(-mostPerDay);
          events = kept;
          seq = Math.max(seq, kept.at(-1)?.seq ?? seq);
          if (bad > 0) log?.warn?.({ events: { day, bad } }, "some of today's saved events couldn't be read and were left out");
        }
        log?.info?.({ events: { day, events: events.length, seq, saved: lines === "missing" ? "none" : "read" } }, "events at start");
        prune(day);
      } finally {
        open = true;
        const waited = held.splice(0);
        for (const one of waited) keep(one.kind, one.facts, one.at);
        if (waited.length > 0) log?.info?.({ events: { held: waited.length } }, "events posted before the feed had loaded were kept after today's saved ones");
        if (dropped > 0) log?.warn?.({ events: { dropped, most: mostPerDay } }, "more events were posted before the feed had loaded than it holds, so the rest weren't kept");
        dropped = 0;
      }
    },
    post(kind, facts = {}, at = now()) {
      if (open) return keep(kind, facts, at);
      if (held.length < mostPerDay) held.push({ kind, facts, at });
      else dropped++;
      return null;
    },
    answer(after, reach, most = mostShown) {
      roll(now());
      const all = after < firstSeq(day) || after > seq;
      const seen = events.filter((event) => canSee(event.audience, reach) && (all || event.seq > after));
      const shown = seen.slice(-most);
      return { day, seq, all, events: shown, more: seen.length - shown.length };
    },
    waiters: () => waiting.size,
    waitForChange(after, ms, signal) {
      roll(now());
      if (after !== seq || signal.aborted) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          waiting.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener("abort", done, { once: true });
        waiting.add(done);
      });
    },
  };
}
