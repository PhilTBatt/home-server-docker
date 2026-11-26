import type { Notification } from "../notify/notifier.js";
import { alertRows, boardReach, changesFor, clockText, createAlerts, inWindow, lateBy, toldFrom, trainKeys, withReason, type AlertHooks, type AlertSettings, type Told, type Watch } from "./alerts.js";
import { boardMs, type Departure, type TrainSettings } from "./board.js";
import { bestOf, connectionOf, expectedOffset, fetchJourneyBoards, journeysFrom, offset, optionsFor, type Connection, type Journey, type JourneyBoards, type Journeys } from "./journeys.js";

export type Link = { connection: string | null; arriving: string | null; platform: string | null; tights: string[] };

export type JourneyKept = { first: Map<string, Told>; links: Map<string, Link> };

function minutes(count: number): string {
  return `${count} minute${count === 1 ? "" : "s"}`;
}

export function firstOf(journey: Journey): Departure {
  return { due: journey.leaves, expected: journey.expected, platform: null, cancelled: journey.cancelled, reason: journey.reason, destination: journey.bus ? "bus" : null };
}

export function arrivalText(times: { arrives: string; arrivesExpected: string }): string {
  return /^\d\d:\d\d$/.test(times.arrivesExpected) ? times.arrivesExpected : times.arrives;
}

function intoText(journey: Journey): string {
  if (/^\d\d:\d\d$/.test(journey.arrivesExpected)) return journey.arrivesExpected === journey.arrives ? journey.arrives : `${journey.arrivesExpected} (due ${journey.arrives})`;
  return journey.arrivesExpected === "On time" ? journey.arrives : `${journey.arrives} (${journey.arrivesExpected.toLowerCase()})`;
}

export function connectionText(connection: Connection): string {
  return `the ${connection.leaves}${connection.bus ? " (a bus)" : ""}${connection.platform === null ? "" : `, platform ${connection.platform}`}, ${minutes(connection.change)} to change, in at ${arrivalText(connection)}`;
}

export function describeJourney(journey: Journey, walk: number): string {
  const name = `${journey.leaves}${journey.bus ? " (a bus)" : ""}`;
  if (journey.cancelled) return withReason(`${name} cancelled.`, journey.reason);
  const late = lateBy(firstOf(journey));
  const start = late === 0 ? `${name} on time` : late === null ? `${name} delayed, with no expected time yet` : late === undefined ? `${name} shows "${journey.expected}"` : `${name} expected ${journey.expected}, ${minutes(late)} late`;
  const parts = [withReason(`${start}, changing at ${intoText(journey)}${journey.platform === null ? "" : `, platform ${journey.platform}`}.`, late === 0 ? null : journey.reason)];
  if (journey.tight !== null) parts.push(`Tight: ${connectionText(journey.tight)}, under your ${minutes(walk)}.`);
  if (journey.best !== null) parts.push(`${journey.tight === null ? "Connection" : "Otherwise"}: ${connectionText(journey.best)}.`);
  if (journey.fallback !== null) parts.push(`Fallback: the ${journey.fallback.leaves}, in at ${arrivalText(journey.fallback)}.`);
  if (journey.best === null && journey.tight === null) parts.push(expectedOffset(0, journey.arrives, journey.arrivesExpected) === null ? "Its connection can't be worked out until it has an expected time for the change." : "No connection on the board yet.");
  return parts.join(" ");
}

export function journeyReminder(seen: Journeys, settings: Pick<AlertSettings, "start" | "end">, now: number): Notification {
  const inside = seen.journeys.filter((journey) => inWindow(firstOf(journey), settings));
  const lines = inside.length === 0 ? [`No trains due between ${clockText(settings.start)} and ${clockText(settings.end)} on the board.`] : inside.map((journey) => describeJourney(journey, seen.walk));
  const reach = boardReach(seen.journeys.map(firstOf), now);
  if (reach !== null && reach < settings.end) lines.push(`The board only reaches ${clockText(reach)} so far, so later trains in the window will only be sent if something's wrong with them.`);
  lines.push(...seen.messages);
  return { title: "Morning trains", message: lines.join("\n"), tags: "train2" };
}

function linkOf(journey: Journey, tights: string[] = []): Link {
  const best = journey.best;
  return { connection: best?.leaves ?? null, arriving: best === null ? null : arrivalText(best), platform: best?.platform ?? null, tights: journey.tight === null || tights.includes(journey.tight.leaves) ? tights : [...tights, journey.tight.leaves] };
}

export function journeyKept(seen: Journeys, settings: Pick<AlertSettings, "start" | "end">): JourneyKept {
  const inside = seen.journeys.filter((journey) => inWindow(firstOf(journey), settings));
  const keys = trainKeys(inside.map(firstOf));
  return { first: toldFrom(inside.map(firstOf)), links: new Map(inside.map((journey, index) => [keys[index], linkOf(journey)])) };
}

export function journeyChanges(boards: JourneyBoards, kept: JourneyKept, now: number, walk: number, settings: Pick<AlertSettings, "start" | "end">): { lines: string[]; cancelled: boolean; next: JourneyKept } {
  const seen = journeysFrom(boards, walk, now, alertRows);
  const inside = seen.journeys.filter((journey) => inWindow(firstOf(journey), settings));
  const firsts = inside.map(firstOf);
  const base = changesFor(firsts, kept.first, { now, reach: boardReach(seen.journeys.map(firstOf), now), full: boards.arrivals.legs.length >= alertRows });
  const lines = [...base.lines];
  let urgent = base.cancelled;
  const links = new Map(kept.links);
  const keys = trainKeys(firsts);
  for (const [index, journey] of inside.entries()) {
    const key = keys[index];
    const before = kept.links.get(key);
    if (before === undefined) {
      links.set(key, linkOf(journey));
      continue;
    }
    const reach = expectedOffset(now, journey.arrives, journey.arrivesExpected);
    if (journey.cancelled || reach === null) continue;
    const name = `The ${journey.leaves}`;
    const current = journey.best;
    if (current === null) {
      if (before.connection !== null) {
        lines.push(`${name} has no connection on the board now.`);
        urgent = true;
      }
      links.set(key, { ...before, connection: null, arriving: null, platform: null });
      continue;
    }
    if (before.connection === null) {
      lines.push(`${name} connects with ${connectionText(current)}.`);
      links.set(key, linkOf(journey, before.tights));
      continue;
    }
    if (current.leaves === before.connection) {
      if (before.platform !== null && current.platform !== null && before.platform !== current.platform) lines.push(`The ${current.leaves} connection now leaves from platform ${current.platform}, not ${before.platform}.`);
      if (journey.tight !== null && !before.tights.includes(journey.tight.leaves)) lines.push(`The ${journey.tight.leaves} connection is now possible from the ${journey.leaves}, but tight: ${minutes(journey.tight.change)} to change, under your ${minutes(walk)}, in at ${arrivalText(journey.tight)}.`);
      links.set(key, { ...linkOf(journey, before.tights), platform: current.platform ?? before.platform });
      continue;
    }
    const options = optionsFor(journey, boards.departures.legs, now);
    const old = options.find((option) => option.leg.leaves === before.connection) ?? null;
    const oldLeg = boards.departures.legs.find((leg) => leg.leaves === before.connection) ?? null;
    const oldArriving = old?.arriving ?? (before.arriving === null ? null : offset(now, before.arriving));
    const currentArriving = expectedOffset(now, current.arrives, current.arrivesExpected) ?? offset(now, current.arrives);
    if (oldArriving !== null && currentArriving !== null && currentArriving <= oldArriving) {
      const strict = bestOf(options.filter((option) => option.change >= 1), walk + 1);
      if (strict === null || strict.leg.leaves === before.connection || strict.arriving > oldArriving) continue;
      const better = connectionOf(strict);
      lines.push(`${name} now makes ${connectionText(better)}.`);
      links.set(key, { connection: better.leaves, arriving: arrivalText(better), platform: better.platform, tights: before.tights });
      continue;
    }
    const into = /^\d\d:\d\d$/.test(journey.arrivesExpected) ? journey.arrivesExpected : journey.arrives;
    const why = oldLeg === null ? `The ${before.connection} connection has gone from the board.` : oldLeg.cancelled ? withReason(`The ${before.connection} connection is cancelled.`, oldLeg.reason) : old !== null && old.change >= 1 ? `${name} is now expected in at ${into}, leaving ${minutes(old.change)} for the ${before.connection}, under your ${minutes(walk)}.` : `${name} is now expected in at ${into}, after the ${before.connection} leaves.`;
    lines.push(`${why} Next best: ${connectionText(current)}.`);
    urgent = true;
    links.set(key, linkOf(journey, before.tights));
  }
  return { lines, cancelled: urgent, next: { first: base.next, links } };
}

export function journeyWatch(settings: AlertSettings, boards: () => Promise<JourneyBoards>, walk: number): Watch<JourneyBoards, JourneyKept> {
  const journeys = (seen: JourneyBoards, now: number) => journeysFrom(seen, walk, now, alertRows);
  return {
    get: boards,
    reminder: (seen, now) => journeyReminder(journeys(seen, now), settings, now),
    first: (seen, now) => journeyKept(journeys(seen, now), settings),
    fresh: () => ({ first: new Map(), links: new Map() }),
    changes: (seen, kept, now) => journeyChanges(seen, kept, now, walk, settings),
    left: (seen, now) => journeys(seen, now).journeys.filter((journey) => inWindow(firstOf(journey), settings)).length,
  };
}

export function journeysForAlerts(settings: TrainSettings, fetcher: typeof fetch = fetch): () => Promise<JourneyBoards> {
  return () => fetchJourneyBoards(settings, undefined, fetcher, boardMs, alertRows);
}

export function createJourneyAlerts(options: AlertHooks & { boards: () => Promise<JourneyBoards>; walk: number }) {
  return createAlerts({ ...options, watch: journeyWatch(options.settings, options.boards, options.walk) });
}
