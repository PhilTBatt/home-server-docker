import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reminder } from "../reminders/reminders.js";
import type { DoctorReport } from "../system/doctor.js";
import { alertsItem, backupItem, buildPicture, dealsItem, keptPicture, minutesUntil, mostTimers, partOfDay, phaseOf, reminderItem, serverItem, timersOf, trainItem, trainOf, type WallPicture, type WallSources } from "./picture.js";

const morning = new Date("2026-11-30T07:02:00Z");
const alerts = { days: ["mon", "wed"], start: 420, end: 510, reminder: 405 };

function reminder(fields: Partial<Reminder>): Reminder {
  return { id: "0123456789abcdef", text: "Stretch", kind: "reminder", mode: null, first: "2026-11-30T07:00:00Z", at: "2026-11-30T07:22:00Z", repeat: null, urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-30T06:52:00Z", ...fields };
}

const report = (states: DoctorReport["checks"][number]["state"][], overall: DoctorReport["state"] = "ok"): DoctorReport => ({ state: overall, summary: "", checkedAt: morning.toISOString(), checks: states.map((state, i) => ({ name: `Check ${i}`, state, detail: "", next: null })) });

test("the part of the day follows London's clock", () => {
  assert.deepEqual([60, 300, 659, 720, 1079, 1080].map(partOfDay), ["night", "morning", "morning", "afternoon", "afternoon", "evening"]);
});

test("bedtime mode is bedtime, the train window on its days is morning, and everything else is daytime", () => {
  assert.equal(phaseOf("bedtime", alerts, morning), "bedtime");
  assert.equal(phaseOf("normal", alerts, morning), "morning");
  assert.equal(phaseOf(null, alerts, morning), "morning");
  assert.equal(phaseOf("normal", alerts, new Date("2026-11-30T06:44:00Z")), "daytime");
  assert.equal(phaseOf("normal", alerts, new Date("2026-11-30T06:45:00Z")), "morning");
  assert.equal(phaseOf("normal", alerts, new Date("2026-11-30T08:30:00Z")), "daytime");
  assert.equal(phaseOf("normal", alerts, new Date("2026-12-01T07:02:00Z")), "daytime", "a Tuesday isn't one of the days");
  assert.equal(phaseOf("normal", null, morning), "daytime");
  assert.equal(phaseOf("normal", { ...alerts, days: [] }, morning), "daytime");
  assert.equal(phaseOf("normal", alerts, new Date("2026-06-01T06:02:00Z")), "morning", "summer time is London's, an hour ahead");
});

test("the server counts the checks that are on, and names the worst", () => {
  assert.deepEqual(serverItem(report(["ok", "ok", "off"])), { key: "server", label: "Server", value: "2/2", note: "all good", colour: "mint", needs: false });
  assert.deepEqual(serverItem(report(["ok", "warn", "ok"], "warn")), { key: "server", label: "Server", value: "2/3", note: "check 1 needs a look", colour: "yellow", needs: false });
  assert.deepEqual(serverItem(report(["warn", "problem"], "problem")), { key: "server", label: "Server", value: "0/2", note: "check 1 needs a look", colour: "warm", needs: true });
});

test("the backup says when it last ran, or that it failed or never ran", () => {
  assert.deepEqual(backupItem({ lastRun: null, lastSuccess: null }, morning), { key: "backup", label: "Backup", value: "never", note: "not run yet", colour: "grey", needs: false });
  assert.deepEqual(backupItem({ lastRun: { time: "2026-11-30T03:00:00Z", problem: null }, lastSuccess: null }, morning), { key: "backup", label: "Backup", value: "03:00", note: "today", colour: "blue", needs: false });
  assert.equal(backupItem({ lastRun: { time: "2026-11-29T23:30:00Z", problem: null }, lastSuccess: null }, morning).note, "last night");
  assert.equal(backupItem({ lastRun: { time: "2026-11-26T03:00:00Z", problem: null }, lastSuccess: null }, morning).note, "Thursday");
  assert.deepEqual(backupItem({ lastRun: { time: "2026-11-30T03:00:00Z", problem: "restic exited 1" }, lastSuccess: null }, morning), { key: "backup", label: "Backup", value: "failed", note: "restic exited 1", colour: "warm", needs: true });
  assert.equal(backupItem({ lastRun: { time: "not a time", problem: null }, lastSuccess: null }, morning).value, "?");
});

test("alerts count, and the first one's words are cut short", () => {
  assert.deepEqual(alertsItem([]), { key: "alerts", label: "Alerts", value: "0", note: "nothing waiting", colour: "grey", needs: false });
  const item = alertsItem([{ code: "disk-low", message: "Disk is nearly full: only 3 GB free of 120 GB, so clear some space" }, { code: "memory-low", message: "x" }]);
  assert.equal(item.value, "2");
  assert.equal(item.needs, true);
  assert.ok(item.note.length <= 40);
  assert.ok(item.note.endsWith("…"));
});

test("deals are a count of today's alerts, never a listing", () => {
  assert.deepEqual(dealsItem(0), { key: "deals", label: "Deals", value: "0", note: "nothing today", colour: "yellow", needs: false });
  assert.deepEqual(dealsItem(2), { key: "deals", label: "Deals", value: "2 new", note: "today", colour: "yellow", needs: false });
});

test("minutes until a train go round midnight the short way", () => {
  assert.equal(minutesUntil("07:14", morning), 12);
  assert.equal(minutesUntil("06:58", morning), -4);
  assert.equal(minutesUntil("00:10", new Date("2026-11-30T23:50:00Z")), 20);
  assert.equal(minutesUntil("23:50", new Date("2026-12-01T00:10:00Z")), -20);
  assert.equal(minutesUntil("soon", morning), null);
});

test("the next train is read from a board or from journeys", () => {
  const board = { from: "AAA", to: "Bbb Town", departures: [{ due: "07:14", expected: "On time", platform: "2", cancelled: false, reason: null, destination: null }], buses: 0, messages: [] };
  assert.deepEqual(trainOf(board, morning), { leaves: "07:14", expected: "On time", platform: "2", to: "Bbb Town", cancelled: false, late: false, inMinutes: 12 });
  const journeys = { from: "AAA", via: "CCC", to: "Bbb Town", walk: 3, journeys: [{ leaves: "07:14", expected: "07:20", platform: null, cancelled: false }], messages: [] };
  assert.deepEqual(trainOf(journeys, morning), { leaves: "07:14", expected: "07:20", platform: null, to: "Bbb Town", cancelled: false, late: true, inMinutes: 18 });
  const cancelled = { ...board, departures: [{ ...board.departures[0], expected: "Cancelled", cancelled: true }] };
  assert.deepEqual(trainOf(cancelled, morning)?.inMinutes, null);
  assert.equal(trainOf({ ...board, departures: [] }, morning), null);
  assert.equal(trainOf("nope", morning), null);
  assert.equal(trainOf({ departures: [{ due: 7 }] }, morning), null);
});

test("the train's orbit item says how it's running", () => {
  assert.deepEqual(trainItem(null), { key: "train", label: "Next train", value: "none", note: "nothing on the board", colour: "grey", needs: false });
  const train = { leaves: "07:14", expected: "On time", platform: "2", to: "B", cancelled: false, late: false, inMinutes: 12 };
  assert.deepEqual(trainItem(train), { key: "train", label: "Next train", value: "07:14", note: "on time · plat 2", colour: "accent", needs: false });
  assert.equal(trainItem({ ...train, expected: "07:20", late: true, platform: null }).note, "expected 07:20");
  assert.equal(trainItem({ ...train, expected: "Cancelled", cancelled: true, late: true }).colour, "warm");
  assert.equal(trainItem({ ...train, expected: "Delayed", late: true }).note, "delayed · plat 2");
});

test("timers are the next few reminders in the coming day, with when each started", () => {
  const list = [
    reminder({ text: "Later", at: "2026-11-30T09:00:00Z" }),
    reminder({ text: "Stretch" }),
    reminder({ text: "Mode", kind: "mode", mode: "bedtime" }),
    reminder({ text: "Gone", at: "2026-11-30T07:00:00Z" }),
    reminder({ text: "Snoozed", at: null, snoozedTo: "2026-11-30T07:10:00Z", firedAt: "2026-11-30T07:00:00Z" }),
    reminder({ text: "Next week", at: "2026-12-07T07:00:00Z" }),
    reminder({ text: "Tonight", at: "2026-11-30T20:00:00Z" }),
  ];
  assert.deepEqual(timersOf(list, morning), [
    { text: "Snoozed", due: "2026-11-30T07:10:00Z", from: "2026-11-30T07:00:00Z" },
    { text: "Stretch", due: "2026-11-30T07:22:00Z", from: "2026-11-30T06:52:00Z" },
    { text: "Later", due: "2026-11-30T09:00:00Z", from: "2026-11-30T06:52:00Z" },
  ]);
  assert.equal(mostTimers, 3);
});

test("the reminder item counts down in minutes inside the hour, and gives the time after", () => {
  assert.deepEqual(reminderItem([], morning), { key: "reminder", label: "Reminder", value: "none", note: "nothing coming up", colour: "grey", needs: false });
  assert.deepEqual(reminderItem([{ text: "Stretch", due: "2026-11-30T07:22:00Z", from: "" }], morning), { key: "reminder", label: "Reminder", value: "20m", note: "Stretch", colour: "yellow", needs: false });
  assert.equal(reminderItem([{ text: "Later", due: "2026-11-30T09:00:00Z", from: "" }], morning).value, "09:00");
});

const everything: WallSources = {
  mode: () => ({ mode: "normal", since: "2026-11-30T06:00:00Z", until: null, by: "phone", held: 0 }),
  doctor: async () => report(["ok", "ok"]),
  problems: async () => [],
  backup: async () => ({ lastRun: { time: "2026-11-30T03:00:00Z", problem: null }, lastSuccess: null }),
  trains: async () => ({ from: "AAA", to: "B", departures: [{ due: "07:14", expected: "On time", platform: "2", cancelled: false, reason: null, destination: null }], buses: 0, messages: [] }),
  reminders: () => [reminder({})],
  deals: () => ({ alertsToday: 2 }),
  playing: async () => ({ active: true, playing: true, item: { kind: "track", name: "A Song", by: ["One", "Two"], album: null, uri: "spotify:track:x", durationMs: 1 }, progressMs: 0, device: null, shuffle: null, repeat: null, context: null }),
};

test("the picture puts every part on in a fixed order, with the phase, the mode and the train", async () => {
  const picture = await buildPicture(everything, { speaking: "string", trainAlerts: alerts }, morning);
  assert.deepEqual(picture.items.map((item) => item.key), ["server", "train", "backup", "deals", "reminder", "alerts", "music"]);
  assert.deepEqual({ ...picture, items: [] }, {
    at: morning.toISOString(),
    clock: "07:02",
    day: "Monday morning",
    phase: "morning",
    mode: "normal",
    modeUntil: null,
    speaking: "string",
    remote: false,
    items: [],
    train: { leaves: "07:14", expected: "On time", platform: "2", to: "B", cancelled: false, late: false, inMinutes: 12 },
    timers: [{ text: "Stretch", due: "2026-11-30T07:22:00Z", from: "2026-11-30T06:52:00Z" }],
    playing: { title: "A Song", by: "One, Two" },
    morning: null,
  } satisfies WallPicture);
});

test("parts that are switched off are left out, and music only shows while it plays", async () => {
  const picture = await buildPicture({ problems: async () => [], backup: async () => ({ lastRun: null, lastSuccess: null }), playing: async () => ({ active: true, playing: false, item: null, progressMs: null, device: null, shuffle: null, repeat: null, context: null }) }, { speaking: "wobble", trainAlerts: null }, morning);
  assert.deepEqual(picture.items.map((item) => item.key), ["backup", "alerts"]);
  assert.deepEqual([picture.mode, picture.phase, picture.train, picture.timers, picture.playing], [null, "daytime", null, [], null]);
});

test("a part that fails or is slow shows as couldn't check, and the rest still come", async () => {
  const picture = await buildPicture({ ...everything, doctor: async () => Promise.reject(new Error("down")), trains: () => new Promise(() => {}), playing: async () => Promise.reject(new Error("not signed in")) }, { speaking: "wobble", trainAlerts: alerts, waitMs: 30 }, morning);
  const byKey = Object.fromEntries(picture.items.map((item) => [item.key, item]));
  assert.deepEqual([byKey.server.value, byKey.server.note, byKey.train.value], ["?", "couldn't check", "?"]);
  assert.equal(picture.train, null);
  assert.equal(picture.playing, null);
  assert.equal(byKey.backup.value, "03:00");
});

test("a kept picture is made once for a while, and again after", async () => {
  let made = 0;
  const clock = { at: 0 };
  const picture = keptPicture(async () => ({ made: ++made }) as unknown as WallPicture, 1000, () => clock.at);
  await picture();
  await picture();
  assert.equal(made, 1);
  clock.at = 1000;
  await picture();
  assert.equal(made, 2);
});

test("a picture that failed isn't kept", async () => {
  let made = 0;
  const picture = keptPicture(async () => {
    made++;
    throw new Error("no");
  }, 1000, () => 0);
  await assert.rejects(picture());
  await assert.rejects(picture());
  assert.equal(made, 2);
});

test("the picture tells the wall's page whether the TV remote's pointer is on, off unless WALL_REMOTE says on", async () => {
  const sources = { problems: async () => [], backup: async () => ({ lastRun: null, lastSuccess: null }) };
  assert.equal((await buildPicture(sources, { speaking: "wobble", trainAlerts: null }, morning)).remote, false);
  assert.equal((await buildPicture(sources, { speaking: "wobble", remote: true, trainAlerts: null }, morning)).remote, true);
});

test("the picture carries the morning's phase, its time and any snooze, and nothing else of it, or null with the morning off", async () => {
  const sources = { problems: async () => [], backup: async () => ({ lastRun: null, lastSuccess: null }) };
  assert.equal((await buildPicture(sources, { speaking: "wobble", trainAlerts: null }, morning)).morning, null);
  const seen: Date[] = [];
  const waking = await buildPicture({ ...sources, morning: (now) => (seen.push(now), { phase: "snoozed", day: "2026-11-30", at: "06:45", speakSlot: null, upAt: null, by: "voice", snoozedUntil: "2026-11-30T07:05:00.000Z" }) }, { speaking: "wobble", trainAlerts: null }, morning);
  assert.deepEqual(waking.morning, { phase: "snoozed", at: "06:45", snoozedUntil: "2026-11-30T07:05:00.000Z" });
  assert.deepEqual(seen, [morning]);
});
