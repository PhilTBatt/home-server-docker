import { londonTime } from "../notify/daily.js";
import type { Notification } from "../notify/notifier.js";
import type { Problem } from "../system/alerts.js";
import { capNotification, dealNotification, endingNotification, moreNotification, watchingNotification, type Started } from "./alert.js";
import { cautions, isAuctionOnly, isGreat, priorityFor, standing, totalPrice, underGuide, unitPrice, whyNot, type UnitPrice } from "./match.js";
import { defaultLimits, fingerprint, type Limits, type Quiet, type Search, type SearchList } from "./searches.js";
import { SourceError, type Categories, type CategoryDetails, type DetailNames, type FullListing, type Listing, type Source } from "./source.js";
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

export type WatcherStatus = {
  lastRun: string | null;
  callsToday: number;
  callsPerDay: number;
  alertsToday: number;
  alertsPerDay: number;
  note: string | null;
  problems: Problem[];
  quiet: { from: string; to: string; allow: "none" | "great"; now: boolean } | null;
};

export type SearchStatus = {
  id: string;
  name: string;
  group: string | null;
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
  snoozed: boolean;
  snoozedUntil: string | null;
  alertsToday: number;
  alertsPerDay: number | null;
  guidePrice: number | null;
  hidden: Record<string, number> | null;
};

export type MatchedListing = {
  id: string;
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
  bids: number | null;
  sellerType: "business" | "private" | null;
  sellerPercent: number | null;
  sellerFeedback: number | null;
  topRated: boolean | null;
  country: string | null;
  city: string | null;
  postcode: string | null;
  summary: string | null;
  variations: boolean;
  detailsMatch: boolean | null;
  place: number;
  underGuide: number | null;
  great: boolean;
  perUnit: UnitPrice | null;
  cautions: string[];
};

export type MatchGroup = {
  id: string;
  name: string;
  group: string | null;
  source: string;
  checkedAt: string;
  count: number;
  guidePrice: number | null;
  listings: MatchedListing[];
};

export type FullReply =
  | { status: "ok"; searchId: string; searchName: string; fetchedAt: string; listing: MatchedListing; full: Omit<FullListing, "listing"> }
  | { status: "unknown" }
  | { status: "limit" }
  | { status: "waiting" }
  | { status: "failed"; message: string; gone: boolean };

export type NamesReply = { status: "ok"; names: DetailNames } | { status: "limit" } | { status: "waiting" } | { status: "failed"; message: string };

export type LookupReply<Value> = { status: "ok"; value: Value } | { status: "limit" } | { status: "waiting" } | { status: "failed"; message: string };

export type DealWatcher = {
  run(now: Date, force?: boolean): Promise<RunSummary>;
  problems(): Problem[];
  status(now?: Date): WatcherStatus;
  searches(): SearchStatus[];
  matches(now: Date, most?: number): MatchGroup[];
  snooze(id: string, until: Date | null): Promise<boolean>;
  wake(id: string): Promise<boolean>;
  full(id: string, now: Date): Promise<FullReply>;
  detailNames(source: string, query: string, categoryId: string | null, now?: Date): Promise<NamesReply>;
  categories(source: string, query: string, now?: Date): Promise<LookupReply<Categories>>;
  categoryDetails(source: string, categoryId: string, now?: Date): Promise<LookupReply<CategoryDetails>>;
};

type Result = {
  checkedAt: number;
  listings: Listing[];
  total: number;
  complete: boolean;
  hidden: Record<string, number>;
};

type Failure = {
  reason: string;
  message: string;
  runs: number;
  retryAt: number;
  print: string;
  long: boolean;
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
const longestWait = 24 * hourMs;
const fullFreshFor = 30 * minuteMs;
const fullKept = 100;
const readsPerDay = 150;
export const freshFor = 6 * hourMs;
const needsAPerson = ["keys", "access", "request"];
const sourceWide = ["keys", "access", "busy", "down"];
const worstFirst = ["keys", "access", "busy", "request", "reply", "stopped", "down"];

function londonMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? "0");
  return part("hour") * 60 + part("minute");
}

export function inQuiet(quiet: Quiet | null, now: Date): boolean {
  if (quiet === null) return false;
  const minutes = londonMinutes(now);
  return quiet.from < quiet.to ? minutes >= quiet.from && minutes < quiet.to : minutes >= quiet.from || minutes < quiet.to;
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function describe(search: Search, listing: Listing, matched: Listing[], firstSeen: string | null): MatchedListing {
  const total = totalPrice(listing);
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    postage: listing.postage,
    total,
    condition: listing.condition,
    buying: [...listing.buying],
    url: listing.url,
    listedAt: listing.listedAt,
    endsAt: listing.endsAt,
    firstSeen,
    bids: listing.bids,
    sellerType: listing.sellerType,
    sellerPercent: listing.sellerPercent,
    sellerFeedback: listing.sellerFeedback,
    topRated: listing.topRated,
    country: listing.country,
    city: listing.city,
    postcode: listing.postcode,
    summary: listing.summary,
    variations: listing.variations,
    detailsMatch: listing.detailsMatch,
    place: matched.filter((other) => other.id !== listing.id && totalPrice(other) < total).length + 1,
    underGuide: underGuide(search, listing),
    great: isGreat(search, listing),
    perUnit: unitPrice(search, listing),
    cautions: cautions(search, listing),
  };
}

export function createDealWatcher(options: WatcherOptions): DealWatcher {
  const sandbox = options.sandbox ?? false;
  const maxPages = options.maxPages ?? 3;
  const results = new Map<string, Result>();
  const failures = new Map<string, Failure>();
  const lastChecked = new Map<string, number>();
  const pausedUntil = new Map<string, number>();
  const fullCache = new Map<string, { at: number; full: FullListing }>();
  const reading = new Map<string, Promise<FullListing | { message: string; gone: boolean }>>();
  let reads = { day: "", count: 0 };
  let loading: Promise<Memory> | null = null;
  let pendingCalls = 0;
  let saving: Promise<void> = Promise.resolve();
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

  function ensureMemory(): Promise<Memory> {
    loading ??= options.store
      .load()
      .catch(() => ({ memory: emptyMemory(), note: "The deal watcher's state couldn't be loaded, so every search started fresh." }))
      .then((fromDisk) => {
        memory = fromDisk.memory;
        note = fromDisk.note;
        return fromDisk.memory;
      });
    return loading;
  }

  function waitAfter(reason: string, retryAfter: number | null): number {
    const usual = reason === "down" || reason === "reply" || reason === "stopped" ? quickRetry : slowRetry;
    return reason === "busy" && retryAfter !== null ? Math.min(Math.max(retryAfter, quickRetry), longestWait) : usual;
  }

  function blocked(sourceName: string, now: number): "waiting" | "limit" | null {
    if ((pausedUntil.get(sourceName) ?? 0) > now) return "waiting";
    const today = londonTime(new Date(now)).day;
    if (reads.day !== today) reads = { day: today, count: 0 };
    return outOfCalls() || reads.count >= readsPerDay ? "limit" : null;
  }

  async function read<Reply extends { calls: number }>(sourceName: string, now: number, work: () => Promise<Reply>): Promise<Reply | { message: string; gone: boolean }> {
    reads.count += 1;
    spend(1);
    try {
      const reply = await work();
      spend(reply.calls - 1);
      return reply;
    } catch (error) {
      if (!(error instanceof SourceError)) return { message: "the check stopped unexpectedly", gone: false };
      spend(error.calls - 1);
      if (sourceWide.includes(error.reason)) pausedUntil.set(sourceName, now + waitAfter(error.reason, error.retryAfterMs));
      return { message: error.message, gone: error.reason === "gone" };
    }
  }

  function save(state: Memory): Promise<void> {
    saving = saving
      .then(() => options.store.save(state))
      .then(
        () => {
          stateProblem = false;
        },
        () => {
          stateProblem = true;
        },
      );
    return saving;
  }

  function spend(calls: number) {
    if (memory === null) pendingCalls += calls;
    else memory.counters.calls += calls;
  }

  function outOfCalls(): boolean {
    return (memory?.counters.calls ?? 0) + pendingCalls >= limits().callsPerDay;
  }

  function fail(search: Search, reason: string, message: string, now: number, retryAfter: number | null = null) {
    const previous = failures.get(search.id);
    const wait = waitAfter(reason, retryAfter);
    failures.set(search.id, { reason, message, runs: previous?.reason === reason ? previous.runs + 1 : 1, retryAt: now + wait, print: fingerprint(search), long: wait > slowRetry });
    if (sourceWide.includes(reason)) pausedUntil.set(search.source, now + wait);
  }

  async function runOnce(now: Date, force: boolean): Promise<RunSummary> {
    const summary: RunSummary = { ran: true, checked: 0, alerts: 0, failed: 0, unsent: false };
    const time = now.getTime();
    const stamp = now.toISOString();
    const today = londonTime(now).day;
    const newDay = (state: Memory) => {
      if (state.counters.day === today) return;
      state.counters = { day: today, calls: 0, alerts: 0, capNoted: false };
      state.alertsToday.clear();
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

    const state = await ensureMemory();
    newDay(state);
    state.counters.calls += pendingCalls;
    pendingCalls = 0;

    const listed = new Map(loaded.searches.map((search) => [search.id, search]));
    for (const id of [...state.searches.keys()]) {
      if (!listed.has(id)) state.searches.delete(id);
    }
    for (const [id, until] of [...state.snoozed]) {
      if (!listed.has(id) || (until !== null && Date.parse(until) <= time)) state.snoozed.delete(id);
    }
    for (const id of [...state.alertsToday.keys()]) {
      if (!listed.has(id)) state.alertsToday.delete(id);
    }
    for (const id of state.snoozed.keys()) failures.delete(id);
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
      if (!search.on || state.snoozed.has(search.id) || !(force || isDue(search, time))) continue;
      if ((pausedUntil.get(search.source) ?? 0) > time) continue;
      const source = options.sources[search.source];
      const callsLeft = loaded.limits.callsPerDay - state.counters.calls;
      if (callsLeft <= 0 && source?.noCalls !== true) continue;

      if (source === undefined) {
        fail(search, "request", "it names a source the watcher doesn't have", time);
        summary.failed += 1;
        continue;
      }
      let found;
      try {
        const pages = maxPages * (1 + Object.keys(search.hideDetails ?? {}).length) + (search.details !== null && search.detailsMode === "prefer" ? 1 : 0);
        found = await source.search(search, Math.min(pages, callsLeft));
      } catch (error) {
        if (error instanceof SourceError) {
          state.counters.calls += error.calls;
          fail(search, error.reason, error.message, time, error.retryAfterMs);
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

      const hidden: Record<string, number> = {};
      const matched: Listing[] = [];
      for (const listing of found.listings) {
        const reason = whyNot(search, listing, now);
        if (reason === null) matched.push(listing);
        else hidden[reason] = (hidden[reason] ?? 0) + 1;
      }
      matched.sort((a, b) => totalPrice(a) - totalPrice(b));
      results.set(search.id, { checkedAt: time, listings: matched, total: found.total, complete: found.complete, hidden });

      const print = fingerprint(search);
      const remembered = state.searches.get(search.id);
      const endsSoon = (listing: Listing) =>
        search.endingSoonMinutes !== null && isAuctionOnly(listing) && listing.endsAt !== null && Date.parse(listing.endsAt) - time <= search.endingSoonMinutes * minuteMs;
      const entryFor = (listing: Listing, first: string): Seen => {
        const entry: Seen = search.dropPercent === null ? { first, last: stamp } : { first, last: stamp, price: listing.price };
        if (endsSoon(listing)) entry.ending = true;
        return entry;
      };
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
      const ending: Listing[] = [];
      for (const listing of matched) {
        const seen = remembered.seen.get(listing.id);
        if (seen === undefined || seen.ending === true || !endsSoon(listing) || Date.parse(listing.endsAt ?? "") <= time) continue;
        if (!alerts.some((alert) => alert.listing.id === listing.id)) ending.push(listing);
      }
      ending.sort((a, b) => Date.parse(a.endsAt ?? "") - Date.parse(b.endsAt ?? ""));
      alerts.sort((a, b) => totalPrice(a.listing) - totalPrice(b.listing));

      const mark = (alert: Alert) => {
        remembered.seen.set(alert.listing.id, entryFor(alert.listing, remembered.seen.get(alert.listing.id)?.first ?? stamp));
      };
      const quietNow = inQuiet(loaded.quiet, now);
      const greatAllowed = loaded.quiet?.allow === "great";
      const allowed = quietNow ? alerts.filter((alert) => greatAllowed && priorityFor(search, alert.listing) === 4) : alerts;
      const room = search.alertsPerDay === null ? Number.POSITIVE_INFINITY : Math.max(0, search.alertsPerDay - (state.alertsToday.get(search.id) ?? 0));
      let used = 0;
      for (const listing of !quietNow || greatAllowed ? ending.slice(0, loaded.limits.alertsPerCheck) : []) {
        if (used >= room || !(await send(endingNotification(search, listing, now, sandbox)))) break;
        const seen = remembered.seen.get(listing.id);
        if (seen !== undefined) seen.ending = true;
        used += 1;
      }
      const left = room - used;
      const single = allowed.slice(0, Math.min(loaded.limits.alertsPerCheck, left));
      const rest = allowed.slice(single.length);
      let sent = 0;
      for (const alert of single) {
        if (!(await send(dealNotification(search, alert.listing, standing(matched, alert.listing), alert.was, now, sandbox)))) break;
        mark(alert);
        sent += 1;
        used += 1;
      }
      if (sent === single.length && rest.length > 0 && left > single.length && (await send(moreNotification(search, rest.map((alert) => alert.listing), sandbox)))) {
        rest.forEach(mark);
        sent += rest.length;
        used += 1;
      }
      if (used > 0) state.alertsToday.set(search.id, (state.alertsToday.get(search.id) ?? 0) + used);

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
      const watching = watchingNotification(started, sandbox);
      await options.notify(inQuiet(loaded.quiet, now) ? { ...watching, priority: 2 } : watching).catch(() => {
        summary.unsent = true;
      });
    }
    await save(state);
    return summary;
  }

  async function setSnooze(id: string, until: string | null | undefined): Promise<boolean> {
    const loaded = list ?? (await options.loadSearches().catch(() => null));
    if (loaded?.searches.some((search) => search.id === id) !== true) return false;
    const state = await ensureMemory();
    if (until === undefined) state.snoozed.delete(id);
    else {
      state.snoozed.set(id, until);
      failures.delete(id);
    }
    await save(state);
    return true;
  }

  function problems(): Problem[] {
    const found: Problem[] = [];
    if (listProblem !== null) found.push({ code: "deals-list", message: `The deal watcher's search list has a problem: ${listProblem}.` });

    const failing = [...failures].filter(([, failure]) => needsAPerson.includes(failure.reason) || failure.runs >= runsBeforeProblem || failure.long);
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

    status(now = new Date()) {
      const quiet = list?.quiet ?? null;
      return {
        quiet: quiet === null ? null : { from: clock(quiet.from), to: clock(quiet.to), allow: quiet.allow, now: inQuiet(quiet, now) },
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
          group: search.group,
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
          snoozed: memory?.snoozed.has(search.id) ?? false,
          snoozedUntil: memory?.snoozed.get(search.id) ?? null,
          alertsToday: memory?.alertsToday.get(search.id) ?? 0,
          alertsPerDay: search.alertsPerDay,
          guidePrice: search.guidePrice,
          hidden: result === undefined ? null : { ...result.hidden },
        };
      });
    },

    matches(now, most = matchesShown) {
      const groups: MatchGroup[] = [];
      for (const search of list?.searches ?? []) {
        const result = results.get(search.id);
        if (!search.on || result === undefined || now.getTime() - result.checkedAt > freshFor) continue;
        const seen = memory?.searches.get(search.id)?.seen;
        groups.push({
          id: search.id,
          name: search.name,
          group: search.group,
          source: search.source,
          checkedAt: new Date(result.checkedAt).toISOString(),
          count: result.listings.length,
          guidePrice: search.guidePrice,
          listings: result.listings.slice(0, Math.min(most, matchesShown)).map((listing) => describe(search, listing, result.listings, seen?.get(listing.id)?.first ?? null)),
        });
      }
      return groups;
    },

    async snooze(id, until) {
      return setSnooze(id, until === null ? null : until.toISOString());
    },

    async wake(id) {
      return setSnooze(id, undefined);
    },

    async full(id, now) {
      const time = now.getTime();
      for (const search of list?.searches ?? []) {
        const result = results.get(search.id);
        if (!search.on || result === undefined || time - result.checkedAt > freshFor) continue;
        const listing = result.listings.find((entry) => entry.id === id);
        if (listing === undefined) continue;
        const source = options.sources[search.source];
        if (listing.ref === null || source?.full === undefined) return { status: "failed", message: "this listing can't be read in full", gone: false };

        for (const [key, entry] of fullCache) {
          if (time - entry.at > fullFreshFor) fullCache.delete(key);
        }
        let kept = fullCache.get(id);
        if (kept === undefined) {
          let pending = reading.get(id);
          if (pending === undefined) {
            const stop = blocked(search.source, time);
            if (stop !== null) return { status: stop };
            const ref = listing.ref;
            pending = read(search.source, time, () => (source.full as NonNullable<Source["full"]>)(ref))
              .then((reply) => ("full" in reply ? reply.full : reply))
              .finally(() => reading.delete(id));
            reading.set(id, pending);
          }
          const outcome = await pending;
          if ("message" in outcome) return { status: "failed", ...outcome };
          kept = fullCache.get(id) ?? { at: time, full: outcome };
          fullCache.set(id, kept);
          for (const oldest of [...fullCache.keys()].slice(0, Math.max(0, fullCache.size - fullKept))) fullCache.delete(oldest);
        }
        const { listing: current, ...full } = kept.full;
        const firstSeen = memory?.searches.get(search.id)?.seen.get(id)?.first ?? null;
        return {
          status: "ok",
          searchId: search.id,
          searchName: search.name,
          fetchedAt: new Date(kept.at).toISOString(),
          listing: describe(search, { ...current, id, url: listing.url, detailsMatch: listing.detailsMatch }, result.listings, firstSeen),
          full,
        };
      }
      return { status: "unknown" };
    },

    async detailNames(sourceName, query, categoryId, now = new Date()) {
      const source = options.sources[sourceName];
      if (source?.detailNames === undefined) return { status: "failed", message: "that source can't list item details" };
      const lookUp = source.detailNames;
      const stop = blocked(sourceName, now.getTime());
      if (stop !== null) return { status: stop };
      const outcome = await read(sourceName, now.getTime(), () => lookUp(query, categoryId));
      return "names" in outcome ? { status: "ok", names: outcome.names } : { status: "failed", message: outcome.message };
    },

    async categories(sourceName, query, now = new Date()) {
      const lookUp = options.sources[sourceName]?.categories;
      if (lookUp === undefined) return { status: "failed", message: "that source can't suggest categories" };
      const stop = blocked(sourceName, now.getTime());
      if (stop !== null) return { status: stop };
      const outcome = await read(sourceName, now.getTime(), () => lookUp(query));
      return "categories" in outcome ? { status: "ok", value: outcome.categories } : { status: "failed", message: outcome.message };
    },

    async categoryDetails(sourceName, categoryId, now = new Date()) {
      const lookUp = options.sources[sourceName]?.categoryDetails;
      if (lookUp === undefined) return { status: "failed", message: "that source can't list a category's item details" };
      const stop = blocked(sourceName, now.getTime());
      if (stop !== null) return { status: stop };
      const outcome = await read(sourceName, now.getTime(), () => lookUp(categoryId));
      return "details" in outcome ? { status: "ok", value: outcome.details } : { status: "failed", message: outcome.message };
    },
  };
}