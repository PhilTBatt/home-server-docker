import { clockMinutes, londonNow } from "./alerts.js";
import { askBoard, boardMs, messagesOf, onTime, placeName, text, type TrainSettings } from "./board.js";

export type FirstLeg = { leaves: string; expected: string; cancelled: boolean; bus: boolean; reason: string | null; arrives: string; arrivesExpected: string; platform: string | null };

export type SecondLeg = { leaves: string; expected: string; platform: string | null; destination: string | null; arrives: string; arrivesExpected: string; cancelled: boolean; bus: boolean; reason: string | null };

export type Connection = { leaves: string; expected: string; platform: string | null; destination: string | null; arrives: string; arrivesExpected: string; change: number; bus: boolean; reason: string | null };

export type Journey = FirstLeg & { tight: Connection | null; best: Connection | null; fallback: Connection | null };

export type Journeys = { from: string; via: string; to: string; walk: number; journeys: Journey[]; messages: string[] };

export type Arrivals = { from: string; via: string; legs: FirstLeg[]; messages: string[] };

export type Departures = { to: string; legs: SecondLeg[]; messages: string[] };

export type JourneyBoards = { arrivals: Arrivals; departures: Departures };

export type Option = { leg: SecondLeg; leaving: number; arriving: number; change: number };

export const journeyRows = 3;
export const arrivalRows = 5;
export const connectionRows = 10;

export function offset(now: number, value: string): number | null {
  const at = clockMinutes(value);
  if (at === null) return null;
  const gap = at - now;
  return gap < -720 ? gap + 1440 : gap > 720 ? gap - 1440 : gap;
}

export function expectedOffset(now: number, scheduled: string, expected: string): number | null {
  if (onTime(expected) === "On time") return offset(now, scheduled);
  return /^\d\d:\d\d$/.test(expected) ? offset(now, expected) : null;
}

function serviceList(value: unknown, board: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && Array.isArray((value as Record<string, unknown>).service)) return (value as Record<string, unknown>).service as unknown[];
  throw new Error(`${board}'s trains weren't a list`);
}

function servicesOf(fields: Record<string, unknown>, board: string): { item: Record<string, unknown>; bus: boolean }[] {
  const trains = serviceList(fields.trainServices, board).map((item) => ({ item, bus: false }));
  const buses = serviceList(fields.busServices, board).map((item) => ({ item, bus: true }));
  return [...trains, ...buses].flatMap(({ item, bus }) => (typeof item === "object" && item !== null && !Array.isArray(item) ? [{ item: item as Record<string, unknown>, bus }] : []));
}

function callingPoint(groups: unknown, crs: string): Record<string, unknown> | null {
  for (const group of Array.isArray(groups) ? groups : [groups]) {
    if (typeof group !== "object" || group === null) continue;
    const points = (group as Record<string, unknown>).callingPoint;
    for (const point of Array.isArray(points) ? points : [points]) {
      if (typeof point === "object" && point !== null && (point as Record<string, unknown>).crs === crs) return point as Record<string, unknown>;
    }
  }
  return null;
}

function reasonOf(fields: Record<string, unknown>, cancelled: boolean): string | null {
  return text(cancelled ? fields.cancelReason : (fields.delayReason ?? fields.cancelReason), 200);
}

function shownAt(point: Record<string, unknown>): string | null {
  const actual = text(point.at, 20);
  return actual !== null && actual.toLowerCase() !== "no report" ? actual : (text(point.et, 20) ?? actual);
}

function firstLegOf(fields: Record<string, unknown>, from: string, bus: boolean): FirstLeg | null {
  const point = callingPoint(fields.previousCallingPoints, from);
  if (point === null) return null;
  const leaves = text(point.st, 10);
  const left = shownAt(point);
  const arrives = text(fields.sta, 10);
  const shownIn = text(fields.eta, 20);
  if (leaves === null || left === null || arrives === null || shownIn === null || clockMinutes(leaves) === null || clockMinutes(arrives) === null) return null;
  const expected = onTime(left);
  const arrivesExpected = onTime(shownIn);
  const cancelled = fields.isCancelled === true || fields.filterLocationCancelled === true || point.isCancelled === true || expected.toLowerCase() === "cancelled" || arrivesExpected.toLowerCase() === "cancelled";
  return { leaves, expected, cancelled, bus, reason: reasonOf(fields, cancelled), arrives, arrivesExpected, platform: text(fields.platform, 10) };
}

function secondLegOf(fields: Record<string, unknown>, to: string, bus: boolean): SecondLeg | null {
  const point = callingPoint(fields.subsequentCallingPoints, to);
  const leaves = text(fields.std, 10);
  const shown = text(fields.etd, 20);
  if (point === null || leaves === null || shown === null || clockMinutes(leaves) === null) return null;
  const arrives = text(point.st, 10);
  const shownIn = text(point.et, 20) ?? text(point.at, 20);
  if (arrives === null || shownIn === null || clockMinutes(arrives) === null) return null;
  const expected = onTime(shown);
  const arrivesExpected = onTime(shownIn);
  const cancelled = fields.isCancelled === true || fields.filterLocationCancelled === true || point.isCancelled === true || expected.toLowerCase() === "cancelled" || arrivesExpected.toLowerCase() === "cancelled";
  return { leaves, expected, platform: text(fields.platform, 10), destination: placeName(fields.destination), arrives, arrivesExpected, cancelled, bus, reason: reasonOf(fields, cancelled) };
}

function boardFields(body: unknown, crs: string, board: string, kind: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error(`${board}'s reply wasn't ${kind}`);
  const fields = body as Record<string, unknown>;
  if (fields.crs !== crs && typeof fields.generatedAt !== "string") throw new Error(`${board}'s reply wasn't ${kind}`);
  return fields;
}

export function readArrivals(body: unknown, settings: { from: string; at: string }): Arrivals {
  const fields = boardFields(body, settings.at, "the arrival board", "an arrival board");
  const legs = servicesOf(fields, "the arrival board").flatMap(({ item, bus }) => {
    const leg = firstLegOf(item, settings.from, bus);
    return leg === null ? [] : [leg];
  });
  return { from: text(fields.filterLocationName) ?? settings.from, via: text(fields.locationName) ?? settings.at, legs, messages: messagesOf(fields.nrccMessages) };
}

export function readDepartures(body: unknown, settings: { at: string; to: string }): Departures {
  const fields = boardFields(body, settings.at, "the detailed departure board", "a departure board");
  const legs = servicesOf(fields, "the detailed departure board").flatMap(({ item, bus }) => {
    const leg = secondLegOf(item, settings.to, bus);
    return leg === null ? [] : [leg];
  });
  return { to: text(fields.filterLocationName) ?? settings.to, legs, messages: messagesOf(fields.nrccMessages) };
}

export function optionsFor(first: FirstLeg, departures: SecondLeg[], now: number): Option[] {
  if (first.cancelled) return [];
  const reach = expectedOffset(now, first.arrives, first.arrivesExpected);
  if (reach === null) return [];
  return departures.flatMap((leg) => {
    if (leg.cancelled) return [];
    const due = offset(now, leg.leaves);
    const dueIn = offset(now, leg.arrives);
    if (due === null || dueIn === null) return [];
    const leaving = expectedOffset(now, leg.leaves, leg.expected) ?? due;
    const arriving = expectedOffset(now, leg.arrives, leg.arrivesExpected) ?? dueIn + Math.max(0, leaving - due);
    return [{ leg, leaving, arriving, change: leaving - reach }];
  });
}

const sooner = (a: Option, b: Option) => a.arriving - b.arriving || a.leaving - b.leaving;

export function bestOf(options: Option[], walk: number): Option | null {
  return options.filter((option) => option.change >= walk).sort(sooner)[0] ?? null;
}

export function connectionOf(option: Option): Connection {
  const { leg } = option;
  return { leaves: leg.leaves, expected: leg.expected, platform: leg.platform, destination: leg.destination, arrives: leg.arrives, arrivesExpected: leg.arrivesExpected, change: option.change, bus: leg.bus, reason: leg.reason };
}

export function connectionsFor(first: FirstLeg, departures: SecondLeg[], walk: number, now: number): Pick<Journey, "tight" | "best" | "fallback"> {
  const options = optionsFor(first, departures, now).filter((option) => option.change >= 1);
  const best = bestOf(options, walk);
  const fallback = best === null ? null : (options.filter((option) => option !== best && option.change >= walk && option.leaving >= best.leaving).sort(sooner)[0] ?? null);
  const tight = options.filter((option) => option.change < walk && (best === null || option.arriving < best.arriving)).sort(sooner)[0] ?? null;
  return { tight: tight === null ? null : connectionOf(tight), best: best === null ? null : connectionOf(best), fallback: fallback === null ? null : connectionOf(fallback) };
}

export function journeysFrom(boards: JourneyBoards, walk: number, now: number, rows = journeyRows): Journeys {
  const legs = boards.arrivals.legs
    .map((leg, index) => ({ leg, index, at: offset(now, leg.leaves) ?? 0 }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .slice(0, rows)
    .map(({ leg }) => leg);
  const messages = [...new Set([...boards.arrivals.messages, ...boards.departures.messages])].slice(0, 3);
  return { from: boards.arrivals.from, via: boards.arrivals.via, to: boards.departures.to, walk, journeys: legs.map((leg) => ({ ...leg, ...connectionsFor(leg, boards.departures.legs, walk, now) })), messages };
}

export function detailedBoardUrl(boardUrl: string): string | null {
  if (boardUrl.endsWith("/GetDepBoardWithDetails")) return boardUrl;
  return boardUrl.endsWith("/GetDepartureBoard") ? `${boardUrl.slice(0, -"GetDepartureBoard".length)}GetDepBoardWithDetails` : null;
}

export async function fetchJourneyBoards(settings: TrainSettings, signal?: AbortSignal, fetcher: typeof fetch = fetch, ms = boardMs, rows = arrivalRows): Promise<JourneyBoards> {
  const journey = settings.journey;
  if (journey === undefined) throw new Error("no change station is set");
  const [arrivals, departures] = await Promise.all([
    askBoard({ url: `${journey.arrivalsUrl}/${journey.at}?numRows=${rows}&filterCrs=${settings.from}&filterType=from`, key: journey.arrivalsKey, name: "the arrival board", setting: "TRAINS_ARRIVALS_URL" }, signal, fetcher, ms),
    askBoard({ url: `${journey.detailsUrl}/${journey.at}?numRows=${connectionRows}&filterCrs=${settings.to}&filterType=to`, key: settings.key, name: "the detailed departure board", setting: "TRAINS_BOARD_URL" }, signal, fetcher, ms),
  ]);
  return { arrivals: readArrivals(arrivals, { from: settings.from, at: journey.at }), departures: readDepartures(departures, { at: journey.at, to: settings.to }) };
}

export async function fetchJourneys(settings: TrainSettings, signal?: AbortSignal, fetcher: typeof fetch = fetch, now: () => Date = () => new Date(), ms = boardMs): Promise<Journeys> {
  const boards = await fetchJourneyBoards(settings, signal, fetcher, ms);
  return journeysFrom(boards, settings.journey?.walk ?? 0, londonNow(now()).minutes);
}
