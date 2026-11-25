import assert from "node:assert/strict";
import { test } from "node:test";
import type { Notification } from "../notify/notifier.js";
import { boardForAlerts, boardReach, changeNotification, changesFor, clockMinutes, clockText, createTrainAlerts, describe, inWindow, lateBy, londonNow, readDays, readWindow, reminderFor, toldFrom, trainKeys, type AlertSettings, type Told } from "./alerts.js";
import type { Board, Departure, TrainSettings } from "./board.js";

const settings: AlertSettings = { days: ["mon", "wed"], start: 7 * 60, end: 8 * 60 + 30, reminder: 6 * 60 + 45 };

function train(due: string, expected = "On time", more: Partial<Departure> = {}): Departure {
  return { due, expected, platform: null, cancelled: expected === "Cancelled", reason: null, destination: "Beta", ...more };
}

function board(departures: Departure[], more: Partial<Board> = {}): Board {
  return { from: "Alpha", to: "Beta", departures, buses: 0, messages: [], ...more };
}

const at = (iso: string) => new Date(iso);

test("times are read and written as 24-hour clock times", () => {
  assert.equal(clockMinutes("00:00"), 0);
  assert.equal(clockMinutes("07:05"), 425);
  assert.equal(clockMinutes("23:59"), 1439);
  for (const value of ["24:00", "7:05", "07:60", "07:05 ", "", "0705", "On time"]) assert.equal(clockMinutes(value), null, value);
  assert.equal(clockText(425), "07:05");
  assert.equal(clockText(1439 + 61), "01:00");
  assert.equal(clockText(-5), "23:55");
});

test("days and windows are read from their settings", () => {
  assert.deepEqual(readDays("wed, MON ,mon"), ["mon", "wed"]);
  assert.equal(readDays(""), null);
  assert.equal(readDays("mon,funday"), null);
  assert.deepEqual(readWindow("07:00-08:30"), { start: 420, end: 510 });
  assert.deepEqual(readWindow("07:00 - 08:30"), { start: 420, end: 510 });
  assert.equal(readWindow("08:30-07:00"), null);
  assert.equal(readWindow("07:00-07:00"), null);
  assert.deepEqual(readWindow("21:00-22:59"), { start: 1260, end: 1379 });
  assert.equal(readWindow("21:00-23:00"), null);
});

test("London's day, weekday and minutes follow the clocks changing", () => {
  assert.deepEqual(londonNow(at("2026-11-24T06:45:00Z")), { day: "2026-11-24", weekday: "tue", minutes: 405 });
  assert.deepEqual(londonNow(at("2026-06-02T05:45:00Z")), { day: "2026-06-02", weekday: "tue", minutes: 405 });
  assert.deepEqual(londonNow(at("2026-06-01T23:30:00Z")), { day: "2026-06-02", weekday: "tue", minutes: 30 });
  assert.deepEqual(londonNow(at("2027-03-28T00:30:00Z")).minutes, 30);
  assert.deepEqual(londonNow(at("2027-03-28T01:30:00Z")).minutes, 150);
  assert.deepEqual(londonNow(at("2026-10-25T00:30:00Z")).minutes, 90);
  assert.deepEqual(londonNow(at("2026-10-25T01:30:00Z")).minutes, 90);
});

test("how late a train is comes from its expected time, with on time as 0 and delayed with no time as null", () => {
  assert.equal(lateBy(train("07:14")), 0);
  assert.equal(lateBy(train("07:14", "on time")), 0);
  assert.equal(lateBy(train("07:14", "Delayed")), null);
  assert.equal(lateBy(train("07:14", "07:22")), 8);
  assert.equal(lateBy(train("07:14", "07:12")), 0);
  assert.equal(lateBy(train("23:55", "00:07")), 12);
  assert.equal(lateBy(train("00:05", "23:58")), 0);
  assert.equal(lateBy(train("07:14", "No report")), undefined);
  assert.equal(lateBy(train("07:14", "Cancelled")), undefined);
});

test("a train is in the window when it's due from the window's start to its end, both included", () => {
  assert.deepEqual(["06:59", "07:00", "07:44", "08:30", "08:31", "x"].map((due) => inWindow(train(due), settings)), [false, true, true, true, false, false]);
});

test("each train is described with its time, how late, platform and any reason", () => {
  assert.equal(describe(train("07:14", "On time", { platform: "16" })), "07:14 on time, platform 16.");
  assert.equal(describe(train("07:14")), "07:14 on time.");
  assert.equal(describe(train("07:44", "07:52", { reason: "This train has been delayed by a fault" })), "07:44 expected 07:52, 8 minutes late. This train has been delayed by a fault.");
  assert.equal(describe(train("07:44", "07:45", { platform: "3" })), "07:44 expected 07:45, 1 minute late, platform 3.");
  assert.equal(describe(train("08:14", "Cancelled", { reason: "A shortage of staff." })), "08:14 cancelled. A shortage of staff.");
  assert.equal(describe(train("08:20", "Delayed", { platform: "2" })), "08:20 delayed, with no expected time yet, platform 2.");
  assert.equal(describe(train("08:25", "No report")), '08:25 shows "No report".');
});

test("the reminder lists only the window's trains, then any buses and the board's messages, and adds no station names of its own", () => {
  const reminder = reminderFor(board([train("06:50"), train("07:14", "On time", { platform: "16" }), train("08:14", "Cancelled"), train("08:44")], { buses: 2, messages: ["Disruption further along."] }), settings, 405);
  assert.deepEqual(reminder, { title: "Morning trains", message: "07:14 on time, platform 16.\n08:14 cancelled.\nThe board also lists 2 buses.\nDisruption further along.", tags: "train2" });
  assert.ok(!reminder.message.includes("Alpha") && !reminder.message.includes("Beta"));
  assert.equal(reminderFor(board([train("06:50"), train("08:40")], { buses: 1 }), settings, 405).message, "No trains due between 07:00 and 08:30 on the board.\nThe board also lists 1 bus.");
});

test("the reminder says when the board doesn't yet reach the window's end, going by its furthest train in any order", () => {
  const short = "so far, so later trains in the window will only be sent if something's wrong with them.";
  assert.equal(reminderFor(board([train("06:50"), train("07:14"), train("07:44")]), settings, 405).message, `07:14 on time.\n07:44 on time.\nThe board only reaches 07:44 ${short}`);
  assert.equal(reminderFor(board([train("07:44"), train("07:14", "07:50")]), settings, 405).message, `07:44 on time.\n07:14 expected 07:50, 36 minutes late.\nThe board only reaches 07:44 ${short}`);
  assert.equal(reminderFor(board([train("06:50")]), settings, 405).message, `No trains due between 07:00 and 08:30 on the board.\nThe board only reaches 06:50 ${short}`);
  assert.equal(reminderFor(board([train("07:14"), train("08:30")]), settings, 405).message, "07:14 on time.\n08:30 on time.");
  assert.equal(reminderFor(board([]), settings, 405).message, "No trains due between 07:00 and 08:30 on the board.");
  assert.equal(reminderFor(board([train("22:50"), train("00:05")]), { start: 22 * 60 + 30, end: 22 * 60 + 59 }, 22 * 60 + 20).message, "22:50 on time.");
});

test("how far the board reaches counts trains after midnight as later, and late trains still on it as earlier", () => {
  assert.equal(boardReach([train("23:50"), train("00:20")], 23 * 60), 24 * 60 + 20);
  assert.equal(boardReach([train("07:00"), train("07:20")], 7 * 60 + 10), 7 * 60 + 20);
  assert.equal(boardReach([train("x")], 0), null);
  assert.equal(boardReach([], 0), null);
});

test("trains are known by their time, and by their destination too only when two share a time", () => {
  assert.deepEqual(trainKeys([train("07:14"), train("07:44", "On time", { destination: "Gamma" }), train("07:44", "On time", { destination: null })]), ["07:14", "07:44|Gamma", "07:44|"]);
});

test("what the reminder said is what later changes are measured against", () => {
  assert.deepEqual(toldFrom([train("07:14", "On time", { platform: "16" }), train("07:44", "07:52"), train("08:14", "Cancelled"), train("08:20", "Delayed"), train("08:25", "No report")]), new Map<string, Told>([
    ["07:14", { cancelled: false, late: 0, platform: "16" }],
    ["07:44", { cancelled: false, late: 8, platform: null }],
    ["08:14", { cancelled: true, late: 0, platform: null }],
    ["08:20", { cancelled: false, late: null, platform: null }],
    ["08:25", { cancelled: false, late: 0, platform: null }],
  ]));
});

function changes(before: Departure[], after: Departure[]) {
  return changesFor(after, toldFrom(before));
}

test("nothing changing, or a delay under 5 minutes, sends nothing", () => {
  assert.deepEqual(changes([train("07:14")], [train("07:14")]).lines, []);
  assert.deepEqual(changes([train("07:14")], [train("07:14", "07:18")]).lines, []);
  assert.deepEqual(changes([train("07:14", "07:22")], [train("07:14", "07:25")]).lines, []);
  assert.deepEqual(changes([train("07:14", "No report")], [train("07:14", "Odd")]).lines, []);
});

test("a cancellation is sent once, with its reason, and marks the notification as cancelled", () => {
  const first = changes([train("07:14")], [train("07:14", "Cancelled", { reason: "A fault" })]);
  assert.deepEqual([first.lines, first.cancelled], [["The 07:14 is cancelled. A fault."], true]);
  const again = changesFor([train("07:14", "Cancelled")], first.next);
  assert.deepEqual([again.lines, again.cancelled], [[], false]);
});

test("a delay of 5 minutes or more is sent, and again only when it moves by 5 minutes or more", () => {
  const first = changes([train("07:14")], [train("07:14", "07:19", { reason: "This train has been delayed by a fault" })]);
  assert.deepEqual(first.lines, ["The 07:14 is now expected 07:19, 5 minutes late. This train has been delayed by a fault."]);
  assert.equal(first.cancelled, false);
  const small = changesFor([train("07:14", "07:23")], first.next);
  assert.deepEqual(small.lines, []);
  const bigger = changesFor([train("07:14", "07:24")], small.next);
  assert.deepEqual(bigger.lines, ["The 07:14 is now expected 07:24, 10 minutes late."]);
  const shorter = changesFor([train("07:14", "07:19")], bigger.next);
  assert.deepEqual(shorter.lines, ["The 07:14 is now expected 07:19, 5 minutes late."]);
});

test("a train delayed with no time is sent once, and then a time for it is sent", () => {
  const first = changes([train("07:14")], [train("07:14", "Delayed", { reason: "Signalling" })]);
  assert.deepEqual(first.lines, ["The 07:14 is delayed, with no expected time yet. Signalling."]);
  assert.deepEqual(changesFor([train("07:14", "Delayed")], first.next).lines, []);
  assert.deepEqual(changesFor([train("07:14", "07:20")], first.next).lines, ["The 07:14 is now expected 07:20, 6 minutes late."]);
  assert.deepEqual(changesFor([train("07:14", "07:16")], first.next).lines, ["The 07:14 is now expected 07:16, only 2 minutes late."]);
  assert.deepEqual(changesFor([train("07:14", "No report")], first.next).lines, []);
});

test("a delay hovering around 5 minutes, or flipping between a time and none, doesn't send each flip", () => {
  let told = toldFrom([train("07:14")]);
  const sent: string[] = [];
  for (const expected of ["07:19", "07:18", "07:19", "07:18", "07:19", "Delayed", "07:19", "Delayed", "07:16", "07:15"]) {
    const result = changesFor([train("07:14", expected)], told);
    sent.push(...result.lines);
    told = result.next;
  }
  assert.deepEqual(sent, ["The 07:14 is now expected 07:19, 5 minutes late.", "The 07:14 is now expected 07:16, only 2 minutes late."]);
  let fromNone = toldFrom([train("07:14", "Delayed")]);
  const noneSent: string[] = [];
  for (const expected of ["07:17", "Delayed", "07:17", "07:16"]) {
    const result = changesFor([train("07:14", expected)], fromNone);
    noneSent.push(...result.lines);
    fromNone = result.next;
  }
  assert.deepEqual(noneSent, ["The 07:14 is now expected 07:16, only 2 minutes late."]);
  assert.deepEqual(changes([train("07:14", "07:30")], [train("07:14", "07:18")]).lines, ["The 07:14 is now expected 07:18, only 4 minutes late."], "a big drop is sent even above 2 minutes");
});

test("a delayed train back on time, or nearly, is sent", () => {
  assert.deepEqual(changes([train("07:14", "07:30")], [train("07:14")]).lines, ["The 07:14 is back on time."]);
  assert.deepEqual(changes([train("07:14", "07:30")], [train("07:14", "07:15")]).lines, ["The 07:14 is now expected 07:15, only 1 minute late."]);
});

test("a cancelled train running again is sent, with its time", () => {
  assert.deepEqual(changes([train("07:14", "Cancelled")], [train("07:14")]).lines, ["The 07:14 is running again."]);
  assert.deepEqual(changes([train("07:14", "Cancelled")], [train("07:14", "07:30")]).lines, ["The 07:14 is running again, expected 07:30."]);
  assert.deepEqual(changes([train("07:14", "Cancelled")], [train("07:14", "Delayed")]).lines, ["The 07:14 is running again, delayed with no expected time yet."]);
  const back = changes([train("07:14", "Cancelled")], [train("07:14", "07:30")]);
  assert.deepEqual(changesFor([train("07:14", "07:31")], back.next).lines, []);
  const delayed = changes([train("07:14", "Cancelled")], [train("07:14", "Delayed")]);
  assert.deepEqual(delayed.next.get("07:14"), { cancelled: false, late: null, platform: null });
  assert.deepEqual(changesFor([train("07:14", "Delayed")], delayed.next).lines, []);
});

const gone = "has gone from the board before it was due. It may have been cancelled or replaced by a bus.";
const seen = (now: number, reach: number | null, full = false) => ({ now, reach, full });

test("a train that leaves the board more than a minute before it's due is sent once, as maybe cancelled, if the board lists later trains and isn't full", () => {
  const told = toldFrom([train("07:14"), train("07:44")]);
  const first = changesFor([train("07:44"), train("08:14")], told, seen(7 * 60, 8 * 60 + 14));
  assert.deepEqual([first.lines, first.cancelled], [[`The 07:14 ${gone}`], false]);
  assert.deepEqual(changesFor([train("07:44"), train("08:14")], first.next, seen(7 * 60 + 2, 8 * 60 + 14)).lines, []);
  assert.deepEqual(changesFor([train("07:14"), train("07:44")], first.next, seen(7 * 60 + 4, 8 * 60 + 14)).lines, ["The 07:14 is running again."]);
  assert.deepEqual(changesFor([train("07:44")], told, seen(7 * 60 + 13, 7 * 60 + 44)).lines, [], "a minute before it's due it may have left");
  assert.deepEqual(changesFor([train("07:44")], told, seen(7 * 60 + 12, 7 * 60 + 44)).lines, [`The 07:14 ${gone}`]);
  assert.deepEqual(changesFor([], told, seen(7 * 60, null)).lines, [], "an empty board says nothing");
  assert.deepEqual(changesFor([train("07:44")], told, seen(7 * 60, 8 * 60, true)).lines, [], "a full board may have cut it off");
  assert.deepEqual(changesFor([train("07:44")], told).lines, [], "nothing is gone without the board's reach");
  assert.deepEqual(changesFor([train("07:44")], toldFrom([train("07:14"), train("07:44"), train("08:20")]), seen(7 * 60, 7 * 60 + 44)).lines, [`The 07:14 ${gone}`], "only trains the board reaches past");
  assert.deepEqual(changesFor([train("07:44")], toldFrom([train("07:14", "Cancelled"), train("07:44")]), seen(7 * 60, 8 * 60)).lines, [], "a cancelled train leaving says nothing more");
});

test("a train whose destination changes is the same train, unless another shares its time", () => {
  const told = toldFrom([train("07:14"), train("07:44")]);
  assert.deepEqual(changesFor([train("07:14", "On time", { destination: "Gamma" }), train("07:44", "On time", { destination: null })], told, seen(7 * 60, 7 * 60 + 44)).lines, []);
  const twins = toldFrom([train("07:14", "On time", { destination: "Beta" }), train("07:14", "On time", { destination: "Gamma" })]);
  assert.deepEqual(changesFor([train("07:14", "On time", { destination: "Beta" }), train("07:14", "Cancelled", { destination: "Gamma" })], twins, seen(7 * 60, 7 * 60 + 14)).lines, ["The 07:14 is cancelled."]);
  assert.deepEqual(changesFor([train("07:14", "On time", { destination: "Beta" }), train("07:14", "On time", { destination: "Gamma" }), train("07:44")], toldFrom([train("07:14"), train("07:44")]), seen(7 * 60, 7 * 60 + 44)).lines, [], "a second train at the same time doesn't make the first one gone");
});

test("a platform change is sent, but a platform appearing for the first time isn't", () => {
  const appears = changes([train("07:14")], [train("07:14", "On time", { platform: "16" })]);
  assert.deepEqual(appears.lines, []);
  assert.deepEqual(changesFor([train("07:14", "On time", { platform: "4" })], appears.next).lines, ["The 07:14 now leaves from platform 4, not 16."]);
  assert.deepEqual(changesFor([train("07:14", "On time", { platform: null })], appears.next).next.get("07:14")?.platform, "16");
  assert.deepEqual(changes([train("07:14", "On time", { platform: "16" })], [train("07:14", "07:24", { platform: "4" })]).lines, ["The 07:14 is now expected 07:24, 10 minutes late.", "The 07:14 now leaves from platform 4, not 16."]);
});

test("a train first seen after the reminder is only sent if something's wrong with it", () => {
  assert.deepEqual(changesFor([train("08:20"), train("08:25", "On time", { platform: "1" })], new Map()).lines, []);
  assert.deepEqual(changesFor([train("08:20", "08:31"), train("08:25", "Cancelled")], new Map()).lines, ["The 08:20 is now expected 08:31, 11 minutes late.", "The 08:25 is cancelled."]);
});

test("trains with the same time but different destinations are kept apart", () => {
  const before = [train("07:14", "On time", { destination: "Beta" }), train("07:14", "On time", { destination: "Gamma" })];
  assert.deepEqual(changes(before, [train("07:14", "On time", { destination: "Beta" }), train("07:14", "Cancelled", { destination: "Gamma" })]).lines, ["The 07:14 is cancelled."]);
});

test("changes are one notification, at high priority only when a train is cancelled", () => {
  assert.deepEqual(changeNotification(["The 07:14 is now expected 07:24, 10 minutes late."], false), { title: "Train change", message: "The 07:14 is now expected 07:24, 10 minutes late.", tags: "warning" });
  assert.deepEqual(changeNotification(["a", "b"], true), { title: "Train changes", message: "a\nb", tags: "warning", priority: 4 });
});

function harness(boards: Array<Board | Error>, sendFails = 0) {
  const sent: Notification[] = [];
  const changed: { lines: string[]; at: string }[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  let asked = 0;
  let failures = sendFails;
  const check = createTrainAlerts({
    settings,
    board: async () => {
      const next = boards[Math.min(asked, boards.length - 1)];
      asked++;
      if (next instanceof Error) throw next;
      return next;
    },
    send: async (notification) => {
      if (failures > 0) {
        failures--;
        throw new Error("ntfy replied 500");
      }
      sent.push(notification);
    },
    changed: (lines, when) => changed.push({ lines, at: when.toISOString() }),
    warn: (message) => warnings.push(message),
    info: (message) => infos.push(message),
  });
  return { check, sent, changed, warnings, infos, asked: () => asked };
}

const monday = (time: string) => at(`2026-11-23T${time.length === 5 ? `${time}:00` : time}Z`);

test("the check does nothing on other days, or before the reminder's time", async () => {
  const run = harness([board([train("07:14")])]);
  assert.equal(await run.check(at("2026-11-24T06:50:00Z")), "not today");
  assert.equal(await run.check(monday("06:44")), "too early");
  assert.equal(run.asked(), 0);
  assert.deepEqual(run.sent, []);
});

test("on a set day the reminder goes at its time, then the board is asked every 2 minutes and changes are sent", async () => {
  const run = harness([board([train("07:14", "On time", { platform: "16" }), train("08:44")]), board([train("07:14", "On time", { platform: "16" }), train("08:44")]), board([train("07:14", "07:24", { platform: "16" }), train("08:44")])]);
  assert.equal(await run.check(monday("06:45")), "reminded");
  assert.deepEqual(run.sent, [{ title: "Morning trains", message: "07:14 on time, platform 16.", tags: "train2" }]);
  assert.equal(await run.check(monday("06:46")), "waiting");
  assert.equal(run.asked(), 1);
  assert.equal(await run.check(monday("06:47")), "checked");
  assert.equal(await run.check(monday("06:49")), "changed");
  assert.deepEqual(run.sent.at(-1), { title: "Train change", message: "The 07:14 is now expected 07:24, 10 minutes late.", tags: "warning" });
  assert.equal(await run.check(monday("06:51")), "checked");
  assert.equal(run.sent.length, 2);
});

test("a check a moment short of 2 minutes still asks the board, but one at 89 seconds doesn't", async () => {
  const run = harness([board([train("07:14")])]);
  await run.check(monday("06:45:00.000"));
  assert.equal(await run.check(monday("06:46:29.000")), "waiting");
  assert.equal(await run.check(monday("06:46:59.990")), "checked");
});

test("a reminder that couldn't be sent is tried again 2 minutes later", async () => {
  const run = harness([board([train("07:14")])], 1);
  await assert.rejects(run.check(monday("06:45")), { message: "ntfy replied 500" });
  assert.equal(await run.check(monday("06:46")), "waiting");
  assert.equal(await run.check(monday("06:47")), "reminded");
  assert.equal(run.sent.length, 1);
  assert.equal(run.asked(), 2);
});

test("a change that couldn't be sent is sent with the next check", async () => {
  const sent: Notification[] = [];
  let fail = false;
  const boards = [board([train("07:14")]), board([train("07:14", "Cancelled")])];
  let asked = 0;
  const check = createTrainAlerts({
    settings,
    board: async () => boards[Math.min(asked++, 1)],
    send: async (notification) => {
      if (fail) throw new Error("ntfy replied 500");
      sent.push(notification);
    },
  });
  await check(monday("06:45"));
  fail = true;
  await assert.rejects(check(monday("06:47")));
  fail = false;
  assert.equal(await check(monday("06:49")), "changed");
  assert.deepEqual(sent.at(-1), { title: "Train change", message: "The 07:14 is cancelled.", tags: "warning", priority: 4 });
});

test("each check's new change lines are passed on once, as they're found, whether or not ntfy takes them, and never the reminder or outage notices", async () => {
  const run = harness([board([train("07:14"), train("07:44")]), board([train("07:14", "Cancelled"), train("07:44")]), new Error("no board"), new Error("no board"), new Error("no board"), new Error("no board"), board([train("07:14", "Cancelled"), train("07:44", "07:54")])], 0);
  await run.check(monday("06:45"));
  assert.equal(run.changed.length, 0);
  assert.equal(await run.check(monday("06:47")), "changed");
  assert.deepEqual(run.changed, [{ lines: ["The 07:14 is cancelled."], at: "2026-11-23T06:47:00.000Z" }]);
  for (const time of ["06:49", "06:51", "06:53", "06:55"]) assert.equal(await run.check(monday(time)), "failed");
  assert.equal(await run.check(monday("06:57")), "changed");
  assert.deepEqual(run.changed.map((change) => change.lines), [["The 07:14 is cancelled."], ["The 07:44 is now expected 07:54, 10 minutes late."]]);
  assert.ok(run.sent.some((notification) => notification.message.includes("Couldn't check your trains")), JSON.stringify(run.sent));
});

test("after a restart past the window's end, what's still wrong is sent to the phone but not passed on, since it was found before; later changes are", async () => {
  const run = harness([board([train("08:20", "Cancelled"), train("08:25", "08:40")]), board([train("08:20", "Cancelled"), train("08:25", "08:40", { platform: "2" }), train("08:28", "Cancelled")])], 0);
  assert.equal(await run.check(monday("08:35")), "changed");
  assert.equal(run.sent.length, 1);
  assert.equal(run.changed.length, 0);
  assert.equal(await run.check(monday("08:37")), "changed");
  assert.deepEqual(run.changed.map((change) => change.lines), [["The 08:28 is cancelled."]]);
});

test("a change ntfy didn't take is sent again, but passed on only the once", async () => {
  const changed: string[][] = [];
  let fail = true;
  const boards = [board([train("07:14")]), board([train("07:14", "Cancelled")])];
  let asked = 0;
  const check = createTrainAlerts({
    settings,
    board: async () => boards[Math.min(asked++, 1)],
    send: async () => {
      if (fail && asked > 1) throw new Error("ntfy replied 500");
    },
    changed: (lines) => changed.push(lines),
  });
  await check(monday("06:45"));
  await assert.rejects(check(monday("06:47")));
  fail = false;
  assert.equal(await check(monday("06:49")), "changed");
  assert.deepEqual(changed, [["The 07:14 is cancelled."]]);
});

test("a hub that starts after the reminder's time still reminds, until the window ends", async () => {
  const late = harness([board([train("08:14")])]);
  assert.equal(await late.check(monday("08:30")), "reminded");
});

test("a hub that starts after the window ends sends no reminder, but still sends what's wrong with the window's trains left on the board", async () => {
  const quiet = harness([board([train("08:25"), train("08:44")]), board([train("08:44")])]);
  assert.equal(await quiet.check(monday("08:31")), "checked");
  assert.deepEqual(quiet.sent, []);
  assert.equal(await quiet.check(monday("08:33")), "finished");
  const late = harness([board([train("08:25", "08:50")]), board([train("08:25", "08:52")]), board([train("08:25", "09:05")])]);
  assert.equal(await late.check(monday("08:35")), "changed");
  assert.deepEqual(late.sent, [{ title: "Train change", message: "The 08:25 is now expected 08:50, 25 minutes late.", tags: "warning" }]);
  assert.equal(await late.check(monday("08:37")), "checked");
  assert.equal(await late.check(monday("08:39")), "changed");
  const over = harness([board([train("08:14")])]);
  assert.equal(await over.check(monday("09:31")), "finished");
  assert.equal(over.asked(), 0);
});

test("after the window it keeps checking while a window train is still on the board, then stops for the day", async () => {
  const run = harness([board([train("08:25", "08:40")]), board([train("08:25", "08:50")]), board([train("08:45")])]);
  assert.equal(await run.check(monday("08:20")), "reminded");
  assert.equal(await run.check(monday("08:35")), "changed");
  assert.equal(await run.check(monday("08:37")), "finished");
  assert.equal(await run.check(monday("08:39")), "finished");
  assert.equal(run.asked(), 3);
});

test("it stops an hour after the window ends, however late the trains are", async () => {
  const run = harness([board([train("08:25", "10:00")])]);
  assert.equal(await run.check(monday("08:20")), "reminded");
  assert.equal(await run.check(monday("09:30")), "checked");
  assert.equal(await run.check(monday("09:31")), "finished");
});

test("a board that can't be reached is logged once, asked every 2 minutes, sent once it's been failing for 5 minutes, and the reminder follows when it's back", async () => {
  const down = new Error("the board couldn't be reached (no connection)");
  const run = harness([down, down, down, down, down, board([train("07:14"), train("08:44")])]);
  assert.equal(await run.check(monday("06:45")), "failed");
  assert.equal(await run.check(monday("06:46")), "waiting");
  assert.equal(await run.check(monday("06:47")), "failed");
  assert.equal(await run.check(monday("06:49")), "failed");
  assert.equal(run.sent.length, 0);
  assert.equal(await run.check(monday("06:51")), "failed");
  assert.deepEqual(run.sent, [{ title: "Morning trains", message: "Couldn't get your morning trains since 06:45: the board couldn't be reached (no connection). Still trying, until 09:30 at the latest.", tags: "warning" }]);
  assert.equal(await run.check(monday("06:53")), "failed");
  assert.equal(run.sent.length, 1);
  assert.equal(await run.check(monday("06:55")), "reminded");
  assert.equal(run.asked(), 6);
  assert.deepEqual(run.sent.map((notification) => notification.title), ["Morning trains", "Morning trains"]);
  assert.equal(run.sent[1].message, "07:14 on time.");
  assert.deepEqual(run.warnings, ["the train check couldn't get the departure board: the board couldn't be reached (no connection)"]);
  assert.deepEqual(run.infos, ["the train check can reach the departure board again"]);
});

test("after the reminder, each outage is sent once it's lasted 5 minutes, and its end is sent too", async () => {
  const down = new Error("the board replied 503");
  const good = board([train("07:14")]);
  const run = harness([good, down, down, down, down, good, down, down, down, down]);
  await run.check(monday("06:45"));
  for (const minute of ["47", "49", "51"]) assert.equal(await run.check(monday(`06:${minute}`)), "failed");
  assert.equal(run.sent.length, 1);
  assert.equal(await run.check(monday("06:53")), "failed");
  assert.equal(run.sent.at(-1)?.message, "Couldn't check your trains since 06:47: the board replied 503. Still trying, until 09:30 at the latest.");
  assert.equal(await run.check(monday("06:55")), "checked");
  assert.deepEqual(run.sent.at(-1), { title: "Morning trains", message: "The departure board is answering again, so your trains are being checked again.", tags: "white_check_mark" });
  for (const minute of ["06:57", "06:59", "07:01"]) assert.equal(await run.check(monday(minute)), "failed");
  assert.equal(run.sent.length, 3);
  assert.equal(await run.check(monday("07:03")), "failed");
  assert.equal(run.sent.at(-1)?.message, "Couldn't check your trains since 06:57: the board replied 503. Still trying, until 09:30 at the latest.");
  assert.equal(run.warnings.length, 2);
});

function outage(upFrom: string | null) {
  const sent: Notification[] = [];
  let asked = 0;
  const check = createTrainAlerts({
    settings,
    board: async () => {
      asked++;
      if (upFrom === null || asked < Number(upFrom)) throw new Error("the board replied 503");
      return board([train("08:25", "08:45")]);
    },
    send: async (notification) => {
      sent.push(notification);
    },
  });
  return { check, sent, asked: () => asked };
}

test("a board down from the reminder until after the window says when it's back, then what's wrong", async () => {
  const run = outage("60");
  let minute = 6 * 60 + 45;
  while (run.asked() < 60 && minute < 10 * 60) await run.check(monday(clockText(minute++)));
  assert.ok(minute > 8 * 60 + 30);
  assert.deepEqual(run.sent.map((notification) => notification.message), [
    "Couldn't get your morning trains since 06:45: the board replied 503. Still trying, until 09:30 at the latest.",
    "The departure board is answering again, so your trains are being checked again.",
    "The 08:25 is now expected 08:45, 20 minutes late.",
  ]);
});

test("a board that never comes back is given up on an hour after the window, saying so", async () => {
  const run = outage(null);
  for (let minute = 6 * 60 + 45; minute <= 9 * 60 + 35; minute++) await run.check(monday(clockText(minute)));
  assert.deepEqual(run.sent.map((notification) => notification.message), [
    "Couldn't get your morning trains since 06:45: the board replied 503. Still trying, until 09:30 at the latest.",
    "Stopped checking your trains for today, as the departure board still isn't answering.",
  ]);
});

test("a train missing from a full board isn't called gone, since it may just have been pushed off the end", async () => {
  const later = Array.from({ length: 8 }, (_unused, index) => train(`08:${String(31 + index).padStart(2, "0")}`));
  const run = harness([board([train("07:14"), train("07:44"), ...later]), board([train("07:44"), ...later, train("08:50"), train("08:55")]), board([train("07:44"), ...later])]);
  await run.check(monday("07:08"));
  assert.equal(await run.check(monday("07:10")), "checked");
  assert.equal(await run.check(monday("07:12")), "changed");
  assert.equal(run.sent.at(-1)?.message, `The 07:14 ${gone}`);
});

test("a train found gone is still sent if ntfy didn't take it the first time", async () => {
  const sent: Notification[] = [];
  let fail = false;
  const boards = [board([train("07:14"), train("07:44"), train("08:44")]), board([train("07:44"), train("08:44")])];
  let asked = 0;
  const check = createTrainAlerts({
    settings,
    board: async () => boards[Math.min(asked++, 1)],
    send: async (notification) => {
      if (fail) throw new Error("ntfy replied 500");
      sent.push(notification);
    },
  });
  await check(monday("07:08"));
  fail = true;
  await assert.rejects(check(monday("07:12")));
  fail = false;
  assert.equal(await check(monday("07:14")), "changed");
  assert.equal(sent.at(-1)?.message, `The 07:14 ${gone}`);
});

test("a failure notice that couldn't be sent is tried again on the next check", async () => {
  const down = new Error("the board replied 503");
  const run = harness([down], 0);
  for (const time of ["06:45", "06:47", "06:49"]) await run.check(monday(time));
  const failing = harness([down], 1);
  for (const time of ["06:45", "06:47", "06:49"]) await failing.check(monday(time));
  await assert.rejects(failing.check(monday("06:51")), { message: "ntfy replied 500" });
  assert.equal(failing.sent.length, 0);
  assert.equal(await failing.check(monday("06:53")), "failed");
  assert.equal(failing.sent.length, 1);
  assert.equal(run.sent.length, 0);
});

test("a change ntfy never took one day isn't sent the next", async () => {
  const boards = [board([train("07:14"), train("08:44")]), board([train("07:14", "Cancelled"), train("08:44")]), board([train("07:14"), train("08:44")])];
  let asked = 0;
  let fail = false;
  const sent: Notification[] = [];
  const check = createTrainAlerts({
    settings,
    board: async () => boards[Math.min(asked++, 2)],
    send: async (notification) => {
      if (fail) throw new Error("ntfy replied 500");
      sent.push(notification);
    },
  });
  await check(monday("06:45"));
  fail = true;
  await assert.rejects(check(monday("06:47")));
  fail = false;
  assert.equal(await check(at("2026-11-25T06:45:00Z")), "reminded");
  assert.equal(await check(at("2026-11-25T06:47:00Z")), "checked");
  assert.deepEqual(sent.map((notification) => notification.title), ["Morning trains", "Morning trains"]);
});

test("each set day starts again, with its own reminder", async () => {
  const run = harness([board([train("07:14", "Cancelled"), train("08:44")])]);
  assert.equal(await run.check(monday("06:45")), "reminded");
  assert.equal(await run.check(at("2026-11-24T06:45:00Z")), "not today");
  assert.equal(await run.check(at("2026-11-25T06:45:00Z")), "reminded");
  assert.equal(run.sent.length, 2);
  assert.equal(run.sent[1].message, "07:14 cancelled.");
});

test("a check still running when the next one starts is left alone", { timeout: 5_000 }, async () => {
  let release: () => void = () => {};
  let asked = 0;
  const check = createTrainAlerts({
    settings,
    board: () => (asked++, new Promise<Board>((resolve) => (release = () => resolve(board([]))))),
    send: async () => {},
  });
  const first = check(monday("06:45"));
  assert.equal(await check(monday("06:46")), "busy");
  release();
  assert.equal(await first, "reminded");
  assert.equal(asked, 1);
});

test("the alerts ask the board for its next ten trains", async () => {
  const trains: TrainSettings = { key: "test-rail-key", from: "AAA", to: "BBB", boardUrl: "https://api1.raildata.org.uk/test-board" };
  const asked: string[] = [];
  const fetcher = (async (url: string) => (asked.push(url), new Response(JSON.stringify({ crs: "AAA", trainServices: [] }), { status: 200 }))) as typeof fetch;
  assert.deepEqual(await boardForAlerts(trains, fetcher)(), { from: "AAA", to: "BBB", departures: [], buses: 0, messages: [] });
  assert.deepEqual(asked, ["https://api1.raildata.org.uk/test-board/AAA?numRows=10&filterCrs=BBB&filterType=to"]);
});
