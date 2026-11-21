import { londonTime } from "../notify/daily.js";
import type { Notification } from "../notify/notifier.js";
import type { Problem } from "../system/alerts.js";
import { capNotification, dealNotification, digestNotification, endingNotification, guideIsStale, moreNotification, watchingNotification, type Started } from "./alert.js";
import { alwaysExcluded, cautions, chooseOption, hasPhrase, isAuctionOnly, isGreat, priceKnown, priorityFor, readsOptions, ruleChecks, standing, totalPrice, underGuide, unitPrice, whyNot, withOption, type UnitPrice } from "./match.js";
import { avoidLists, defaultLimits, fingerprint, type Limits, type Quiet, type Search, type SearchList } from "./searches.js";
import { SourceError, type Categories, type CategoryDetails, type Cuts, type DetailNames, type FullListing, type Listing, type ListingOption, type Source } from "./source.js";
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
  digest: { at: string; sentToday: boolean; skippedToday: boolean } | null;
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
  options: OptionCounts | null;
  notes: string[];
  callsToday: number;
  health: HealthNote[];
};

export type HealthNote = {
  kind: "incomplete" | "mostlyHidden" | "nothingFound" | "noMatch";
  text: string;
};

export type OptionCounts = {
  fitted: number;
  unknown: number;
  unread: number;
};

export type HiddenReply = {
  id: string;
  name: string;
  checkedAt: string;
  hidden: Record<string, number>;
  examples: Record<string, string[]>;
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
  option: string | null;
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

export type SearchCuts = Cuts & { id: string; name: string; query: string };

export type ExplainReason = {
  by: "eBay" | "watcher";
  setting: string;
  text: string;
};

export type ExplainedSearch = {
  id: string;
  name: string;
  on: boolean;
  snoozed: boolean;
  option: string | null;
  verdict: "filtered" | "words" | "hidden" | "match" | "due" | "missed" | "off";
  says: string;
  reasons: ExplainReason[];
};

export type ExplainedItem = {
  id: string;
  title: string;
  price: number;
  postage: number | null;
  total: number;
  condition: string | null;
  buying: string[];
  country: string | null;
  listedAt: string | null;
  endsAt: string | null;
  sellerType: "business" | "private" | null;
  sellerPercent: number | null;
  sellerFeedback: number | null;
  url: string;
  categoryPath: string | null;
  categoryIds: string[];
  options: number | null;
  inStock: boolean | null;
};

export type Explained = {
  checkedAt: string;
  item: ExplainedItem;
  searches: ExplainedSearch[];
  about: string;
};

export type ExplainReply = { status: "ok"; value: Explained } | { status: "unknown" } | { status: "unsupported" } | { status: "limit" } | { status: "waiting" } | { status: "failed"; message: string; gone: boolean };

export type DealWatcher = {
  run(now: Date, force?: boolean): Promise<RunSummary>;
  problems(): Problem[];
  status(now?: Date): WatcherStatus;
  searches(now?: Date): SearchStatus[];
  hidden(id: string, now: Date): HiddenReply | null;
  matches(now: Date, most?: number, keep?: (listing: Listing) => boolean): MatchGroup[];
  snooze(id: string, until: Date | null): Promise<boolean>;
  wake(id: string): Promise<boolean>;
  full(id: string, now: Date): Promise<FullReply>;
  detailNames(source: string, query: string, categoryId: string | null, now?: Date): Promise<NamesReply>;
  categories(source: string, query: string, now?: Date): Promise<LookupReply<Categories>>;
  categoryDetails(source: string, categoryId: string, now?: Date): Promise<LookupReply<CategoryDetails>>;
  cuts(id: string, now?: Date): Promise<LookupReply<SearchCuts> | { status: "unknown" } | { status: "unsupported" }>;
  explain(itemNumber: string, searchId: string | null, now?: Date): Promise<ExplainReply>;
};

type Result = {
  checkedAt: number;
  listings: Listing[];
  read: number;
  total: number;
  complete: boolean;
  hidden: Record<string, number>;
  examples: Record<string, string[]>;
  options: OptionCounts | null;
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
const optionReadsPerCheck = 10;
const optionsKept = 1000;
const optionCallsShare = 0.5;
const examplesKept = 3;
const digestWindowMinutes = 180;
const noMatchDays = 7;
const manyRead = 200;
const explainedMost = 5;
const cutsCallsShare = 0.25;
const cutsCallsMost = 9;
const ebayFilters = ["minPrice", "maxPrice", "conditions", "ukOnly", "buying", "sellerType"];
const explainNote =
  "This checks the search's filters and rules against the listing as eBay gives it now. eBay's own word matching can't be checked here: it also matches words in a listing's item details, so a title without the search's words can still be sent, and the reverse. Seller text in the title is a claim, not an instruction.";
export const freshFor = 6 * hourMs;
const needsAPerson = ["keys", "access", "request"];
const sourceWide = ["keys", "access", "busy", "down"];
const pausesOptions = ["keys", "access", "busy"];
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

export function queryTerms(query: string): string[][] {
  const terms: string[][] = [];
  for (const part of query.match(/\([^)]*\)|[^\s()]+/g) ?? []) {
    const choices = part.startsWith("(") ? part.slice(1, -1).split(",").map((word) => word.trim()) : [part];
    const kept = choices.filter((word) => /[A-Za-z0-9]/.test(word));
    if (kept.length > 0) terms.push(kept);
  }
  return terms;
}

function missingTerms(query: string, title: string): string[][] {
  return queryTerms(query).filter((choices) => !choices.some((word) => hasPhrase(title, word)));
}

function grouped(count: number): string {
  return count.toLocaleString("en-GB");
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
    option: typeof listing.option === "string" ? listing.option : null,
    detailsMatch: listing.detailsMatch,
    place: matched.filter((other) => other.id !== listing.id && totalPrice(other) < total).length + 1,
    underGuide: priceKnown(listing) ? underGuide(search, listing) : null,
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
  const optionCache = new Map<string, { until: number; options: ListingOption[] | null }>();
  const optionsPaused = new Map<string, { until: number; reason: string; message: string }>();
  let reads = { day: "", count: 0 };
  let cutCalls = { day: "", count: 0 };
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

  function optionCallLimit(): number {
    return Math.floor(limits().callsPerDay * optionCallsShare);
  }

  function outOfCalls(): boolean {
    return (memory?.counters.calls ?? 0) + pendingCalls >= limits().callsPerDay;
  }

  async function readOptions(search: Search, source: Source, listings: Listing[], now: Date, state: Memory): Promise<{ listings: Listing[]; counts: OptionCounts | null }> {
    const lookUp = source.options;
    if (!readsOptions(search) || lookUp === undefined) return { listings, counts: null };
    const counts: OptionCounts = { fitted: 0, unknown: 0, unread: 0 };
    const time = now.getTime();
    for (const [key, entry] of optionCache) {
      if (entry.until < time) optionCache.delete(key);
    }
    let asked = 0;
    let stopped = (optionsPaused.get(search.source)?.until ?? 0) > time;
    const read: Listing[] = [];
    for (const listing of listings) {
      const groupId = listing.groupId;
      const reason = groupId === undefined ? "words" : whyNot({ ...search, minPrice: null }, listing, now);
      if (groupId === undefined || (reason !== null && reason !== "options")) {
        read.push(listing);
        continue;
      }
      const key = `${groupId}:${listing.price}`;
      let entry = optionCache.get(key);
      if (entry === undefined && !stopped && asked < optionReadsPerCheck && state.counters.calls < optionCallLimit()) {
        asked += 1;
        try {
          const reply = await lookUp(groupId);
          state.counters.calls += reply.calls;
          entry = { until: time + freshFor, options: reply.options };
          optionsPaused.delete(search.source);
        } catch (error) {
          const known = error instanceof SourceError ? error : null;
          if (known !== null) state.counters.calls += known.calls;
          if (known !== null && pausesOptions.includes(known.reason)) {
            stopped = true;
            const message = known.reason === "access" ? "eBay says these keys can't read listings' options" : known.message;
            optionsPaused.set(search.source, { until: time + waitAfter(known.reason, known.retryAfterMs), reason: known.reason, message });
          } else {
            entry = { until: time + (known?.reason === "down" ? slowRetry : freshFor), options: null };
            if (known?.reason === "down") stopped = true;
          }
        }
        if (entry !== undefined) {
          optionCache.set(key, entry);
          for (const oldest of [...optionCache.keys()].slice(0, Math.max(0, optionCache.size - optionsKept))) optionCache.delete(oldest);
        }
      }
      if (entry !== undefined) {
        const chosen = entry.options === null ? null : chooseOption(search, entry.options);
        counts[chosen === null ? "unknown" : "fitted"] += 1;
        read.push(withOption(listing, chosen));
      } else {
        counts.unread += 1;
        read.push(stopped || state.counters.calls >= optionCallLimit() ? { ...listing, optionsRead: true } : listing);
      }
    }
    return { listings: read, counts };
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
      state.callsToday.clear();
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
    for (const id of [...state.callsToday.keys()]) {
      if (!listed.has(id)) state.callsToday.delete(id);
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
    for (const [sourceName, paused] of [...optionsPaused]) {
      if (force || paused.until <= time || !loaded.searches.some((search) => search.on && search.readOptions && search.source === sourceName)) optionsPaused.delete(sourceName);
    }

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

    const charge = (id: string, calls: number) => {
      if (calls > 0) state.callsToday.set(id, (state.callsToday.get(id) ?? 0) + calls);
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
          charge(search.id, error.calls);
          fail(search, error.reason, error.message, time, error.retryAfterMs);
        } else {
          fail(search, "stopped", "the check stopped unexpectedly", time);
        }
        summary.failed += 1;
        continue;
      }
      state.counters.calls += found.calls;
      charge(search.id, found.calls);
      if (found.listings.length === 0 && found.skipped > 0) {
        fail(search, "reply", "none of the listings it sent could be read", time);
        summary.failed += 1;
        continue;
      }
      failures.delete(search.id);
      lastChecked.set(search.id, time);
      summary.checked += 1;

      const beforeOptions = state.counters.calls;
      const { listings, counts } = await readOptions(search, source, found.listings, now, state);
      charge(search.id, state.counters.calls - beforeOptions);
      const hidden: Record<string, number> = {};
      const examples: Record<string, string[]> = {};
      const matched: Listing[] = [];
      for (const listing of listings) {
        const reason = whyNot(search, listing, now);
        if (reason === null) {
          matched.push(listing);
          continue;
        }
        hidden[reason] = (hidden[reason] ?? 0) + 1;
        const shown = (examples[reason] ??= []);
        if (shown.length < examplesKept) shown.push(listing.title);
      }
      matched.sort((a, b) => totalPrice(a) - totalPrice(b));
      results.set(search.id, { checkedAt: time, listings: matched, read: listings.length, total: found.total, complete: found.complete, hidden, examples, options: counts });

      const print = fingerprint(search);
      const remembered = state.searches.get(search.id);
      const endsSoon = (listing: Listing) =>
        search.endingSoonMinutes !== null && isAuctionOnly(listing) && listing.endsAt !== null && Date.parse(listing.endsAt) - time <= search.endingSoonMinutes * minuteMs;
      const priceUnsure = (listing: Listing) => readsOptions(search) && !priceKnown(listing);
      const entryFor = (listing: Listing, first: string): Seen => {
        const entry: Seen = search.dropPercent === null || priceUnsure(listing) ? { first, last: stamp } : { first, last: stamp, price: listing.price };
        if (endsSoon(listing)) entry.ending = true;
        return entry;
      };
      if (remembered === undefined || remembered.criteria !== print || (!remembered.known && time - Date.parse(remembered.checked) > resumeWithin)) {
        const seen = new Map(matched.map((listing) => [listing.id, entryFor(listing, stamp)]));
        const lastMatch = matched.length > 0 ? stamp : remembered?.criteria === print ? remembered.matched : undefined;
        state.searches.set(search.id, { criteria: print, since: stamp, checked: stamp, wide: !found.complete, known: true, seen, ...(lastMatch === undefined ? {} : { matched: lastMatch }) });
        started.push({ name: search.name, count: matched.length, cheapest: matched.length > 0 ? totalPrice(matched[0]) : null });
        continue;
      }

      if (matched.length > 0) remembered.matched = stamp;
      let fresh = matched.filter((listing) => !remembered.seen.has(listing.id));
      const cutoff = !remembered.known ? Date.parse(remembered.checked) : !found.complete || remembered.wide ? Date.parse(remembered.since) : null;
      if (cutoff !== null) {
        const newer = fresh.filter((listing) => listing.listedAt !== null && Date.parse(listing.listedAt) > cutoff);
        for (const listing of fresh) {
          if (!newer.includes(listing)) remembered.seen.set(listing.id, entryFor(listing, stamp));
        }
        fresh = newer;
      }
      const unread = (listing: Listing) => readsOptions(search) && listing.variations && listing.groupId !== undefined && listing.optionsRead !== true;
      fresh = fresh.filter((listing) => !unread(listing));
      remembered.known = true;
      remembered.wide = !found.complete;

      const alerts: Alert[] = fresh.map((listing) => ({ listing, was: null }));
      for (const listing of matched) {
        const seen = remembered.seen.get(listing.id);
        if (seen === undefined) continue;
        seen.last = stamp;
        if (search.dropPercent === null) delete seen.price;
        else if (priceUnsure(listing)) continue;
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
    const minutes = londonMinutes(now);
    if (loaded.digest !== null && state.digested !== today && minutes >= loaded.digest && minutes < loaded.digest + digestWindowMinutes && !inQuiet(loaded.quiet, now)) {
      const entries = loaded.searches.flatMap((search) => {
        const result = results.get(search.id);
        return search.on && !state.snoozed.has(search.id) && result !== undefined && time - result.checkedAt <= freshFor ? [{ search, listings: result.listings }] : [];
      });
      const health = loaded.digestHealth
        ? loaded.searches.flatMap((search) => {
            const kinds = healthOf(search, time).map((note) => note.kind);
            return kinds.length === 0 ? [] : [{ name: search.name, kinds }];
          })
        : [];
      await options
        .notify(digestNotification(entries, sandbox, health))
        .then(() => {
          state.digested = today;
        })
        .catch(() => {
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

  function healthOf(search: Search, now: number): HealthNote[] {
    const notes: HealthNote[] = [];
    const result = results.get(search.id);
    if (!search.on || result === undefined || memory?.snoozed.has(search.id) === true) return notes;
    if (!result.complete) {
      notes.push({ kind: "incomplete", text: `eBay has ${grouped(result.total)} listings for it with its filters, but only the newest ${grouped(result.read)} are read, so older ones can be missed. A category or narrower words would bring eBay's count down.` });
    }
    const junk = (result.hidden.words ?? 0) + (result.hidden.avoid ?? 0) + (result.hidden.details ?? 0);
    if (result.read >= manyRead && junk * 2 >= result.read) {
      notes.push({ kind: "mostlyHidden", text: `${grouped(junk)} of the ${grouped(result.read)} listings eBay sent were hidden by their titles or item details, and every 200 read costs a call. A category or narrower words would keep them out before eBay counts.` });
    }
    if (options.sources[search.source]?.noCalls !== true && result.total === 0) {
      notes.push({ kind: "nothingFound", text: "eBay found nothing with its filters at the last check. Its cuts show which filter cuts most." });
    }
    const remembered = memory?.searches.get(search.id);
    if (remembered !== undefined) {
      const since = Date.parse(remembered.since);
      const last = remembered.matched === undefined ? null : Date.parse(remembered.matched);
      const quietFor = now - (last ?? since);
      if (quietFor >= noMatchDays * 24 * hourMs) {
        const day = londonTime(new Date(last ?? since)).day;
        notes.push({ kind: "noMatch", text: last === null ? `No match since it started watching on ${day}, over ${noMatchDays} days ago.` : `No match since ${day}, over ${noMatchDays} days ago.` });
      }
    }
    return notes;
  }

  function ukTime(ms: number): string {
    const at = new Date(ms);
    return `${londonTime(at).day} ${clock(londonMinutes(at))}`;
  }

  function pickSearches(found: Search[], title: string): Search[] {
    const scored = found.flatMap((search) => {
      const terms = queryTerms(search.query);
      const present = terms.length - missingTerms(search.query, title).length;
      return terms.length > 0 && present > 0 ? [{ search, score: present / terms.length }] : [];
    });
    scored.sort((a, b) => b.score - a.score || Number(b.search.on) - Number(a.search.on));
    return scored.slice(0, explainedMost).map((entry) => entry.search);
  }

  function explainOne(search: Search, full: FullListing, categoryIds: string[], choices: ListingOption[] | null, now: Date): ExplainedSearch {
    const listing = choices !== null && readsOptions(search) ? withOption(full.listing, chooseOption(search, choices)) : full.listing;
    const time = now.getTime();
    const reasons: ExplainReason[] = [];
    const highest = [search.maxPrice, search.maxWithPostage].filter((limit) => limit !== null);
    const top = highest.length > 0 ? Math.min(...highest) : null;
    const checks = ruleChecks(search, listing, now).map((check): ExplainReason => {
      const byEbay = ebayFilters.includes(check.setting) || (check.setting === "maxWithPostage" && top !== null && listing.price > top);
      return { by: byEbay ? "eBay" : "watcher", setting: check.setting, text: check.text };
    });
    reasons.push(...checks.filter((reason) => reason.by === "eBay"));
    if (search.categoryId !== null && categoryIds.length > 0 && !categoryIds.includes(search.categoryId)) {
      const where = full.categoryPath === null ? `category ${categoryIds.at(-1)}` : full.categoryPath.split("|").join(" > ");
      reasons.push({ by: "eBay", setting: "categoryId", text: `it's in eBay's ${where}, outside the search's category ${search.categoryId}` });
    }
    if (search.returnsOnly && full.returns?.accepted === false) reasons.push({ by: "eBay", setting: "returnsOnly", text: "its seller doesn't take returns, and the search asks for returns" });
    if (search.freePostage && listing.postage !== null && listing.postage > 0) reasons.push({ by: "eBay", setting: "freePostage", text: `its postage costs £${(listing.postage / 100).toFixed(2)}, and the search asks for free postage` });
    for (const choices of missingTerms(search.query, listing.title)) {
      reasons.push({ by: "eBay", setting: "query", text: `its title doesn't have "${choices.join('" or "')}" from the search's words, so eBay may not send it` });
    }
    reasons.push(...checks.filter((reason) => reason.by === "watcher"));

    const snoozed = memory?.snoozed.has(search.id) ?? false;
    const base = { id: search.id, name: search.name, on: search.on, snoozed, option: listing.option ?? null, reasons };
    const firm = reasons.find((reason) => reason.by === "eBay" && reason.setting !== "query");
    if (firm !== undefined) return { ...base, verdict: "filtered", says: `eBay wouldn't send it to this search: ${firm.text}.` };
    if (reasons.some((reason) => reason.setting === "query")) return { ...base, verdict: "words", says: "eBay may not send it: its title lacks some of the search's words, though eBay also matches words in a listing's item details." };
    const hiding = reasons.find((reason) => reason.by === "watcher");
    if (hiding !== undefined) return { ...base, verdict: "hidden", says: `eBay would send it, but the watcher hides it: ${hiding.text}.` };
    if (!search.on) return { ...base, verdict: "off", says: "It fits, but the search is switched off." };
    if (snoozed) return { ...base, verdict: "off", says: "It fits, but the search is snoozed." };

    const result = results.get(search.id);
    const remembered = memory?.searches.get(search.id);
    const last = lastChecked.get(search.id);
    const failing = failures.get(search.id);
    if (failing !== undefined) return { ...base, verdict: "due", says: `It fits, but the search's last check failed: ${failing.message}.` };
    if (last === undefined) return { ...base, verdict: "due", says: "It fits, and the search hasn't been checked since the API started." };
    if (time - last > freshFor) return { ...base, verdict: "due", says: `It fits, and the search's last check was at ${ukTime(last)}, over six hours ago.` };
    if (result?.listings.some((entry) => entry.id === listing.id) === true) {
      const seen = remembered?.seen.get(listing.id);
      if (seen !== undefined && remembered !== undefined && seen.first === remembered.since) {
        return { ...base, verdict: "match", says: `It's a current match. It was already listed when the search started watching at ${ukTime(Date.parse(remembered.since))}, so it was counted as seen, not alerted.` };
      }
      return { ...base, verdict: "match", says: seen === undefined ? "It's a current match." : `It's a current match, first seen at ${ukTime(Date.parse(seen.first))}.` };
    }
    if (listing.listedAt !== null && Date.parse(listing.listedAt) > last) {
      return { ...base, verdict: "due", says: `It fits, and it was listed after the search's last check at ${ukTime(last)}. The next check is due by ${ukTime(last + search.everyMinutes * minuteMs)}.` };
    }
    if (result !== undefined && !result.complete) {
      return { ...base, verdict: "missed", says: "It fits, but eBay has more listings for this search than the watcher reads, so it may be past the newest the watcher sees." };
    }
    const unchecked = [
      ...((search.details !== null && search.detailsMode === "only") || search.hideDetails !== null ? ["its item details"] : []),
      ...(search.collection !== null ? ["the collection distance"] : []),
      ...(!search.ukOnly && listing.country !== "GB" ? ["whether it posts to the UK"] : []),
    ];
    if (unchecked.length > 0) {
      const which = unchecked.join(" and ");
      return { ...base, verdict: "missed", says: `It passes every filter and rule that can be checked here, but eBay didn't send it at the last check. ${which[0].toUpperCase()}${which.slice(1)} can't be checked here, so that may be why; otherwise it's eBay's own word matching. The search's cuts can show more.` };
    }
    return { ...base, verdict: "missed", says: "It passes every filter and rule that can be checked here, but eBay didn't send it at the last check: most likely eBay's own word matching. The search's cuts can show more." };
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
    for (const paused of optionsPaused.values()) {
      if (needsAPerson.includes(paused.reason)) found.push({ code: "deals-source", message: `The deal watcher can't read listings' options: ${paused.message}.` });
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
      const digestStatus = (at: number, time: Date) => {
        const sentToday = memory?.digested === londonTime(time).day;
        return { at: clock(at), sentToday, skippedToday: !sentToday && londonMinutes(time) >= at + digestWindowMinutes };
      };
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
        digest: list === null || list.digest === null ? null : digestStatus(list.digest, now),
      };
    },

    searches(now = new Date()) {
      return (list?.searches ?? []).map((search) => {
        const notes: string[] = [];
        if (search.readOptions && !readsOptions(search)) notes.push("readOptions does nothing here: the search names no size in GB or TB");
        for (const word of search.exclude) {
          const must = search.mustInclude.find((phrase) => alwaysExcluded(phrase, word));
          if (must !== undefined) notes.push(`nothing can match: exclude "${word}" hides every title with "${must}", which mustInclude needs`);
        }
        for (const name of search.avoid) {
          for (const word of avoidLists[name] ?? []) {
            const must = search.mustInclude.find((phrase) => alwaysExcluded(phrase, word));
            if (must !== undefined) notes.push(`nothing can match: the ${name} avoid list's "${word}" hides every title with "${must}", which mustInclude needs`);
          }
        }
        if (guideIsStale(search, now)) notes.push(`its guide price was set on ${search.guideDate}, over 30 days ago`);
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
          options: result?.options === undefined || result.options === null ? null : { ...result.options },
          notes,
          callsToday: memory?.callsToday.get(search.id) ?? 0,
          health: healthOf(search, now.getTime()),
        };
      });
    },

    hidden(id, now) {
      const search = list?.searches.find((entry) => entry.id === id);
      const result = results.get(id);
      if (search === undefined || !search.on || result === undefined || now.getTime() - result.checkedAt > freshFor) return null;
      return {
        id,
        name: search.name,
        checkedAt: new Date(result.checkedAt).toISOString(),
        hidden: { ...result.hidden },
        examples: Object.fromEntries(Object.entries(result.examples).map(([reason, titles]) => [reason, [...titles]])),
      };
    },

    matches(now, most = matchesShown, keep) {
      const groups: MatchGroup[] = [];
      for (const search of list?.searches ?? []) {
        const result = results.get(search.id);
        if (!search.on || result === undefined || now.getTime() - result.checkedAt > freshFor) continue;
        const seen = memory?.searches.get(search.id)?.seen;
        const kept = keep === undefined ? result.listings : result.listings.filter(keep);
        groups.push({
          id: search.id,
          name: search.name,
          group: search.group,
          source: search.source,
          checkedAt: new Date(result.checkedAt).toISOString(),
          count: kept.length,
          guidePrice: search.guidePrice,
          listings: kept.slice(0, Math.min(most, matchesShown)).map((listing) => describe(search, listing, result.listings, seen?.get(listing.id)?.first ?? null)),
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
        const ref = listing.ref;
        let kept = fullCache.get(ref);
        if (kept === undefined) {
          let pending = reading.get(ref);
          if (pending === undefined) {
            const stop = blocked(search.source, time);
            if (stop !== null) return { status: stop };
            pending = read(search.source, time, () => (source.full as NonNullable<Source["full"]>)(ref))
              .then((reply) => ("full" in reply ? reply.full : reply))
              .finally(() => reading.delete(ref));
            reading.set(ref, pending);
          }
          const outcome = await pending;
          if ("message" in outcome) return { status: "failed", ...outcome };
          kept = fullCache.get(ref) ?? { at: time, full: outcome };
          fullCache.set(ref, kept);
          for (const oldest of [...fullCache.keys()].slice(0, Math.max(0, fullCache.size - fullKept))) fullCache.delete(oldest);
        }
        const { listing: current, ...full } = kept.full;
        const firstSeen = memory?.searches.get(search.id)?.seen.get(id)?.first ?? null;
        return {
          status: "ok",
          searchId: search.id,
          searchName: search.name,
          fetchedAt: new Date(kept.at).toISOString(),
          listing: describe(search, { ...current, id, url: listing.url, detailsMatch: listing.detailsMatch, ...(listing.option === undefined ? {} : { option: listing.option }) }, result.listings, firstSeen),
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

    async cuts(id, now = new Date()) {
      const search = list?.searches.find((entry) => entry.id === id);
      if (search === undefined) return { status: "unknown" };
      const lookUp = options.sources[search.source]?.cuts;
      if (lookUp === undefined) return { status: "unsupported" };
      const stop = blocked(search.source, now.getTime());
      if (stop !== null) return { status: stop };
      const today = londonTime(now).day;
      if (cutCalls.day !== today) cutCalls = { day: today, count: 0 };
      const callsBefore = (memory?.counters.calls ?? 0) + pendingCalls;
      if (cutCalls.count + cutsCallsMost > Math.floor(limits().callsPerDay * cutsCallsShare) || callsBefore + cutsCallsMost > limits().callsPerDay) return { status: "limit" };
      let used = 0;
      const outcome = await read(search.source, now.getTime(), async () => {
        try {
          const reply = await lookUp(search);
          used = reply.calls;
          return reply;
        } catch (error) {
          if (error instanceof SourceError) used = error.calls;
          throw error;
        }
      });
      cutCalls.count += Math.max(used, 1);
      return "cuts" in outcome ? { status: "ok", value: { id: search.id, name: search.name, query: search.query, ...outcome.cuts } } : { status: "failed", message: outcome.message };
    },

    async explain(itemNumber, searchId, now = new Date()) {
      const known = list?.searches ?? [];
      const named = searchId === null ? null : known.find((search) => search.id === searchId);
      if (named === undefined) return { status: "unknown" };
      const sourceName = named?.source ?? "ebay";
      const lookUp = options.sources[sourceName]?.item;
      if (lookUp === undefined) return { status: "unsupported" };
      const stop = blocked(sourceName, now.getTime());
      if (stop !== null) return { status: stop };
      const outcome = await read(sourceName, now.getTime(), () => lookUp(itemNumber));
      if (!("item" in outcome)) return { status: "failed", ...outcome };
      const { full, categoryIds, options: choices } = outcome.item;
      const listing = full.listing;
      const candidates = named === null ? pickSearches(known.filter((search) => search.source === sourceName), listing.title) : [named];
      return {
        status: "ok",
        value: {
          checkedAt: now.toISOString(),
          item: {
            id: listing.id,
            title: listing.title,
            price: listing.price,
            postage: listing.postage,
            total: totalPrice(listing),
            condition: listing.condition,
            buying: [...listing.buying],
            country: listing.country,
            listedAt: listing.listedAt,
            endsAt: listing.endsAt,
            sellerType: listing.sellerType,
            sellerPercent: listing.sellerPercent,
            sellerFeedback: listing.sellerFeedback,
            url: listing.url,
            categoryPath: full.categoryPath,
            categoryIds: [...categoryIds],
            options: choices === null ? null : choices.length,
            inStock: full.inStock,
          },
          searches: candidates.map((search) => explainOne(search, full, categoryIds, choices, now)),
          about: explainNote,
        },
      };
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