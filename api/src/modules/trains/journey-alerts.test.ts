import assert from "node:assert/strict";
import { test } from "node:test";
import type { Notification } from "../notify/notifier.js";
import type { AlertSettings } from "./alerts.js";
import type { TrainSettings } from "./board.js";
import { arrivalText, connectionText, createJourneyAlerts, describeJourney, firstOf, journeyChanges, journeyKept, journeyReminder, journeysForAlerts, type JourneyKept } from "./journey-alerts.js";
import { journeysFrom, type FirstLeg, type JourneyBoards, type SecondLeg } from "./journeys.js";

const settings: AlertSettings = { days: ["mon", "wed"], start: 8 * 60, end: 8 * 60 + 40, reminder: 7 * 60 + 45 };
const now = 8 * 60 + 20;

function first(leaves: string, arrives: string, more: Partial<FirstLeg> = {}): FirstLeg {
  return { leaves, expected: "On time", cancelled: false, bus: false, reason: null, arrives, arrivesExpected: "On time", platform: "8", ...more };
}

function second(leaves: string, arrives: string, more: Partial<SecondLeg> = {}): SecondLeg {
  return { leaves, expected: "On time", platform: "16", destination: "Epsilon", arrives, arrivesExpected: "On time", cancelled: false, bus: false, reason: null, ...more };
}

const usual = () => [second("08:45", "09:36"), second("09:00", "09:52", { destination: "Zeta" }), second("09:12", "10:29", { destination: "Beta", platform: "5B" })];

function boards(firsts: FirstLeg[], seconds: SecondLeg[] = usual(), messages: string[] = []): JourneyBoards {
  return { arrivals: { from: "Alpha", via: "Gamma", legs: firsts, messages }, departures: { to: "Beta", legs: seconds, messages: [] } };
}

function keptFor(seen: JourneyBoards, at = now): JourneyKept {
  return journeyKept(journeysFrom(seen, 3, at, 10), settings);
}

function step(seen: JourneyBoards, kept: JourneyKept, at = now) {
  return journeyChanges(seen, kept, at, 3, settings);
}

test("a journey is described with its first train, when it's in, the connection, any tight one and the fallback, never naming a station or destination", () => {
  const seen = journeysFrom(boards([first("08:33", "08:42"), first("08:44", "08:53", { expected: "08:50", arrivesExpected: "08:59", reason: "This train has been delayed by a fault" })]), 3, now);
  assert.equal(describeJourney(seen.journeys[0], 3), "08:33 on time, changing at 08:42, platform 8. Connection: the 08:45, platform 16, 3 minutes to change, in at 09:36. Fallback: the 09:00, in at 09:52.");
  assert.equal(describeJourney(seen.journeys[1], 3), "08:44 expected 08:50, 6 minutes late, changing at 08:59 (due 08:53), platform 8. This train has been delayed by a fault. Tight: the 09:00, platform 16, 1 minute to change, in at 09:52, under your 3 minutes. Otherwise: the 09:12, platform 5B, 13 minutes to change, in at 10:29.");
  const tight = journeysFrom(boards([first("08:33", "08:42", { arrivesExpected: "08:44", bus: true, platform: null })]), 3, now);
  assert.equal(describeJourney(tight.journeys[0], 3), "08:33 (a bus) on time, changing at 08:44 (due 08:42). Tight: the 08:45, platform 16, 1 minute to change, in at 09:36, under your 3 minutes. Otherwise: the 09:00, platform 16, 16 minutes to change, in at 09:52. Fallback: the 09:12, in at 10:29.");
  const odd = journeysFrom(boards([first("08:33", "08:42", { cancelled: true, reason: "This train has been cancelled" }), first("08:34", "08:43", { arrivesExpected: "Delayed", expected: "Delayed" }), first("08:35", "09:40")]), 3, now);
  assert.deepEqual(odd.journeys.map((journey) => describeJourney(journey, 3)), [
    "08:33 cancelled. This train has been cancelled.",
    "08:34 delayed, with no expected time yet, changing at 08:43 (delayed), platform 8. Its connection can't be worked out until it has an expected time for the change.",
    "08:35 on time, changing at 09:40, platform 8. No connection on the board yet.",
  ]);
  assert.equal(arrivalText({ arrives: "09:36", arrivesExpected: "09:40" }), "09:40");
  assert.equal(connectionText({ leaves: "09:00", expected: "On time", platform: null, destination: "Beta", arrives: "09:52", arrivesExpected: "Delayed", change: 1, bus: true, reason: null }), "the 09:00 (a bus), 1 minute to change, in at 09:52");
  assert.deepEqual(firstOf(odd.journeys[0]), { due: "08:33", expected: "On time", platform: null, cancelled: true, reason: "This train has been cancelled", destination: null });
});

test("the reminder gives the journeys leaving in the window, how far the board reaches, and the boards' messages", () => {
  const named = journeysFrom(boards([first("08:13", "08:22"), first("08:33", "08:42", { arrivesExpected: "08:44" })], usual()), 3, now, 10);
  const words = [journeyReminder(named, settings, now).message, ...journeyChanges(boards([first("08:13", "08:22", { cancelled: true }), first("08:33", "08:42", { arrivesExpected: "08:47" })], [second("08:45", "09:36", { cancelled: true }), second("09:00", "09:52", { platform: "1" })]), keptFor(boards([first("08:13", "08:22"), first("08:33", "08:42")])), now, 3, settings).lines].join(" ");
  for (const name of ["Alpha", "Gamma", "Beta", "Epsilon", "Zeta"]) assert.ok(!words.includes(name), `${name} in: ${words}`);
  const seen = journeysFrom(boards([first("07:55", "08:04"), first("08:13", "08:22"), first("08:33", "08:42")], usual(), ["Engineering works near Gamma."]), 3, 7 * 60 + 45, 10);
  const reminder = journeyReminder(seen, settings, 7 * 60 + 45);
  assert.deepEqual([reminder.title, reminder.tags], ["Morning trains", "train2"]);
  assert.deepEqual(reminder.message.split("\n"), [
    "08:13 on time, changing at 08:22, platform 8. Connection: the 08:45, platform 16, 23 minutes to change, in at 09:36. Fallback: the 09:00, in at 09:52.",
    "08:33 on time, changing at 08:42, platform 8. Connection: the 08:45, platform 16, 3 minutes to change, in at 09:36. Fallback: the 09:00, in at 09:52.",
    "The board only reaches 08:33 so far, so later trains in the window will only be sent if something's wrong with them.",
    "Engineering works near Gamma.",
  ]);
  const empty = journeyReminder(journeysFrom(boards([]), 3, 7 * 60 + 45), settings, 7 * 60 + 45);
  assert.equal(empty.message, "No trains due between 08:00 and 08:40 on the board.");
});

test("nothing changing says nothing, and a journey first seen after the reminder is noted without a word", () => {
  const seen = boards([first("08:33", "08:42")]);
  const kept = keptFor(seen);
  assert.deepEqual(step(seen, kept).lines, []);
  const later = boards([first("08:33", "08:42"), first("08:38", "08:47", { arrivesExpected: "08:50" })]);
  const result = step(later, kept);
  assert.deepEqual(result.lines, []);
  assert.equal(result.next.links.get("08:38")?.connection, "09:00");
});

test("losing the connection to the walk says by how much, gives the next best, and is urgent", () => {
  const kept = keptFor(boards([first("08:33", "08:42")]));
  const lost = step(boards([first("08:33", "08:42", { arrivesExpected: "08:43" })]), kept);
  assert.deepEqual(lost.lines, ["The 08:33 is now expected in at 08:43, leaving 2 minutes for the 08:45, under your 3 minutes. Next best: the 09:00, platform 16, 17 minutes to change, in at 09:52."]);
  assert.equal(lost.cancelled, true);
  assert.deepEqual(lost.next.links.get("08:33"), { connection: "09:00", arriving: "09:52", platform: "16", tights: ["08:45"] });
  const after = step(boards([first("08:33", "08:42", { arrivesExpected: "08:47" })]), kept);
  assert.deepEqual(after.lines, ["The 08:33 is now expected in at 08:47, after the 08:45 leaves. Next best: the 09:00, platform 16, 13 minutes to change, in at 09:52."]);
});

test("getting the connection back needs a minute more than the walk, so a train hovering at the walk doesn't flip back and forth", () => {
  let kept = keptFor(boards([first("08:33", "08:42")]));
  kept = step(boards([first("08:33", "08:42", { arrivesExpected: "08:43" })]), kept).next;
  const level = step(boards([first("08:33", "08:42")]), kept);
  assert.deepEqual(level.lines, [], "3 minutes again isn't enough to say it's back");
  assert.equal(level.next.links.get("08:33")?.connection, "09:00");
  const back = step(boards([first("08:33", "08:42", { arrivesExpected: "08:41" })]), level.next);
  assert.deepEqual(back.lines, ["The 08:33 now makes the 08:45, platform 16, 4 minutes to change, in at 09:36."]);
  assert.equal(back.cancelled, false);
  assert.equal(back.next.links.get("08:33")?.connection, "08:45");
  assert.equal(step(boards([first("08:33", "08:42", { arrivesExpected: "08:43" })]), back.next).lines.length, 1, "a real swing back down to 2 minutes is said again");
});

test("a cancelled or vanished connection says so, with the board's reason", () => {
  const kept = keptFor(boards([first("08:33", "08:42")]));
  const cancelled = step(boards([first("08:33", "08:42")], [second("08:45", "09:36", { cancelled: true, reason: "This train has been cancelled because of a fault" }), ...usual().slice(1)]), kept);
  assert.deepEqual(cancelled.lines, ["The 08:45 connection is cancelled. This train has been cancelled because of a fault. Next best: the 09:00, platform 16, 18 minutes to change, in at 09:52."]);
  assert.equal(cancelled.cancelled, true);
  const gone = step(boards([first("08:33", "08:42")], usual().slice(1)), kept);
  assert.deepEqual(gone.lines, ["The 08:45 connection has gone from the board. Next best: the 09:00, platform 16, 18 minutes to change, in at 09:52."]);
  const none = step(boards([first("08:33", "08:42")], []), kept);
  assert.deepEqual(none.lines, ["The 08:33 has no connection on the board now."]);
  assert.equal(none.cancelled, true);
  const again = step(boards([first("08:33", "08:42")]), none.next);
  assert.deepEqual(again.lines, ["The 08:33 connects with the 08:45, platform 16, 3 minutes to change, in at 09:36."]);
});

test("a new platform for the connection is said, and a sooner connection that becomes possible but tight is said once", () => {
  const kept = keptFor(boards([first("08:33", "08:42", { arrivesExpected: "08:44" })]));
  assert.equal(kept.links.get("08:33")?.connection, "09:00");
  const moved = step(boards([first("08:33", "08:42", { arrivesExpected: "08:44" })], [second("08:45", "09:36"), second("09:00", "09:52", { destination: "Zeta", platform: "17" })]), kept);
  assert.deepEqual(moved.lines, ["The 09:00 connection now leaves from platform 17, not 16."]);
  const quiet = keptFor(boards([first("08:33", "08:42", { arrivesExpected: "08:46" })]));
  assert.deepEqual(quiet.links.get("08:33")?.tights, []);
  const tight = step(boards([first("08:33", "08:42", { arrivesExpected: "08:46" })], [second("08:45", "09:36", { expected: "08:48", arrivesExpected: "09:39" }), ...usual().slice(1)]), quiet);
  assert.deepEqual(tight.lines, ["The 08:45 connection is now possible from the 08:33, but tight: 2 minutes to change, under your 3 minutes, in at 09:39."]);
  assert.deepEqual(step(boards([first("08:33", "08:42", { arrivesExpected: "08:46" })], [second("08:45", "09:36", { expected: "08:48", arrivesExpected: "09:39" }), ...usual().slice(1)]), tight.next).lines, []);
});

test("the first train's own news uses the usual rules, and a cancelled one or one with no time in says nothing about connections", () => {
  const kept = keptFor(boards([first("08:33", "08:42")]));
  const late = step(boards([first("08:33", "08:42", { expected: "08:40", arrivesExpected: "08:49", reason: "This train has been delayed by a fault" })]), kept);
  assert.deepEqual(late.lines, ["The 08:33 is now expected 08:40, 7 minutes late. This train has been delayed by a fault.", "The 08:33 is now expected in at 08:49, after the 08:45 leaves. Next best: the 09:00, platform 16, 11 minutes to change, in at 09:52."]);
  const cancelled = step(boards([first("08:33", "08:42", { cancelled: true, reason: "This train has been cancelled" })]), kept);
  assert.deepEqual(cancelled.lines, ["The 08:33 is cancelled. This train has been cancelled."]);
  const unknown = step(boards([first("08:33", "08:42", { expected: "Delayed", arrivesExpected: "Delayed" })]), kept);
  assert.deepEqual(unknown.lines, ["The 08:33 is delayed, with no expected time yet."]);
  assert.equal(unknown.next.links.get("08:33")?.connection, "08:45", "the connection is kept until there's a time to judge it by");
  const bus = keptFor(boards([first("08:33", "08:42"), first("08:33", "08:50", { bus: true })]));
  assert.deepEqual([...bus.links.keys()], ["08:33|", "08:33|bus"], "a bus at the same time as a train is kept apart from it");
});

test("the alerts send the journey reminder, then changes, and pass the changes on", async () => {
  const sent: Notification[] = [];
  const changed: string[][] = [];
  let seen = boards([first("08:33", "08:42")]);
  const check = createJourneyAlerts({ settings, walk: 3, boards: async () => seen, send: async (notification) => void sent.push(notification), changed: (lines) => void changed.push(lines) });
  assert.equal(await check(new Date("2026-11-25T07:40:00Z")), "too early");
  assert.equal(await check(new Date("2026-11-25T07:45:00Z")), "reminded");
  assert.match(sent[0].message, /^08:33 on time, changing at 08:42/);
  assert.equal(await check(new Date("2026-11-25T07:47:00Z")), "checked");
  seen = boards([first("08:33", "08:42", { arrivesExpected: "08:44" })]);
  assert.equal(await check(new Date("2026-11-25T07:49:00Z")), "changed");
  assert.deepEqual([sent[1].title, sent[1].priority], ["Train change", 4]);
  assert.match(sent[1].message, /^The 08:33 is now expected in at 08:44, leaving 1 minute for the 08:45/);
  assert.deepEqual(changed, [[sent[1].message]]);
  assert.equal(await check(new Date("2026-11-25T08:42:00Z")), "checked", "after the window, a journey still on the board is still watched");
  seen = boards([]);
  assert.equal(await check(new Date("2026-11-25T08:44:00Z")), "finished");
  assert.equal(await check(new Date("2026-11-26T07:45:00Z")), "not today");
});

test("the alerts ask both boards for ten rows", async () => {
  const asked: string[] = [];
  const trains: TrainSettings = { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board/GetDepartureBoard", journey: { at: "CCC", walk: 3, arrivalsKey: "test-arrivals-key", arrivalsUrl: "https://api1.raildata.org.uk/test-arrivals/GetArrBoardWithDetails", detailsUrl: "https://api1.raildata.org.uk/test-board/GetDepBoardWithDetails" } };
  const fetcher = (async (url: string) => (asked.push(url), new Response(JSON.stringify({ crs: "CCC", trainServices: [] }), { status: 200 }))) as typeof fetch;
  await journeysForAlerts(trains, fetcher)();
  assert.deepEqual(asked.map((url) => /numRows=(\d+)/.exec(url)?.[1]), ["10", "10"]);
});
