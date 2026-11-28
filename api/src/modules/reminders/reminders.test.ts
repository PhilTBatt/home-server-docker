import assert from "node:assert/strict";
import { access, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { clearOnNtfy, holdWith, sendToNtfy, sequencePattern, type Notification } from "../notify/notifier.js";
import { createModes, type Mode, type Modes } from "../modes/modes.js";
import { remindersFor } from "./setup.js";
import { createReminders, createReminderStore, keptDue, mostReminders, nextOccurrence, readKept, reminderNotification, reminderSequence, snoozedNotification, type Asked, type Kept, type Reminder, type ReminderStore } from "./reminders.js";

afterEach(() => {
  mock.restoreAll();
  holdWith(undefined);
});

const at = (iso: string) => new Date(iso);

function memoryStore(start: Kept | "missing" | null = "missing") {
  const saves: Kept[] = [];
  const store: ReminderStore = { load: async () => start, save: async (kept) => void saves.push(JSON.parse(JSON.stringify(kept)) as Kept) };
  return { store, saves };
}

function setUp(options: { start?: Kept | "missing" | null; modes?: Modes; failSend?: () => boolean; failClear?: boolean; ids?: string[] } = {}) {
  const { store, saves } = memoryStore(options.start);
  const sent: Notification[] = [];
  const cleared: string[] = [];
  const logs: { level: string; message: string; fields: Record<string, unknown> }[] = [];
  const ids = [...(options.ids ?? ["0000000a", "0000000b", "0000000c", "0000000d"])];
  const reminders = createReminders({
    store,
    modes: options.modes,
    makeId: () => ids.shift() ?? "ffffffff",
    send: async (notification) => {
      if (options.failSend?.() === true) throw new Error("ntfy replied 500");
      sent.push(notification);
    },
    clear: async (sequence) => {
      if (options.failClear === true) throw new Error("ntfy replied 500");
      cleared.push(sequence);
    },
    log: {
      info: (fields, message) => logs.push({ level: "info", message, fields }),
      warn: (fields, message) => logs.push({ level: "warn", message, fields }),
    },
  });
  return { reminders, saves, sent, cleared, logs };
}

const ask = (overrides: Partial<Asked> = {}): Asked => ({ text: "Take the bins out", at: at("2026-11-27T19:00:00.000Z"), repeat: null, urgent: false, kind: "reminder", mode: null, ...overrides });

async function modesFor(start: Mode = "normal") {
  const modes = createModes({ store: { load: async () => "missing", save: async () => {} }, settings: { bedtimeFrom: null, bedtimeUntil: null }, topic: "t", send: async () => {} });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  if (start !== "normal") await modes.set({ mode: start, until: null, by: "typed" }, at("2026-11-27T12:00:00.000Z"));
  return modes;
}

test("a reminder is sent to the phone as Reminder at its time, and goes in the feed for Jarvis", { timeout: 5_000 }, async () => {
  const { reminders, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  const added = await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(added, { added: { id: "0000000a", text: "Take the bins out", kind: "reminder", mode: null, first: "2026-11-27T19:00:00.000Z", at: "2026-11-27T19:00:00.000Z", repeat: null, urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-27T12:00:00.000Z" } });
  await reminders.tick(at("2026-11-27T18:59:59.000Z"));
  assert.equal(sent.length, 0);
  assert.deepEqual(reminders.due(0), { seq: 0, due: [] });
  await reminders.tick(at("2026-11-27T19:00:03.000Z"));
  assert.deepEqual(sent, [{ title: "Reminder", message: "Take the bins out", tags: "alarm_clock", sequence: "reminder-0000000a" }]);
  assert.deepEqual(reminders.due(0), { seq: 1, due: [{ id: "0000000a", text: "Take the bins out", at: "2026-11-27T19:00:00.000Z", late: false, urgent: false }] });
  assert.deepEqual(reminders.due(1), { seq: 1, due: [] });
  await reminders.tick(at("2026-11-27T19:00:08.000Z"));
  assert.equal(sent.length, 1, "it fires once");
});

test("a fired reminder stays a day so it can be snoozed, then goes", { timeout: 5_000 }, async () => {
  const { reminders } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.deepEqual(reminders.list().map((one) => [one.id, one.at, one.firedAt]), [["0000000a", null, "2026-11-27T19:00:00.000Z"]]);
  await reminders.tick(at("2026-11-28T18:59:59.000Z"));
  assert.equal(reminders.list().length, 1);
  assert.equal(reminders.due(0).due.length, 1);
  await reminders.tick(at("2026-11-28T19:00:01.000Z"));
  assert.equal(reminders.list().length, 0);
  assert.equal(reminders.due(0).due.length, 0);
});

test("an urgent reminder is high priority and marked urgent, so bedtime doesn't hold it", { timeout: 5_000 }, async () => {
  const { reminders, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ urgent: true }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.deepEqual(sent, [{ title: "Reminder", message: "Take the bins out", tags: "alarm_clock", sequence: "reminder-0000000a", priority: 4, urgent: true }]);
  assert.equal(reminders.due(0).due[0].urgent, true);
});

test("through the real gate in bedtime, an urgent reminder reaches ntfy and an ordinary one is held", { timeout: 5_000 }, async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const modes = await modesFor("bedtime");
  holdWith((topic, notification) => modes.take(topic, notification, new Date()));
  const reminders = createReminders({ store: memoryStore().store, send: (notification) => sendToNtfy("test-topic", notification), modes });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ urgent: true }), at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Water the plants", at: at("2026-11-27T19:01:00.000Z") }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:02:00.000Z"));
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.body, "Take the bins out");
  assert.equal(modes.view().held, 1);
  assert.equal(reminders.due(0).due.length, 2, "both still reach Jarvis's feed");
});

test("a reminder missed while the API was down fires when it comes back, marked late", { timeout: 5_000 }, async () => {
  const saved: Reminder = { id: "0000000a", text: "Call back", kind: "reminder", mode: null, first: "2026-11-27T19:00:00.000Z", at: "2026-11-27T19:00:00.000Z", repeat: null, urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-27T12:00:00.000Z" };
  const { reminders, sent, logs } = setUp({ start: { seq: 4, reminders: [saved], due: [] } });
  await reminders.load(at("2026-11-27T19:45:00.000Z"));
  assert.deepEqual(sent, [{ title: "Reminder", message: "Call back (due at 19:00, sent late because the hub was down)", tags: "alarm_clock", sequence: "reminder-0000000a" }]);
  assert.deepEqual(reminders.due(4), { seq: 5, due: [{ id: "0000000a", text: "Call back", at: "2026-11-27T19:00:00.000Z", late: true, urgent: false }] });
  assert.ok(logs.some((line) => line.message === "reminders at start" && line.fields.missed === 1));
});

test("a reminder up to two minutes after its time isn't late", { timeout: 5_000 }, async () => {
  const { reminders, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:02:00.000Z"));
  assert.equal(sent[0].message, "Take the bins out");
  assert.equal(reminders.due(0).due[0].late, false);
});

test("a daily reminder fires every day at the same London time, through the change of clocks", { timeout: 5_000 }, async () => {
  const { reminders, sent } = setUp();
  await reminders.load(at("2026-03-27T12:00:00.000Z"));
  await reminders.add(ask({ at: at("2026-03-28T08:00:00.000Z"), repeat: "daily" }), at("2026-03-27T12:00:00.000Z"));
  await reminders.tick(at("2026-03-28T08:00:00.000Z"));
  assert.equal(reminders.list()[0].at, "2026-03-29T07:00:00.000Z");
  await reminders.tick(at("2026-03-29T07:00:00.000Z"));
  assert.equal(reminders.list()[0].at, "2026-03-30T07:00:00.000Z");
  assert.equal(sent.length, 2);
});

test("a weekdays reminder skips the weekend, and a weekly one keeps its weekday", () => {
  const friday = at("2026-11-27T08:00:00.000Z");
  assert.equal(nextOccurrence("weekdays", friday, friday).toISOString(), "2026-11-30T08:00:00.000Z");
  assert.equal(nextOccurrence("weekdays", friday, at("2026-11-30T09:00:00.000Z")).toISOString(), "2026-12-01T08:00:00.000Z");
  assert.equal(nextOccurrence("weekly", friday, friday).toISOString(), "2026-12-04T08:00:00.000Z");
  assert.equal(nextOccurrence("daily", friday, friday).toISOString(), "2026-11-28T08:00:00.000Z");
  assert.equal(nextOccurrence("daily", friday, at("2026-11-27T07:59:00.000Z")).toISOString(), "2026-11-27T08:00:00.000Z");
});

test("a repeating reminder missed several times while the API was down fires once, late, then at its next time", { timeout: 5_000 }, async () => {
  const saved: Reminder = { id: "0000000a", text: "Stretch", kind: "reminder", mode: null, first: "2026-11-20T08:00:00.000Z", at: "2026-11-24T08:00:00.000Z", repeat: "daily", urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-19T12:00:00.000Z" };
  const { reminders, sent } = setUp({ start: { seq: 0, reminders: [saved], due: [] } });
  await reminders.load(at("2026-11-27T10:00:00.000Z"));
  assert.equal(sent.length, 1);
  assert.equal(reminders.due(0).due[0].late, true);
  assert.equal(reminders.list()[0].at, "2026-11-28T08:00:00.000Z");
  await reminders.tick(at("2026-11-28T07:59:00.000Z"));
  assert.equal(reminders.due(0).due.length, 1, "kept a day from when it fired, not from when it was due");
});

test("snoozing a fired reminder sends it again that many minutes later, as a new entry in the feed", { timeout: 5_000 }, async () => {
  const { reminders, sent, logs } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  const snoozed = await reminders.snooze("0000000a", 10, at("2026-11-27T19:00:30.000Z"));
  assert.equal(snoozed !== null && "snoozed" in snoozed && snoozed.snoozed.snoozedTo, "2026-11-27T19:10:30.000Z");
  assert.deepEqual(sent[1], { title: "Reminder snoozed", message: "Take the bins out (snoozed until 19:10)", tags: "zzz", priority: 2, sequence: "reminder-0000000a" }, "the phone's message is replaced at once");
  await reminders.tick(at("2026-11-27T19:10:29.000Z"));
  assert.equal(sent.length, 2);
  await reminders.tick(at("2026-11-27T19:10:31.000Z"));
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[2], { title: "Reminder", message: "Take the bins out", tags: "alarm_clock", sequence: "reminder-0000000a" }, "and replaced again when it's due");
  assert.deepEqual(reminders.due(1).due, [{ id: "0000000a", text: "Take the bins out", at: "2026-11-27T19:10:30.000Z", late: false, urgent: false }]);
  assert.ok(logs.some((line) => line.message === "reminder snoozed" && line.fields.minutes === 10));
});

test("snoozing a repeating reminder adds one more time and keeps its next one", { timeout: 5_000 }, async () => {
  const { reminders, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ repeat: "daily" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.snooze("0000000a", 5, at("2026-11-27T19:01:00.000Z"));
  await reminders.tick(at("2026-11-27T19:06:00.000Z"));
  assert.equal(sent.length, 3);
  assert.deepEqual([reminders.list()[0].at, reminders.list()[0].snoozedTo], ["2026-11-28T19:00:00.000Z", null]);
});

test("done removes a one-off reminder, and for a repeating one drops a snooze and keeps its next time", { timeout: 5_000 }, async () => {
  const { reminders } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ repeat: "weekly" }), at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(await reminders.done("0000000a", at("2026-11-27T13:00:00.000Z")), { done: null });
  await reminders.snooze("0000000b", 30, at("2026-11-27T13:00:00.000Z"));
  const done = await reminders.done("0000000b", at("2026-11-27T13:01:00.000Z"));
  assert.deepEqual(done !== null && done.done !== null && [done.done.snoozedTo, done.done.at], [null, "2026-11-27T19:00:00.000Z"]);
  assert.deepEqual(reminders.list().map((one) => one.id), ["0000000b"]);
  assert.equal(await reminders.done("0000000a", at("2026-11-27T13:02:00.000Z")), null);
});

test("a cancelled reminder never fires", { timeout: 5_000 }, async () => {
  const { reminders, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ repeat: "daily" }), at("2026-11-27T12:00:00.000Z"));
  assert.equal(await reminders.cancel("0000000a", at("2026-11-27T13:00:00.000Z")), true);
  assert.equal(await reminders.cancel("0000000a", at("2026-11-27T13:00:00.000Z")), false);
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.equal(sent.length, 0);
  assert.equal(await reminders.snooze("0000000a", 5, at("2026-11-27T19:00:00.000Z")), null);
});

test("a timed mode switch changes the mode at its time, sends nothing and isn't in the feed", { timeout: 5_000 }, async () => {
  const modes = await modesFor();
  const { reminders, sent } = setUp({ modes });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Gaming time", kind: "mode", mode: "gaming" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.deepEqual([modes.view().mode, modes.view().by], ["gaming", "schedule"]);
  assert.equal(sent.length, 0);
  assert.deepEqual(reminders.due(0), { seq: 0, due: [] });
  assert.equal(reminders.list().length, 0, "a one-off switch goes once it's done");
});

test("a timed mode switch is skipped while away, and a repeating one waits for its next time", { timeout: 5_000 }, async () => {
  const modes = await modesFor("away");
  const { reminders, logs } = setUp({ modes });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Bedtime", kind: "mode", mode: "bedtime", repeat: "daily" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.equal(modes.view().mode, "away");
  assert.ok(logs.some((line) => line.message === "timed mode switch" && line.fields.result === "skipped while away"));
  assert.equal(reminders.list()[0].at, "2026-11-28T19:00:00.000Z");
});

test("a timed mode switch more than half an hour late is skipped, since it belongs to its time", { timeout: 5_000 }, async () => {
  const modes = await modesFor();
  const saved: Reminder = { id: "0000000a", text: "Gaming", kind: "mode", mode: "gaming", first: "2026-11-27T19:00:00.000Z", at: "2026-11-27T19:00:00.000Z", repeat: null, urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-27T12:00:00.000Z" };
  const { reminders, logs } = setUp({ modes, start: { seq: 0, reminders: [saved], due: [] } });
  const other = setUp({ modes, start: { seq: 0, reminders: [{ ...saved }], due: [] } });
  await reminders.load(at("2026-11-27T19:31:00.000Z"));
  assert.equal(modes.view().mode, "normal");
  assert.ok(logs.some((line) => line.message.includes("skipped, being too late")));
  await other.reminders.load(at("2026-11-27T19:29:00.000Z"));
  assert.equal(modes.view().mode, "gaming");
});

test("a timed mode switch can't be set while modes are off, or snoozed", { timeout: 5_000 }, async () => {
  const off = setUp();
  await off.reminders.load(at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(await off.reminders.add(ask({ kind: "mode", mode: "gaming" }), at("2026-11-27T12:00:00.000Z")), { refused: "Modes are switched off, so a timed mode switch can't be set" });
  const on = setUp({ modes: await modesFor() });
  await on.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await on.reminders.add(ask({ kind: "mode", mode: "gaming" }), at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(await on.reminders.snooze("0000000a", 5, at("2026-11-27T12:00:00.000Z")), { refused: "A timed mode switch can't be snoozed: cancel it and set a new one" });
});

test("at most 50 at once", { timeout: 5_000 }, async () => {
  const ids = Array.from({ length: mostReminders + 1 }, (_, i) => i.toString(16).padStart(8, "0"));
  const { reminders } = setUp({ ids });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  for (let i = 0; i < mostReminders; i++) assert.ok("added" in (await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"))));
  assert.deepEqual(await reminders.add(ask(), at("2026-11-27T12:00:00.000Z")), { refused: "50 reminders are already set, the most at once: cancel one first" });
});

test("everything is saved, and the feed's numbers carry on after a restart", { timeout: 5_000 }, async () => {
  const first = setUp();
  await first.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await first.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await first.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  const kept = first.saves.at(-1) as Kept;
  assert.equal(kept.seq, 1);
  assert.equal(kept.due.length, 1);
  const second = setUp({ start: kept });
  await second.reminders.load(at("2026-11-27T19:05:00.000Z"));
  assert.deepEqual(second.reminders.due(0).due.map((one) => one.id), ["0000000a"]);
  await second.reminders.add(ask({ at: at("2026-11-27T20:00:00.000Z") }), at("2026-11-27T19:05:00.000Z"));
  await second.reminders.tick(at("2026-11-27T20:00:00.000Z"));
  assert.equal(second.reminders.due(0).seq, 2);
});

test("the feed keeps a day and at most 50", { timeout: 5_000 }, async () => {
  const ids = Array.from({ length: keptDue + 5 }, (_, i) => i.toString(16).padStart(8, "0"));
  const { reminders } = setUp({ ids });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  for (let i = 0; i < 30; i++) await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  for (const one of reminders.list()) await reminders.done(one.id, at("2026-11-27T19:00:01.000Z"));
  for (let i = 0; i < keptDue - 25; i++) await reminders.add(ask({ at: at("2026-11-27T20:00:00.000Z") }), at("2026-11-27T19:00:02.000Z"));
  await reminders.tick(at("2026-11-27T20:00:00.000Z"));
  const answer = reminders.due(0);
  assert.deepEqual([answer.seq, answer.due.length], [keptDue + 5, keptDue]);
  await reminders.tick(at("2026-11-28T20:00:01.000Z"));
  assert.deepEqual(reminders.due(0).due, []);
});

test("a reminder ntfy doesn't take is tried again at the next check, and dropped after an hour", { timeout: 5_000 }, async () => {
  let failing = true;
  const { reminders, sent, logs } = setUp({ failSend: () => failing });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Second", at: at("2026-11-27T19:10:00.000Z") }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.equal(reminders.due(0).due.length, 1, "Jarvis still hears it");
  failing = false;
  await reminders.tick(at("2026-11-27T19:00:05.000Z"));
  assert.deepEqual(sent.map((one) => one.message), ["Take the bins out"]);
  failing = true;
  await reminders.tick(at("2026-11-27T19:10:00.000Z"));
  await reminders.tick(at("2026-11-27T20:10:01.000Z"));
  failing = false;
  await reminders.tick(at("2026-11-27T20:10:06.000Z"));
  assert.deepEqual(sent.map((one) => one.message), ["Take the bins out"]);
  assert.ok(logs.some((line) => line.message.includes("dropped after an hour")));
});

test("the logs give ids, kinds and times, never a reminder's words", { timeout: 5_000 }, async () => {
  const { reminders, logs } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Private words here" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.snooze("0000000a", 3, at("2026-11-27T19:00:00.000Z"));
  await reminders.cancel("0000000a", at("2026-11-27T19:00:00.000Z"));
  assert.deepEqual(logs.map((line) => line.message), ["reminders at start", "reminder set", "reminder due", "reminder snoozed", "reminder cancelled"]);
  assert.equal(JSON.stringify(logs).includes("Private"), false);
  assert.deepEqual(logs[1].fields, { id: "0000000a", kind: "reminder", mode: null, repeat: null, urgent: false, at: "2026-11-27T19:00:00.000Z", inMinutes: 420, reminders: 1 });
});

test("readKept takes only a whole, well-formed file", () => {
  const reminder: Reminder = { id: "0000000a", text: "Call back", kind: "reminder", mode: null, first: "2026-11-27T19:00:00.000Z", at: "2026-11-27T19:00:00.000Z", repeat: "daily", urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-27T12:00:00.000Z" };
  const good: Kept = { seq: 3, reminders: [reminder], due: [{ seq: 3, id: "0000000a", text: "Call back", at: "2026-11-27T19:00:00.000Z", late: false, urgent: false, addedAt: "2026-11-27T19:00:02.000Z" }] };
  assert.deepEqual(readKept(JSON.stringify(good)), good);
  const bad = [
    { ...good, seq: -1 },
    { ...good, reminders: [{ ...reminder, kind: "mode" }] },
    { ...good, reminders: [{ ...reminder, mode: "gaming" }] },
    { ...good, reminders: [{ ...reminder, repeat: "hourly" }] },
    { ...good, reminders: [{ ...reminder, text: "" }] },
    { ...good, reminders: [{ ...reminder, id: "../x" }] },
    { ...good, reminders: [{ ...reminder, at: "soon" }] },
    { ...good, due: [{ ...good.due[0], seq: 0 }] },
    { ...good, due: [{ ...good.due[0], addedAt: null }] },
  ];
  for (const one of bad) assert.equal(readKept(JSON.stringify(one)), null, JSON.stringify(one));
  assert.equal(readKept("not json"), null);
});

test("the file store keeps reminders readable only by the API, and moves an unreadable file aside rather than losing it", { timeout: 5_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "reminders-"));
  const path = join(dir, "reminders.json");
  const store = createReminderStore(path);
  assert.equal(await store.load(), "missing");
  const kept: Kept = { seq: 0, reminders: [], due: [] };
  await store.save(kept);
  assert.deepEqual(await store.load(), kept);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await writeFile(path, "{broken");
  assert.equal(await store.load(), null);
  assert.equal(await readFile(`${path}.bad`, "utf8"), "{broken");
  await assert.rejects(access(path));
});

test("reminderNotification says when a late one was due, in London time", () => {
  const reminder = { text: "Stretch", urgent: false } as Reminder;
  assert.equal(reminderNotification(reminder, at("2026-07-01T07:30:00.000Z"), true).message, "Stretch (due at 08:30, sent late because the hub was down)");
  assert.equal(reminderNotification(reminder, at("2026-07-01T07:30:00.000Z"), false).message, "Stretch");
});

test("each reminder's phone message has a sequence ID made from its own id, which ntfy will take", () => {
  const reminder: Reminder = { id: "0a1b2c3d", text: "Take the bins out", kind: "reminder", mode: null, first: "2026-11-27T19:00:00.000Z", at: null, repeat: null, urgent: false, snoozedTo: null, firedAt: null, createdAt: "2026-11-27T12:00:00.000Z" };
  const sequence = reminderNotification(reminder, at("2026-11-27T19:00:00.000Z"), false).sequence;
  assert.equal(sequence, "reminder-0a1b2c3d");
  assert.equal(reminderSequence("0a1b2c3d"), sequence);
  assert.match(sequence ?? "", sequencePattern);
  assert.ok(!(sequence ?? "").includes("bins"), "nothing from the reminder's text");
  assert.equal(snoozedNotification({ ...reminder, urgent: true }, at("2026-11-27T19:10:00.000Z")).urgent, true, "an urgent one's snooze isn't held by bedtime either");
});

test("done and cancel clear a fired reminder's message from the phone, by its sequence ID", { timeout: 5_000 }, async () => {
  const { reminders, cleared, logs } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Water the plants" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.done("0000000a", at("2026-11-27T19:01:00.000Z"));
  assert.deepEqual(cleared, ["reminder-0000000a"]);
  await reminders.cancel("0000000b", at("2026-11-27T19:01:00.000Z"));
  assert.deepEqual(cleared, ["reminder-0000000a", "reminder-0000000b"]);
  assert.ok(logs.some((line) => line.message === "reminder done" && line.fields.cleared === true));
  assert.ok(logs.some((line) => line.message === "reminder cancelled" && line.fields.cleared === true));
  assert.ok(!JSON.stringify(logs).includes("bins"), "logs never hold the text");
});

test("a reminder that hasn't gone off yet has nothing on the phone, so cancelling it clears nothing and a snooze sends nothing", { timeout: 5_000 }, async () => {
  const { reminders, cleared, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.snooze("0000000b", 10, at("2026-11-27T13:00:00.000Z"));
  await reminders.cancel("0000000a", at("2026-11-27T13:00:00.000Z"));
  assert.deepEqual(cleared, []);
  assert.deepEqual(sent, []);
  assert.equal(await reminders.cancel("0000000a", at("2026-11-27T13:00:00.000Z")), false, "cancelling it twice is still not found");
});

test("done on a repeating reminder clears today's message and keeps its next time, whose message replaces it", { timeout: 5_000 }, async () => {
  const { reminders, cleared, sent } = setUp();
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ repeat: "daily" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.done("0000000a", at("2026-11-27T19:01:00.000Z"));
  assert.deepEqual(cleared, ["reminder-0000000a"]);
  assert.equal(reminders.list().length, 1);
  await reminders.tick(at("2026-11-28T19:00:00.000Z"));
  assert.equal(sent.at(-1)?.sequence, "reminder-0000000a");
});

test("if the phone's message can't be cleared, done still works and the log says so without the text", { timeout: 5_000 }, async () => {
  const { reminders, logs } = setUp({ failClear: true });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  assert.deepEqual(await reminders.done("0000000a", at("2026-11-27T19:01:00.000Z")), { done: null });
  assert.equal(reminders.list().length, 0);
  assert.ok(logs.some((line) => line.level === "warn" && line.message === "a reminder's message couldn't be cleared from the phone" && line.fields.id === "0000000a"));
  assert.ok(logs.some((line) => line.message === "reminder done" && line.fields.cleared === false));
});

test("done, cancel or a snooze drop a fired reminder's message still waiting to be retried, so it can't arrive after", { timeout: 5_000 }, async () => {
  let failing = true;
  const { reminders, sent, logs } = setUp({ failSend: () => failing });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask({ text: "Water the plants" }), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.done("0000000a", at("2026-11-27T19:00:10.000Z"));
  failing = false;
  await reminders.snooze("0000000b", 10, at("2026-11-27T19:00:20.000Z"));
  await reminders.tick(at("2026-11-27T19:00:30.000Z"));
  assert.deepEqual(sent.map((one) => one.title), ["Reminder snoozed"], "neither old message is retried");
  assert.ok(logs.some((line) => line.message === "reminder done" && line.fields.unsentDropped === 1));
  assert.ok(logs.some((line) => line.message === "reminder snoozed" && line.fields.unsentDropped === 1 && line.fields.replaced === true));
});

test("through the real notifier, a snooze update and a clear reach ntfy with the reminder's sequence ID", { timeout: 5_000 }, async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => (calls.push([String(url), init]), new Response(null, { status: 200 })));
  const reminders = createReminders({ store: memoryStore().store, send: (notification) => sendToNtfy("test-topic", notification), clear: (sequence) => clearOnNtfy("test-topic", sequence), makeId: () => "0000000a" });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.snooze("0000000a", 10, at("2026-11-27T19:01:00.000Z"));
  await reminders.done("0000000a", at("2026-11-27T19:02:00.000Z"));
  assert.deepEqual(calls.map(([url, init]) => [url, init?.method, (init?.headers as Record<string, string> | undefined)?.["X-Sequence-ID"] ?? null]), [
    ["https://ntfy.sh/test-topic", "POST", "reminder-0000000a"],
    ["https://ntfy.sh/test-topic", "POST", "reminder-0000000a"],
    ["https://ntfy.sh/test-topic/reminder-0000000a/clear", "PUT", null],
  ]);
});

test("the hub's own reminders send and clear through ntfy with the topic from its settings", { timeout: 5_000 }, async () => {
  const calls: Array<[string, string | undefined]> = [];
  mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => (calls.push([String(url), init?.method]), new Response(null, { status: 200 })));
  const dir = await mkdtemp(join(tmpdir(), "reminders-setup-"));
  const reminders = remindersFor({ ntfyTopic: "test-topic" }, undefined, {}, dir);
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  const added = await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  assert.ok("added" in added);
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await reminders.cancel(added.added.id, at("2026-11-27T19:01:00.000Z"));
  assert.deepEqual(calls, [
    ["https://ntfy.sh/test-topic", "POST"],
    [`https://ntfy.sh/test-topic/reminder-${added.added.id}/clear`, "PUT"],
  ]);
});

test("a snooze message that couldn't be sent never lands after the reminder goes off again", { timeout: 5_000 }, async () => {
  let failing = false;
  const { reminders, sent } = setUp({ failSend: () => failing });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  failing = true;
  await reminders.snooze("0000000a", 5, at("2026-11-27T19:00:10.000Z"));
  failing = false;
  await reminders.tick(at("2026-11-27T19:05:11.000Z"));
  assert.equal(sent.at(-1)?.title, "Reminder", "the reminder itself is what the phone shows last");
  assert.equal(sent.filter((one) => one.title === "Reminder snoozed").length, 0);
});

test("done during a retry under way stops that message coming back, and clears it if it got through", { timeout: 5_000 }, async () => {
  let release: () => void = () => {};
  let calls = 0;
  const sent: Notification[] = [];
  const cleared: string[] = [];
  const reminders = createReminders({
    store: memoryStore().store,
    makeId: () => "0000000a",
    send: async (notification) => {
      calls++;
      if (calls <= 2) throw new Error("ntfy replied 500");
      await new Promise<void>((resolve) => (release = resolve));
      sent.push(notification);
    },
    clear: async (sequence) => void cleared.push(sequence),
  });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  const retry = reminders.tick(at("2026-11-27T19:00:05.000Z"));
  await new Promise((resolve) => setImmediate(resolve));
  await reminders.done("0000000a", at("2026-11-27T19:00:06.000Z"));
  release();
  await retry;
  assert.deepEqual(cleared, ["reminder-0000000a", "reminder-0000000a"], "cleared at done, and again once the late copy landed");
  await reminders.tick(at("2026-11-27T19:00:10.000Z"));
  assert.equal(calls, 3, "never tried again");
});

test("a snooze during a retry under way puts the snooze message back if the old one lands after it", { timeout: 5_000 }, async () => {
  let release: () => void = () => {};
  let calls = 0;
  const sent: Notification[] = [];
  const reminders = createReminders({
    store: memoryStore().store,
    makeId: () => "0000000a",
    send: async (notification) => {
      calls++;
      if (calls <= 2) throw new Error("ntfy replied 500");
      if (calls === 3) await new Promise<void>((resolve) => (release = resolve));
      sent.push(notification);
    },
    clear: async () => {},
  });
  await reminders.load(at("2026-11-27T12:00:00.000Z"));
  await reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await reminders.tick(at("2026-11-27T19:00:00.000Z"));
  const retry = reminders.tick(at("2026-11-27T19:00:05.000Z"));
  await new Promise((resolve) => setImmediate(resolve));
  await reminders.snooze("0000000a", 10, at("2026-11-27T19:00:06.000Z"));
  release();
  await retry;
  assert.equal(sent.at(-1)?.title, "Reminder snoozed", "the phone ends up showing the snooze");
});

function heldPhone(held: number[]) {
  const events: string[] = [];
  const logs: { message: string; fields: Record<string, unknown> }[] = [];
  const releases = new Map<number, () => void>();
  let calls = 0;
  let failing = false;
  const reminders = createReminders({
    store: memoryStore().store,
    makeId: (() => {
      const ids = ["0000000a", "0000000b"];
      return () => ids.shift() ?? "ffffffff";
    })(),
    send: async (notification) => {
      calls++;
      const call = calls;
      if (failing) throw new Error("ntfy replied 500");
      if (held.includes(call)) await new Promise<void>((resolve) => releases.set(call, resolve));
      if (failing) throw new Error("ntfy replied 500");
      events.push(`${notification.title}: ${notification.message.split("\n")[0]}`);
    },
    clear: async (sequence) => void events.push(`clear ${sequence}`),
    log: { info: (fields, message) => logs.push({ message, fields }), warn: (fields, message) => logs.push({ message, fields }) },
  });
  const started = async (call: number) => {
    while (calls < call || (held.includes(call) && !releases.has(call))) await new Promise((resolve) => setImmediate(resolve));
  };
  return { reminders, events, logs, started, release: (call: number) => releases.get(call)?.(), fail: (on: boolean) => void (failing = on) };
}

const shown = (events: string[]) => events.map((one) => one.split(":")[0]);

test("a snooze while the reminder's first message is still on its way puts the snooze message back after it lands", { timeout: 5_000 }, async () => {
  const phone = heldPhone([1]);
  await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  const firing = phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await phone.started(1);
  await phone.reminders.snooze("0000000a", 10, at("2026-11-27T19:00:01.000Z"));
  phone.release(1);
  await firing;
  assert.deepEqual(shown(phone.events), ["Reminder snoozed", "Reminder", "Reminder snoozed"]);
});

for (const how of ["done", "cancel"] as const) {
  test(`${how} while the reminder's first message is still on its way clears it again once it lands`, { timeout: 5_000 }, async () => {
    const phone = heldPhone([1]);
    await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
    await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
    const firing = phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
    await phone.started(1);
    if (how === "done") await phone.reminders.done("0000000a", at("2026-11-27T19:00:01.000Z"));
    else await phone.reminders.cancel("0000000a", at("2026-11-27T19:00:01.000Z"));
    phone.release(1);
    await firing;
    assert.deepEqual(phone.events, ["clear reminder-0000000a", "Reminder: Take the bins out", "clear reminder-0000000a"]);
  });
}

for (const how of ["done", "cancel", "snooze"] as const) {
  test(`${how} while the reminder's first message is on its way, and that message then fails, never sends the old message later`, { timeout: 5_000 }, async () => {
    const phone = heldPhone([1]);
    await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
    await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
    const firing = phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
    await phone.started(1);
    if (how === "done") await phone.reminders.done("0000000a", at("2026-11-27T19:00:01.000Z"));
    else if (how === "cancel") await phone.reminders.cancel("0000000a", at("2026-11-27T19:00:01.000Z"));
    else await phone.reminders.snooze("0000000a", 10, at("2026-11-27T19:00:01.000Z"));
    phone.fail(true);
    phone.release(1);
    await firing;
    phone.fail(false);
    const before = [...phone.events];
    await phone.reminders.tick(at("2026-11-27T19:01:00.000Z"));
    await phone.reminders.tick(at("2026-11-27T19:02:00.000Z"));
    assert.deepEqual(phone.events, before);
    assert.ok(!phone.events.some((one) => one.startsWith("Reminder:")));
  });
}

test("done while the snooze message is still on its way clears it again once it lands", { timeout: 5_000 }, async () => {
  const phone = heldPhone([2]);
  await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  const snoozing = phone.reminders.snooze("0000000a", 10, at("2026-11-27T19:00:01.000Z"));
  await phone.started(2);
  await phone.reminders.done("0000000a", at("2026-11-27T19:00:02.000Z"));
  phone.release(2);
  await snoozing;
  assert.deepEqual(shown(phone.events), ["Reminder", "clear reminder-0000000a", "Reminder snoozed", "clear reminder-0000000a"]);
});

test("a snooze message still on its way when the reminder goes off again can't leave the snooze showing", { timeout: 5_000 }, async () => {
  const phone = heldPhone([2]);
  await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  const snoozing = phone.reminders.snooze("0000000a", 10, at("2026-11-27T19:00:01.000Z"));
  await phone.started(2);
  await phone.reminders.tick(at("2026-11-27T19:10:01.000Z"));
  phone.release(2);
  await snoozing;
  assert.deepEqual(shown(phone.events), ["Reminder", "Reminder", "Reminder snoozed", "Reminder"], "the reminder is put back last");
});

test("cancel drops a fired reminder's message still waiting to be retried", { timeout: 5_000 }, async () => {
  const phone = heldPhone([]);
  await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  phone.fail(true);
  await phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  phone.fail(false);
  await phone.reminders.cancel("0000000a", at("2026-11-27T19:00:01.000Z"));
  await phone.reminders.tick(at("2026-11-27T19:00:05.000Z"));
  assert.deepEqual(phone.events, ["clear reminder-0000000a"], "the old message is never sent");
  assert.ok(phone.logs.some((line) => line.message === "reminder cancelled" && line.fields.unsentDropped === 1));
});

test("a copy done while another is being retried in the same check is never sent, rather than sent and cleared", { timeout: 5_000 }, async () => {
  const phone = heldPhone([5]);
  await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask(), at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask({ text: "Water the plants" }), at("2026-11-27T12:00:00.000Z"));
  phone.fail(true);
  await phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  phone.fail(false);
  const retrying = phone.reminders.tick(at("2026-11-27T19:00:05.000Z"));
  await phone.started(5);
  await phone.reminders.done("0000000b", at("2026-11-27T19:00:06.000Z"));
  phone.release(5);
  await retrying;
  assert.deepEqual(phone.events, ["clear reminder-0000000b", "Reminder: Take the bins out"]);
});

test("putting a late message right logs only the id and whether something was put back", { timeout: 5_000 }, async () => {
  const phone = heldPhone([1]);
  await phone.reminders.load(at("2026-11-27T12:00:00.000Z"));
  await phone.reminders.add(ask({ text: "Private words here" }), at("2026-11-27T12:00:00.000Z"));
  const firing = phone.reminders.tick(at("2026-11-27T19:00:00.000Z"));
  await phone.started(1);
  await phone.reminders.snooze("0000000a", 10, at("2026-11-27T19:00:01.000Z"));
  phone.release(1);
  await firing;
  const settled = phone.logs.find((line) => line.message.startsWith("a reminder's old message"));
  assert.deepEqual(settled?.fields, { id: "0000000a", putBack: true });
  assert.equal(JSON.stringify(phone.logs).includes("Private"), false);
});
