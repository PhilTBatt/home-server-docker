import { londonTime } from "../notify/daily.js";
import type { Notification } from "../notify/notifier.js";
import { capNotification, dealNotification, moreNotification, watchingNotification, type Started } from "./alert.js";
import { matches, standing, totalPrice } from "./match.js";
import { defaultLimits, fingerprint, type Limits, type Search, type SearchList } from "./searches.js";
import { SourceError, type Listing, type Source } from "./source.js";
import { emptyMemory, maxSeenPerSearch, type Memory, type Seen, type Store } from "./store.js";

export type WatcherOptions = {
  loadSearches: () => Promise<SearchList>;
  sources: Record<string, Source>;
  store: Store;
  notify: (notification: Notification) => Promise<void>;
  sandbox?: boolean;
  maxPages?: number;
};

export type RunSummary = {
  ran: boolean;
  checked: number;
  alerts: number;
  failed: number;
  unsent: boolean;
};

export type WatcherProblem = {
  code: "deals-list" | "deals-source" | "deals-state" | "deals-limit";
  message: string;
};

export type WatcherStatus = {
  lastRun: string | null;
  callsToday: number;
  callsPerDay: number;
  alertsToday: number;
  alertsPerDay: number;
  note: string | null;
  problems: WatcherProblem[];
};

export type SearchStatus = {
  id: string;
  name: string;
  on: boolean;
  source: string;
  query: string;
  everyMinutes: number;
  lastChecked: string | null;
  watchingSince: string | null;
  matches: number | null;
  total: number | null;
  complete: boolean | null;
  problem: string | null;
};

export type MatchedListing = {
  title: string;
  price: number;
  postage: number | null;
  total: number;
  condition: string | null;
  buying: string[];
  url: string;
  listedAt: string | null;
  endsAt: string | null;
  firstSeen: string | null;
};

export type MatchGroup = {
  id: string;
  name: string;
  source: string;
  checkedAt: string;
  count: number;
  listings: MatchedListing[];
};

export type DealWatcher = {
  run(now: Date, force?: boolean): Promise<RunSummary>;
  problems(): WatcherProblem[];
  status(): WatcherStatus;
  searches(): SearchStatus[];
  matches(now: Date): MatchGroup[];
};

type Result = {
  checkedAt: number;
  listings: Listing[];
  total: number;
  complete: boolean;
};

type Failure = {
  reason: string;
  message: string;
  runs: number;
  retryAt: number;
  print: string;
};

type Alert = {
  listing: Listing;
  was: number | null;
};

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dueTolerance = 30 * 1000;
const quickRetry = 10 * minuteMs;
const slowRetry = hourMs;
const resumeWithin = 24 * hourMs;
const forgetAfter = 48 * hourMs;
const runsBeforeProblem = 3;
const matchesShown = 50;
export const freshFor = 6 * hourMs;
const needsAPerson = ["keys", "access", "request"];
const sourceWide = ["keys", "access", "busy", "down"];
const worstFirst = ["keys", "access", "busy", "request", "reply", "stopped", "down"];

export function createDealWatcher(options: WatcherOptions): DealWatcher {
  const sandbox = options.sandbox ?? false;
  const maxPages = options.maxPages ?? 3;
  const results = new Map<string, Result>();
  const failures = new Map<string, Failure>();
  const lastChecked = new Map<string, number>();
  const pausedUntil = new Map<string, number>();
  let memory: Memory | null = null;
  let list: SearchList | null = null;
  let note: string | null = null;
  let listProblem: string | null = null;
  let stateProblem = false;
  let lastRun: number | null = null;
  let running = false;

  function limits(): Limits {
    return list?.limits ?? defaultLimits;
  }

  function isDue(search: Search, now: number): boolean {
    const failure = failures.get(search.id);
    if (failure !== undefined) return failure.print !== fingerprint(search) || now >= failure.retryAt - dueTolerance;
    const last = lastChecked.get(search.id);
    return last === undefined || now - last >= search.everyMinutes * minuteMs - dueTolerance;
  }

  function fail(search: Search, reason: string, message: string, now: number) {
    const previous = failures.get(search.id);
    const wait = reason === "down" || reason === "reply" || reason === "stopped" ? quickRetry : slowRetry;
    failures.set(search.id, { reason, message, runs: previous?.reason === reason ? previous.runs + 1 : 1, retryAt: now + wait, print: fingerprint(search) });
    if (sourceWide.includes(reason)) pausedUntil.set(search.source, now + wait);
  }

  async function runOnce(now: Date, force: boolean): Promise<RunSummary> {
    const summary: RunSummary = { ran: true, checked: 0, alerts: 0, failed: 0, unsent: false };
    const time = now.getTime();
    const stamp = now.toISOString();
    const today = londonTime(now).day;
    const newDay = (state: Memory) => {
      if (state.counters.day !== today) state.counters = { day: today, calls: 0, alerts: 0, capNoted: false };
    };
    lastRun = time;
    if (memory !== null) newDay(memory);

    let loaded: SearchList;
    try {
      loaded = await options.loadSearches();
    } catch (error) {
      listProblem = error instanceof Error ? error.message : "it couldn't be read";
      return summary;
    }
    listProblem = null;
    list = loaded;

    if (memory === null) {
      const fromDisk = await options.store.load().catch(() => ({ memory: emptyMemory(), note: "The deal watcher's state couldn't be loaded, so every search started fresh." }));
      memory = fromDisk.memory;
      note = fromDisk.note;
    }
    const state = memory;
    newDay(state);

    const listed = new Map(loaded.searches.map((search) => [search.id, search]));
    for (const id of [...state.searches.keys()]) {
      if (!listed.has(id)) state.searches.delete(id);
    }
    for (const [id, remembered] of state.searches) {
      if (listed.get(id)?.on === false) {
        remembered.known = false;
        remembered.seen.clear();
      }
    }
    for (const known of [results, failures, lastChecked]) {
      for (const id of [...known.keys()]) {
        if (listed.get(id)?.on !== true) known.delete(id);
      }
    }
    if (force) pausedUntil.clear();

    let quiet = false;
    const send = async (notification: Notification): Promise<boolean> => {
      if (quiet) return false;
      if (state.counters.alerts >= loaded.limits.alertsPerDay) {
        quiet = true;
        if (!state.counters.capNoted) {
          await options
            .notify(capNotification(loaded.limits.alertsPerDay))
            .then(() => {
              state.counters.capNoted = true;
            })
            .catch(() => {
              summary.unsent = true;
            });
        }
        return false;
      }
      try {
        await options.notify(notification);
      } catch {
        quiet = true;
        summary.unsent = true;
        return false;
      }
      state.counters.alerts += 1;
      summary.alerts += 1;
      return true;
    };

    const started: Started[] = [];
    for (const search of loaded.searches) {
      if (!search.on || !(force || isDue(search, time))) continue;
      if ((pausedUntil.get(search.source) ?? 0) > time) continue;
      const callsLeft = loaded.limits.callsPerDay - state.counters.calls;
      if (callsLeft <= 0) break;

      const source = options.sources[search.source];
      if (source === undefined) {
        fail(search, "request", "it names a source the watcher doesn't have", time);
        summary.failed += 1;
        continue;
      }
      let found;
      try {
        found = await source.search(search, Math.min(maxPages, callsLeft));
      } catch (error) {
        if (error instanceof SourceError) {
          state.counters.calls += error.calls;
          fail(search, error.reason, error.message, time);
        } else {
          fail(search, "stopped", "the check stopped unexpectedly", time);
        }
        summary.failed += 1;
        continue;
      }
      state.counters.calls += found.calls;
      if (found.listings.length === 0 && found.skipped > 0) {
        fail(search, "reply", "none of the listings it sent could be read", time);
        summary.failed += 1;
        continue;
      }
      failures.delete(search.id);
      lastChecked.set(search.id, time);
      summary.checked += 1;

      const matched = found.listings.filter((listing) => matches(search, listing, now)).sort((a, b) => totalPrice(a) - totalPrice(b));
      results.set(search.id, { checkedAt: time, listings: matched, total: found.total, complete: found.complete });

      const print = fingerprint(search);
      const remembered = state.searches.get(search.id);
      const entryFor = (listing: Listing, first: string): Seen => (search.dropPercent === null ? { first, last: stamp } : { first, last: stamp, price: listing.price });
      if (remembered === undefined || remembered.criteria !== print || (!remembered.known && time - Date.parse(remembered.checked) > resumeWithin)) {
        const seen = new Map(matched.map((listing) => [listing.id, entryFor(listing, stamp)]));
        state.searches.set(search.id, { criteria: print, since: stamp, checked: stamp, wide: !found.complete, known: true, seen });
        started.push({ name: search.name, count: matched.length, cheapest: matched.length > 0 ? totalPrice(matched[0]) : null });
        continue;
      }

      let fresh = matched.filter((listing) => !remembered.seen.has(listing.id));
      const cutoff = !remembered.known ? Date.parse(remembered.checked) : !found.complete || remembered.wide ? Date.parse(remembered.since) : null;
      if (cutoff !== null) {
        const newer = fresh.filter((listing) => listing.listedAt !== null && Date.parse(listing.listedAt) > cutoff);
        for (const listing of fresh) {
          if (!newer.includes(listing)) remembered.seen.set(listing.id, entryFor(listing, stamp));
        }
        fresh = newer;
      }
      remembered.known = true;
      remembered.wide = !found.complete;

      const alerts: Alert[] = fresh.map((listing) => ({ listing, was: null }));
      for (const listing of matched) {
        const seen = remembered.seen.get(listing.id);
        if (seen === undefined) continue;
        seen.last = stamp;
        if (search.dropPercent === null) delete seen.price;
        else if (seen.price === undefined) seen.price = listing.price;
        else if (listing.price < seen.price && listing.price * 100 <= seen.price * (100 - search.dropPercent)) alerts.push({ listing, was: seen.price });
      }
      alerts.sort((a, b) => totalPrice(a.listing) - totalPrice(b.listing));

      const mark = (alert: Alert) => {
        remembered.seen.set(alert.listing.id, entryFor(alert.listing, remembered.seen.get(alert.listing.id)?.first ?? stamp));
      };
      const single = alerts.slice(0, loaded.limits.alertsPerCheck);
      const rest = alerts.slice(loaded.limits.alertsPerCheck);
      let sent = 0;
      for (const alert of single) {
        if (!(await send(dealNotification(search, alert.listing, standing(matched, alert.listing), alert.was, now, sandbox)))) break;
        mark(alert);
        sent += 1;
      }
      if (sent === single.length && rest.length > 0 && (await send(moreNotification(search, rest.map((alert) => alert.listing), sandbox)))) {
        rest.forEach(mark);
        sent += rest.length;
      }

      if (found.complete) {
        for (const [id, seen] of remembered.seen) {
          if (time - Date.parse(seen.last) > forgetAfter) remembered.seen.delete(id);
        }
      }
      if (remembered.seen.size > maxSeenPerSearch) {
        const newest = [...remembered.seen].sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, maxSeenPerSearch);
        remembered.seen = new Map(newest);
      }
      if (sent === alerts.length) remembered.checked = stamp;
    }

    if (started.length > 0) {
      await options.notify(watchingNotification(started, sandbox)).catch(() => {
        summary.unsent = true;
      });
    }
    try {
      await options.store.save(state);
      stateProblem = false;
    } catch {
      stateProblem = true;
    }
    return summary;
  }

  function problems(): WatcherProblem[] {
    const found: WatcherProblem[] = [];
    if (listProblem !== null) found.push({ code: "deals-list", message: `The deal watcher's search list has a problem: ${listProblem}.` });

    const failing = [...failures].filter(([, failure]) => needsAPerson.includes(failure.reason) || failure.runs >= runsBeforeProblem);
    if (failing.length > 0) {
      const [, worst] = failing.reduce((a, b) => (worstFirst.indexOf(b[1].reason) < worstFirst.indexOf(a[1].reason) ? b : a));
      const ids = failing.map(([id]) => id);
      const named = `${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ` and ${ids.length - 3} more` : ""}`;
      const which = sourceWide.includes(worst.reason) ? "its searches" : `${ids.length === 1 ? "a search" : `${ids.length} searches`} (${named})`;
      found.push({ code: "deals-source", message: `The deal watcher can't check ${which}: ${worst.message}.` });
    }
    if (stateProblem) found.push({ code: "deals-state", message: "The deal watcher couldn't save its state, so it may repeat or miss alerts after a restart." });
    if (memory !== null && memory.counters.calls >= limits().callsPerDay) {
      found.push({ code: "deals-limit", message: `The deal watcher has used today's ${limits().callsPerDay} calls and carries on tomorrow.` });
    }
    return found;
  }

  return {
    async run(now, force = false) {
      if (running) return { ran: false, checked: 0, alerts: 0, failed: 0, unsent: false };
      running = true;
      try {
        return await runOnce(now, force);
      } finally {
        running = false;
      }
    },

    problems,

    status() {
      return {
        lastRun: lastRun === null ? null : new Date(lastRun).toISOString(),
        callsToday: memory?.counters.calls ?? 0,
        callsPerDay: limits().callsPerDay,
        alertsToday: memory?.counters.alerts ?? 0,
        alertsPerDay: limits().alertsPerDay,
        note,
        problems: problems(),
      };
    },

    searches() {
      return (list?.searches ?? []).map((search) => {
        const result = results.get(search.id);
        const checked = lastChecked.get(search.id);
        return {
          id: search.id,
          name: search.name,
          on: search.on,
          source: search.source,
          query: search.query,
          everyMinutes: search.everyMinutes,
          lastChecked: checked === undefined ? null : new Date(checked).toISOString(),
          watchingSince: memory?.searches.get(search.id)?.since ?? null,
          matches: result?.listings.length ?? null,
          total: result?.total ?? null,
          complete: result?.complete ?? null,
          problem: failures.get(search.id)?.message ?? null,
        };
      });
    },

    matches(now) {
      const groups: MatchGroup[] = [];
      for (const search of list?.searches ?? []) {
        const result = results.get(search.id);
        if (!search.on || result === undefined || now.getTime() - result.checkedAt > freshFor) continue;
        const seen = memory?.searches.get(search.id)?.seen;
        groups.push({
          id: search.id,
          name: search.name,
          source: search.source,
          checkedAt: new Date(result.checkedAt).toISOString(),
          count: result.listings.length,
          listings: result.listings.slice(0, matchesShown).map((listing) => ({
            title: listing.title,
            price: listing.price,
            postage: listing.postage,
            total: totalPrice(listing),
            condition: listing.condition,
            buying: [...listing.buying],
            url: listing.url,
            listedAt: listing.listedAt,
            endsAt: listing.endsAt,
            firstSeen: seen?.get(listing.id)?.first ?? null,
          })),
        });
      }
      return groups;
    },
  };
}