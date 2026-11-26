import type { Notification } from "../notify/notifier.js";
import { boardMs, fetchBoard, type Board, type Departure, type TrainSettings } from "./board.js";

export type AlertSettings = { days: string[]; start: number; end: number; reminder: number };

export type Told = { cancelled: boolean; late: number | null; platform: string | null };

export type Watch<Seen, Kept> = {
  get: () => Promise<Seen>;
  reminder: (seen: Seen, now: number) => Notification;
  first: (seen: Seen, now: number) => Kept;
  fresh: () => Kept;
  changes: (seen: Seen, kept: Kept, now: number) => { lines: string[]; cancelled: boolean; next: Kept };
  left: (seen: Seen, now: number) => number;
};

export type CheckResult = "not today" | "too early" | "finished" | "waiting" | "busy" | "failed" | "reminded" | "checked" | "changed";

export const dayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const alertRows = 10;
export const lateMinutes = 5;
export const recoveredMinutes = 2;
export const tickMs = 60_000;
export const checkEveryMs = 2 * 60_000;
export const failingForMs = 5 * 60_000;
export const boardAheadMinutes = 120;
export const afterWindowMinutes = 60;
export const latestWindowEnd = 22 * 60 + 59;

export function clockMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

export function clockText(minutes: number): string {
  const inDay = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
}

export function readDays(value: string): string[] | null {
  const given = value.split(",").map((day) => day.trim().toLowerCase());
  if (given.some((day) => !(dayNames as readonly string[]).includes(day))) return null;
  return dayNames.filter((day) => given.includes(day));
}

export function readWindow(value: string): { start: number; end: number } | null {
  const match = /^(\d\d:\d\d) *- *(\d\d:\d\d)$/.exec(value);
  if (match === null) return null;
  const start = clockMinutes(match[1]);
  const end = clockMinutes(match[2]);
  if (start === null || end === null || start >= end || end > latestWindowEnd) return null;
  return { start, end };
}

export function londonNow(now: Date): { day: string; weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${part("year")}-${part("month")}-${part("day")}`, weekday: part("weekday").toLowerCase(), minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

export function boardForAlerts(settings: TrainSettings, fetcher: typeof fetch = fetch): () => Promise<Board> {
  return () => fetchBoard(settings, undefined, fetcher, boardMs, alertRows);
}

export function lateBy(departure: Departure): number | null | undefined {
  const expected = departure.expected.toLowerCase();
  if (expected === "on time") return 0;
  if (expected === "delayed") return null;
  const due = clockMinutes(departure.due);
  const at = clockMinutes(departure.expected);
  if (due === null || at === null) return undefined;
  const late = at - due;
  return Math.max(late < -720 ? late + 1440 : late > 720 ? late - 1440 : late, 0);
}

export function inWindow(departure: Departure, settings: Pick<AlertSettings, "start" | "end">): boolean {
  const due = clockMinutes(departure.due);
  return due !== null && due >= settings.start && due <= settings.end;
}

export function trainKeys(trains: Departure[]): string[] {
  return trains.map((departure) => (trains.filter((other) => other.due === departure.due).length > 1 ? `${departure.due}|${departure.destination ?? ""}` : departure.due));
}

export function boardReach(departures: Departure[], nowMinutes: number): number | null {
  let furthest: number | null = null;
  for (const departure of departures) {
    const due = clockMinutes(departure.due);
    if (due === null) continue;
    const gap = due - nowMinutes;
    const ahead = gap < -720 ? gap + 1440 : gap > 720 ? gap - 1440 : gap;
    if (furthest === null || ahead > furthest) furthest = ahead;
  }
  return furthest === null ? null : nowMinutes + furthest;
}

export function withReason(sentence: string, reason: string | null): string {
  if (reason === null) return sentence;
  return `${sentence} ${reason}${/[.!?]$/.test(reason) ? "" : "."}`;
}

function platformPart(departure: Departure): string {
  return departure.platform === null ? "" : `, platform ${departure.platform}`;
}

export function describe(departure: Departure): string {
  if (departure.cancelled) return withReason(`${departure.due} cancelled.`, departure.reason);
  const late = lateBy(departure);
  if (late === 0) return `${departure.due} on time${platformPart(departure)}.`;
  if (late === null) return withReason(`${departure.due} delayed, with no expected time yet${platformPart(departure)}.`, departure.reason);
  if (late === undefined) return `${departure.due} shows "${departure.expected}"${platformPart(departure)}.`;
  return withReason(`${departure.due} expected ${departure.expected}, ${late} minute${late === 1 ? "" : "s"} late${platformPart(departure)}.`, departure.reason);
}

export function reminderFor(board: Board, settings: Pick<AlertSettings, "start" | "end">, nowMinutes: number): Notification {
  const trains = board.departures.filter((departure) => inWindow(departure, settings));
  const lines = trains.length === 0 ? [`No trains due between ${clockText(settings.start)} and ${clockText(settings.end)} on the board.`] : trains.map(describe);
  const reach = boardReach(board.departures, nowMinutes);
  if (reach !== null && reach < settings.end) lines.push(`The board only reaches ${clockText(reach)} so far, so later trains in the window will only be sent if something's wrong with them.`);
  if (board.buses > 0) lines.push(`The board also lists ${board.buses} bus${board.buses === 1 ? "" : "es"}.`);
  lines.push(...board.messages);
  return { title: "Morning trains", message: lines.join("\n"), tags: "train2" };
}

export function toldFrom(trains: Departure[]): Map<string, Told> {
  const keys = trainKeys(trains);
  return new Map(
    trains.map((departure, index) => {
      const late = lateBy(departure);
      return [keys[index], { cancelled: departure.cancelled, late: late === undefined ? 0 : late, platform: departure.platform }];
    }),
  );
}

export function changesFor(trains: Departure[], told: Map<string, Told>, board?: { now: number; reach: number | null; full: boolean }): { lines: string[]; cancelled: boolean; next: Map<string, Told> } {
  const lines: string[] = [];
  const next = new Map(told);
  const keys = trainKeys(trains);
  let cancelled = false;
  for (const [index, departure] of trains.entries()) {
    const key = keys[index];
    const before = told.get(key) ?? { cancelled: false, late: 0, platform: null };
    const name = `The ${departure.due}`;
    if (departure.cancelled) {
      if (!before.cancelled) {
        lines.push(withReason(`${name} is cancelled.`, departure.reason));
        cancelled = true;
      }
      next.set(key, { ...before, cancelled: true });
      continue;
    }
    const late = lateBy(departure);
    const after: Told = { ...before, cancelled: false };
    if (before.cancelled) {
      const how = late === 0 || late === undefined ? "" : late === null ? ", delayed with no expected time yet" : `, expected ${departure.expected}`;
      lines.push(`${name} is running again${how}.`);
      after.late = late === undefined ? 0 : late;
    } else if (late === null) {
      if (before.late !== null && before.late < lateMinutes) {
        lines.push(withReason(`${name} is delayed, with no expected time yet.`, departure.reason));
        after.late = null;
      }
    } else if (late !== undefined && late >= lateMinutes) {
      if (before.late === null || before.late < lateMinutes || Math.abs(late - before.late) >= lateMinutes) {
        lines.push(withReason(`${name} is now expected ${departure.expected}, ${late} minutes late.`, departure.reason));
        after.late = late;
      }
    } else if (late !== undefined && (before.late === null || before.late >= lateMinutes) && (late <= recoveredMinutes || (before.late !== null && before.late - late >= lateMinutes))) {
      lines.push(late === 0 ? `${name} is back on time.` : `${name} is now expected ${departure.expected}, only ${late} minute${late === 1 ? "" : "s"} late.`);
      after.late = late;
    }
    if (departure.platform !== null) {
      if (before.platform !== null && before.platform !== departure.platform) lines.push(`${name} now leaves from platform ${departure.platform}, not ${before.platform}.`);
      after.platform = departure.platform;
    }
    next.set(key, after);
  }
  const present = new Set(trains.map((departure) => departure.due));
  for (const [key, before] of told) {
    const due = key.split("|")[0];
    const dueMinutes = clockMinutes(due);
    if (board === undefined || board.full || board.reach === null || present.has(due) || before.cancelled || dueMinutes === null || board.now >= dueMinutes - 1 || board.reach <= dueMinutes) continue;
    lines.push(`The ${due} has gone from the board before it was due. It may have been cancelled or replaced by a bus.`);
    next.set(key, { ...before, cancelled: true });
  }
  return { lines, cancelled, next };
}

export function changeNotification(lines: string[], cancelled: boolean): Notification {
  return { title: lines.length === 1 ? "Train change" : "Train changes", message: lines.join("\n"), tags: "warning", ...(cancelled ? { priority: 4 as const } : {}) };
}

export type AlertHooks = { settings: AlertSettings; send: (notification: Notification) => Promise<void>; changed?: (lines: string[], at: Date) => void; warn?: (message: string) => void; info?: (message: string) => void };

export function boardWatch(settings: AlertSettings, board: () => Promise<Board>): Watch<Board, Map<string, Told>> {
  const inside = (seen: Board) => seen.departures.filter((departure) => inWindow(departure, settings));
  return {
    get: board,
    reminder: (seen, now) => reminderFor(seen, settings, now),
    first: (seen) => toldFrom(inside(seen)),
    fresh: () => new Map(),
    changes: (seen, kept, now) => changesFor(inside(seen), kept, { now, reach: boardReach(seen.departures, now), full: seen.departures.length >= alertRows }),
    left: (seen) => inside(seen).length,
  };
}

export function createTrainAlerts(options: AlertHooks & { board: () => Promise<Board> }) {
  return createAlerts({ ...options, watch: boardWatch(options.settings, options.board) });
}

export function createAlerts<Seen, Kept>(options: AlertHooks & { watch: Watch<Seen, Kept> }) {
  const { settings, watch } = options;
  let day = "";
  let reminded = false;
  let finished = false;
  let told = watch.fresh();
  let lastAsked = 0;
  let failingSince: number | null = null;
  let failureSent = false;
  let running = false;
  let unsent: string[] = [];
  let unsentCancelled = false;

  async function check(now: Date): Promise<CheckResult> {
    const time = londonNow(now);
    if (time.day !== day) {
      day = time.day;
      reminded = false;
      finished = false;
      told = watch.fresh();
      lastAsked = 0;
      failingSince = null;
      failureSent = false;
      unsent = [];
      unsentCancelled = false;
    }
    if (!settings.days.includes(time.weekday)) return "not today";
    if (time.minutes < settings.reminder) return "too early";
    if (finished) return "finished";
    if (time.minutes > settings.end + afterWindowMinutes) {
      if (failureSent) await options.send({ title: "Morning trains", message: "Stopped checking your trains for today, as the departure board still isn't answering.", tags: "warning" });
      finished = true;
      return "finished";
    }
    if (now.getTime() - lastAsked < checkEveryMs - tickMs / 2) return "waiting";
    lastAsked = now.getTime();
    let seen: Seen;
    try {
      seen = await watch.get();
    } catch (error) {
      const why = error instanceof Error ? error.message : "no reason given";
      if (failingSince === null) options.warn?.(`the train check couldn't get the departure board: ${why}`);
      failingSince ??= now.getTime();
      if (!failureSent && now.getTime() - failingSince >= failingForMs) {
        const since = clockText(londonNow(new Date(failingSince)).minutes);
        const until = clockText(settings.end + afterWindowMinutes);
        await options.send({ title: "Morning trains", message: `${reminded ? "Couldn't check your trains" : "Couldn't get your morning trains"} since ${since}: ${why}. Still trying, until ${until} at the latest.`, tags: "warning" });
        failureSent = true;
      }
      return "failed";
    }
    if (failingSince !== null) {
      if (failureSent && (reminded || time.minutes > settings.end)) await options.send({ title: "Morning trains", message: "The departure board is answering again, so your trains are being checked again.", tags: "white_check_mark" });
      options.info?.("the train check can reach the departure board again");
      failureSent = false;
      failingSince = null;
    }
    let startedLate = false;
    if (!reminded) {
      if (time.minutes <= settings.end) {
        await options.send(watch.reminder(seen, time.minutes));
        reminded = true;
        told = watch.first(seen, time.minutes);
        return "reminded";
      }
      reminded = true;
      told = watch.fresh();
      startedLate = true;
    }
    const changes = watch.changes(seen, told, time.minutes);
    const lines = [...unsent, ...changes.lines];
    const cancelled = unsentCancelled || changes.cancelled;
    told = changes.next;
    if (changes.lines.length > 0 && !startedLate) options.changed?.(changes.lines, now);
    if (lines.length > 0) {
      unsent = lines;
      unsentCancelled = cancelled;
      await options.send(changeNotification(lines, cancelled));
      unsent = [];
      unsentCancelled = false;
    }
    if (time.minutes > settings.end && watch.left(seen, time.minutes) === 0) finished = true;
    return lines.length > 0 ? "changed" : finished ? "finished" : "checked";
  }

  return async function checkOnce(now: Date): Promise<CheckResult> {
    if (running) return "busy";
    running = true;
    try {
      return await check(now);
    } finally {
      running = false;
    }
  };
}
