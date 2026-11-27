import { randomBytes } from "node:crypto";
import type { Finished } from "../media/routes.js";
import type { Notification } from "../notify/notifier.js";
import { ask } from "../system/doctor.js";
import { describe, expiredNotification, firedNotification, happened, services, sameWatch, type Asked, type Disk, type Readings, type Service, type WatchFor } from "./kinds.js";

export type WatcherView = WatchFor & {
  id: string;
  what: string;
  hours: number;
  createdAt: string;
  expiresAt: string;
  lastCheck: { at: string; ok: boolean } | null;
  waitingToSend: boolean;
};

export type WatchSources = {
  finished: (signal: AbortSignal) => Promise<Finished[]>;
  disk: () => Promise<Disk>;
  answering: Record<Service, (signal: AbortSignal) => Promise<unknown>>;
};

export type CheckSummary = { fired: number; expired: number; unsent: number; dropped: number };

export type Added = { added: WatcherView } | { refused: string };

export type Watchers = {
  add(asked: Asked, now: Date): Added;
  cancel(id: string): boolean;
  list(): WatcherView[];
  run(now: Date): Promise<CheckSummary | "busy" | "nothing watched">;
};

type Entry = {
  id: string;
  watch: WatchFor;
  hours: number;
  createdAt: number;
  expiresAt: number;
  lastCheck: { at: number; ok: boolean } | null;
  pending: Notification | null;
};

export const mostWatchers = 10;
export const checkEveryMs = 60_000;
export const readWaitMs = 8_000;
export const idPattern = /^[0-9a-f]{8}$/;
const hourMs = 60 * 60 * 1000;

function newId(): string {
  return randomBytes(4).toString("hex");
}

function viewOf(entry: Entry): WatcherView {
  return {
    ...entry.watch,
    id: entry.id,
    what: describe(entry.watch),
    hours: entry.hours,
    createdAt: new Date(entry.createdAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    lastCheck: entry.lastCheck === null ? null : { at: new Date(entry.lastCheck.at).toISOString(), ok: entry.lastCheck.ok },
    waitingToSend: entry.pending !== null,
  };
}

async function read(entries: Entry[], sources: WatchSources, waitMs: number): Promise<Readings> {
  const kinds = new Set(entries.filter((entry) => entry.pending === null).map((entry) => entry.watch.kind));
  const asked = new Set(entries.flatMap((entry) => (entry.pending === null && entry.watch.kind === "service-answering" ? [entry.watch.service] : [])));
  const [finished, disk, ...answers] = await Promise.all([
    kinds.has("download-finished") ? ask(sources.finished, waitMs) : null,
    kinds.has("disk-free-below") ? ask(() => sources.disk(), waitMs) : null,
    ...services.map((service) => (asked.has(service) ? ask(sources.answering[service], waitMs) : null)),
  ]);
  const answering: Partial<Record<Service, boolean>> = {};
  services.forEach((service, index) => {
    const got = answers[index];
    if (got !== null) answering[service] = "value" in got;
  });
  return {
    ...(finished !== null && "value" in finished ? { finished: finished.value } : {}),
    ...(disk !== null && "value" in disk ? { disk: disk.value } : {}),
    answering,
  };
}

export function createWatchers(options: { sources: WatchSources; send: (notification: Notification) => Promise<void>; makeId?: () => string; waitMs?: number; most?: number }): Watchers {
  const entries = new Map<string, Entry>();
  const makeId = options.makeId ?? newId;
  const most = options.most ?? mostWatchers;
  let running = false;

  async function sent(notification: Notification): Promise<boolean> {
    try {
      await options.send(notification);
      return true;
    } catch {
      return false;
    }
  }

  async function check(now: Date): Promise<CheckSummary> {
    const summary: CheckSummary = { fired: 0, expired: 0, unsent: 0, dropped: 0 };
    const at = now.getTime();
    const current = [...entries.values()];
    const readings = await read(current, options.sources, options.waitMs ?? readWaitMs);
    for (const entry of current) {
      if (!entries.has(entry.id)) continue;
      if (entry.pending === null) {
        const seen = happened(entry.watch, entry.createdAt, readings);
        entry.lastCheck = { at, ok: seen !== null };
        if (seen === true) entry.pending = { ...firedNotification(entry.watch, readings), sequence: `watcher-${entry.id}` };
      }
      if (entry.pending !== null) {
        if (await sent(entry.pending)) {
          entries.delete(entry.id);
          summary.fired++;
          continue;
        }
        summary.unsent++;
      }
      if (at < entry.expiresAt) continue;
      entries.delete(entry.id);
      if (entry.pending !== null) {
        summary.dropped++;
        continue;
      }
      summary.expired++;
      if (!(await sent(expiredNotification(entry.watch, entry.hours, entry.lastCheck?.ok === false)))) summary.unsent++;
    }
    return summary;
  }

  return {
    add(asked, now) {
      const all = [...entries.values()];
      if (all.some((entry) => sameWatch(entry.watch, asked.watch))) return { refused: "That's already being watched" };
      if (all.length >= most) return { refused: `${most} things are already being watched, the most at once: cancel one first` };
      let id = makeId();
      while (entries.has(id) || !idPattern.test(id)) id = newId();
      const createdAt = now.getTime();
      const entry: Entry = { id, watch: asked.watch, hours: asked.hours, createdAt, expiresAt: createdAt + asked.hours * hourMs, lastCheck: null, pending: null };
      entries.set(id, entry);
      return { added: viewOf(entry) };
    },
    cancel(id) {
      return entries.delete(id);
    },
    list() {
      return [...entries.values()].map(viewOf);
    },
    async run(now) {
      if (running) return "busy";
      if (entries.size === 0) return "nothing watched";
      running = true;
      try {
        return await check(now);
      } finally {
        running = false;
      }
    },
  };
}
