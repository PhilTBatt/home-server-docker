import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { holdWith, sendToNtfy, type Notification } from "../notify/notifier.js";
import { findNotification } from "../phone/routes.js";
import { changeNotification } from "../trains/alerts.js";
import { createModes, createModeStore, heldMostBytes, heldNotification, londonAt, mostHeld, nextLondon, readSaved, type ModeSettings, type ModeStore, type Saved } from "./modes.js";

afterEach(() => {
  mock.restoreAll();
  holdWith(undefined);
});

function memoryStore(start: Saved | "missing" | null = "missing") {
  const saves: Saved[] = [];
  const store: ModeStore = {
    load: async () => start,
    save: async (saved) => {
      saves.push(saved);
    },
  };
  return { store, saves };
}

function setUp(options: { settings?: ModeSettings; start?: Saved | "missing" | null; failSend?: () => boolean; topic?: string; slowSend?: () => Promise<void> } = {}) {
  const { store, saves } = memoryStore(options.start);
  const sent: { topic: string; notification: Notification }[] = [];
  const logs: { level: string; message: string; fields: Record<string, unknown> }[] = [];
  const modes = createModes({
    store,
    settings: options.settings ?? { bedtimeFrom: null, bedtimeUntil: null },
    topic: options.topic ?? "test-topic",
    send: async (topic, notification) => {
      if (options.failSend?.() === true) throw new Error("ntfy replied 500");
      await options.slowSend?.();
      sent.push({ topic, notification });
    },
    log: {
      info: (fields, message) => logs.push({ level: "info", message, fields }),
      warn: (fields, message) => logs.push({ level: "warn", message, fields }),
    },
  });
  return { modes, saves, sent, logs };
}

const at = (iso: string) => new Date(iso);
const alert: Notification = { title: "Home Hub: 1 problem", message: "Disk is low.", tags: "warning" };

test("with nothing saved it starts as normal, set by the start, and saves that", async () => {
  const { modes, saves } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(modes.view(), { mode: "normal", since: "2026-11-27T12:00:00.000Z", until: null, by: "start", held: 0 });
  assert.equal(saves.at(-1)?.mode, "normal");
});

test("a saved mode is kept across a restart, with when and how it was set", async () => {
  const start: Saved = { mode: "gaming", since: "2026-11-27T10:00:00.000Z", until: null, by: "voice", held: 0, bedtimeDay: null };
  const { modes } = setUp({ start });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(modes.view(), { mode: "gaming", since: "2026-11-27T10:00:00.000Z", until: null, by: "voice", held: 0 });
});

test("a saved mode whose end passed while the API was down goes back to normal at start", async () => {
  const start: Saved = { mode: "away", since: "2026-11-20T10:00:00.000Z", until: "2026-11-26T10:00:00.000Z", by: "voice", held: 0, bedtimeDay: null };
  const { modes } = setUp({ start });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  assert.deepEqual(modes.view(), { mode: "normal", since: "2026-11-27T12:00:00.000Z", until: null, by: "schedule", held: 0 });
});

test("an unreadable saved mode starts as normal and says so in the log", async () => {
  const { modes, logs } = setUp({ start: null });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  assert.equal(modes.view().mode, "normal");
  assert.ok(logs.some((line) => line.level === "warn" && line.message.includes("couldn't be read")));
});

test("switching mode records when, how and until when, and saves it", async () => {
  const { modes, saves, logs } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  const result = await modes.set({ mode: "away", until: at("2026-11-29T18:00:00.000Z"), by: "voice" }, at("2026-11-27T13:00:00.000Z"));
  assert.deepEqual(result, { view: { mode: "away", since: "2026-11-27T13:00:00.000Z", until: "2026-11-29T18:00:00.000Z", by: "voice", held: 0 } });
  assert.deepEqual(saves.at(-1), { mode: "away", since: "2026-11-27T13:00:00.000Z", until: "2026-11-29T18:00:00.000Z", by: "voice", held: 0, bedtimeDay: null });
  assert.ok(logs.some((line) => line.message === "mode switched" && line.fields.from === "normal" && line.fields.to === "away" && line.fields.by === "voice"));
});

test("asking for the mode it's already in keeps its start and changes only its end and source", async () => {
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "away", until: null, by: "voice" }, at("2026-11-27T13:00:00.000Z"));
  const again = await modes.set({ mode: "away", until: at("2026-11-28T09:00:00.000Z"), by: "typed" }, at("2026-11-27T14:00:00.000Z"));
  assert.deepEqual(again, { view: { mode: "away", since: "2026-11-27T13:00:00.000Z", until: "2026-11-28T09:00:00.000Z", by: "typed", held: 0 } });
});

test("guest mode is switched on by voice, but off only by typing or from the phone page", async () => {
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  assert.equal("view" in (await modes.set({ mode: "guest", until: null, by: "voice" }, at("2026-11-27T13:00:00.000Z"))), true);
  for (const mode of ["normal", "bedtime", "gaming", "coding", "away"] as const) {
    assert.deepEqual(await modes.set({ mode, until: null, by: "voice" }, at("2026-11-27T13:01:00.000Z")), { refused: "Guest mode is switched off only by typing /guest off or from the phone page" }, mode);
  }
  assert.equal(modes.view().mode, "guest");
  assert.equal("view" in (await modes.set({ mode: "guest", until: null, by: "voice" }, at("2026-11-27T13:02:00.000Z"))), true);
  assert.equal(modes.view().mode, "guest");
  assert.equal((await modes.set({ mode: "normal", until: null, by: "typed" }, at("2026-11-27T13:03:00.000Z")) as { view: { mode: string } }).view.mode, "normal");
  await modes.set({ mode: "guest", until: null, by: "typed" }, at("2026-11-27T13:04:00.000Z"));
  assert.equal((await modes.set({ mode: "normal", until: null, by: "phone" }, at("2026-11-27T13:05:00.000Z")) as { view: { mode: string } }).view.mode, "normal");
  await modes.set({ mode: "guest", until: null, by: "voice" }, at("2026-11-27T13:06:00.000Z"));
  assert.equal((await modes.set({ mode: "bedtime", until: null, by: "owner" }, at("2026-11-27T13:07:00.000Z")) as { view: { mode: string; by: string } }).view.by, "owner", "Jarvis says it was the owner's voice, from ears's voice ID");
});

test("bedtime with no end given ends at the next BEDTIME_UNTIL, in London time", async () => {
  const { modes } = setUp({ settings: { bedtimeFrom: null, bedtimeUntil: 7 * 60 } });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:30:00.000Z"));
  assert.equal(modes.view().until, "2026-11-28T07:00:00.000Z");
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T01:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-28T02:00:00.000Z"));
  assert.equal(modes.view().until, "2026-11-28T07:00:00.000Z");
});

test("in summer time, BEDTIME_UNTIL is still London's clock", async () => {
  const { modes } = setUp({ settings: { bedtimeFrom: null, bedtimeUntil: 7 * 60 } });
  await modes.load(at("2026-06-10T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-06-10T22:30:00.000Z"));
  assert.equal(modes.view().until, "2026-06-11T06:00:00.000Z");
});

test("bedtime with no BEDTIME_UNTIL and no end lasts until it's switched", async () => {
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:30:00.000Z"));
  assert.equal(modes.view().until, null);
  await modes.tick(at("2026-11-29T12:00:00.000Z"));
  assert.equal(modes.view().mode, "bedtime");
});

test("a mode with an end goes back to normal at the first check after it, by the schedule", async () => {
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "away", until: at("2026-11-27T15:00:00.000Z"), by: "voice" }, at("2026-11-27T13:00:00.000Z"));
  await modes.tick(at("2026-11-27T14:59:59.000Z"));
  assert.equal(modes.view().mode, "away");
  await modes.tick(at("2026-11-27T15:00:00.000Z"));
  assert.deepEqual(modes.view(), { mode: "normal", since: "2026-11-27T15:00:00.000Z", until: null, by: "schedule", held: 0 });
});

test("only bedtime holds phone alerts: in every other mode they go straight through", async () => {
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  for (const mode of ["normal", "gaming", "coding", "away", "guest"] as const) {
    await modes.set({ mode, until: null, by: "typed" }, at("2026-11-27T13:00:00.000Z"));
    assert.equal(modes.take("test-topic", alert, at("2026-11-27T13:01:00.000Z")), false, mode);
  }
  await modes.set({ mode: "bedtime", until: null, by: "typed" }, at("2026-11-27T23:00:00.000Z"));
  assert.equal(modes.take("test-topic", alert, at("2026-11-27T23:01:00.000Z")), true);
  assert.equal(modes.view().held, 1);
});

test("an alert held while the last bedtime's message is still being sent isn't wiped when that send finishes, and goes with the next", async () => {
  let release = () => {};
  let slow = true;
  const { modes, sent } = setUp({ slowSend: () => (slow ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()) });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("test-topic", alert, at("2026-11-28T02:14:00.000Z"));
  const leaving = modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:05:00.000Z"));
  await new Promise(setImmediate);
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-28T07:06:00.000Z"));
  modes.take("test-topic", { title: "Train change", message: "The 07:14 is 6 minutes late.", tags: "warning" }, at("2026-11-28T07:06:30.000Z"));
  slow = false;
  release();
  await leaving;
  assert.equal(sent.length, 1);
  assert.equal(modes.view().held, 1, "the new one is still held");
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:30:00.000Z"));
  assert.equal(sent.length, 2);
  assert.ok(sent[1].notification.message.includes("The 07:14 is 6 minutes late."), sent[1].notification.message);
});

test("leaving bedtime sends what was held as one message, with when each came, and nothing is held after", async () => {
  const { modes, sent, logs, saves } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("test-topic", alert, at("2026-11-28T02:14:00.000Z"));
  modes.take("test-topic", { title: "Train change", message: "The 07:14 is 6 minutes late.", tags: "warning" }, at("2026-11-28T06:50:00.000Z"));
  await new Promise(setImmediate);
  assert.equal(saves.at(-1)?.held, 2);
  assert.equal(sent.length, 0);
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:05:00.000Z"));
  assert.deepEqual(sent, [{ topic: "test-topic", notification: { title: "Held during bedtime: 2 alerts", message: "02:14 Home Hub: 1 problem\nDisk is low.\n\n06:50 Train change\nThe 07:14 is 6 minutes late.", tags: "zzz" } }]);
  assert.equal(modes.view().held, 0);
  assert.equal(saves.at(-1)?.held, 0);
  assert.ok(logs.some((line) => line.message.includes("sent the phone alerts held") && line.fields.sent === 2));
});

test("bedtime ending at its time sends what was held too", async () => {
  const { modes, sent } = setUp({ settings: { bedtimeFrom: null, bedtimeUntil: 7 * 60 } });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("test-topic", alert, at("2026-11-28T03:00:00.000Z"));
  await modes.tick(at("2026-11-28T06:59:30.000Z"));
  assert.equal(sent.length, 0);
  await modes.tick(at("2026-11-28T07:00:10.000Z"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].notification.title, "Held during bedtime: 1 alert");
});

test("going from bedtime to away sends what was held straight away, since away holds nothing", async () => {
  const { modes, sent } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("test-topic", alert, at("2026-11-28T03:00:00.000Z"));
  await modes.set({ mode: "away", until: null, by: "voice" }, at("2026-11-28T08:00:00.000Z"));
  assert.equal(sent.length, 1);
  assert.equal(modes.take("test-topic", alert, at("2026-11-28T09:00:00.000Z")), false);
});

test("a held message that ntfy doesn't take is kept and tried again at the next check", async () => {
  let failing = true;
  const { modes, sent, logs } = setUp({ failSend: () => failing });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("test-topic", alert, at("2026-11-28T03:00:00.000Z"));
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:00:00.000Z"));
  assert.equal(sent.length, 0);
  assert.equal(modes.view().held, 1);
  assert.ok(logs.some((line) => line.level === "warn" && line.message.includes("couldn't be sent")));
  failing = false;
  await modes.tick(at("2026-11-28T07:00:30.000Z"));
  assert.equal(sent.length, 1);
  assert.equal(modes.view().held, 0);
  await modes.tick(at("2026-11-28T07:01:00.000Z"));
  assert.equal(sent.length, 1);
});

test("nothing is sent at a check when nothing was held", async () => {
  const { modes, sent } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:00:00.000Z"));
  await modes.tick(at("2026-11-28T07:00:30.000Z"));
  assert.equal(sent.length, 0);
});

test("each held message keeps its own topic", async () => {
  const { modes, sent } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("topic-a", alert, at("2026-11-28T03:00:00.000Z"));
  modes.take("topic-b", alert, at("2026-11-28T03:01:00.000Z"));
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:00:00.000Z"));
  assert.deepEqual(sent.map((one) => one.topic), ["topic-a", "topic-b"]);
});

test("past the most it keeps, it counts the rest and the message says how many more", async () => {
  const { modes, sent } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  for (let i = 0; i < mostHeld + 3; i++) modes.take("test-topic", { title: "A", message: "b", tags: "warning" }, at("2026-11-28T03:00:00.000Z"));
  assert.equal(modes.view().held, mostHeld + 3);
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T07:00:00.000Z"));
  assert.equal(sent[0].notification.title, `Held during bedtime: ${mostHeld + 3} alerts`);
  assert.match(sent[0].notification.message, /\n\nAnd 3 more\.$/);
});

test("the one message stays under ntfy's size for a message, saying how many didn't fit", () => {
  const held = Array.from({ length: 60 }, (_, i) => ({ topic: "t", notification: { title: `Alert ${i}`, message: "x".repeat(100), tags: "warning" }, at: new Date("2026-11-28T03:00:00.000Z") }));
  const notification = heldNotification(held, 0, 0);
  assert.ok(Buffer.byteLength(notification.message) <= heldMostBytes + 50);
  const shown = notification.message.split("\n\n").length - 1;
  assert.match(notification.message, new RegExp(`And ${60 - shown} more\\.$`));
});

test("phone alerts held when the API restarted are lost, and the next message after bedtime says how many", async () => {
  const start: Saved = { mode: "bedtime", since: "2026-11-27T23:00:00.000Z", until: "2026-11-28T07:00:00.000Z", by: "voice", held: 2, bedtimeDay: null };
  const { modes, sent, logs } = setUp({ start });
  await modes.load(at("2026-11-28T04:00:00.000Z"));
  assert.ok(logs.some((line) => line.level === "warn" && line.fields.lost === 2));
  assert.equal(modes.view().held, 0);
  modes.take("test-topic", alert, at("2026-11-28T05:00:00.000Z"));
  await modes.tick(at("2026-11-28T07:00:00.000Z"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].notification.title, "Held during bedtime: 1 alert");
  assert.match(sent[0].notification.message, /\n\n2 more were held before the API restarted, and are lost\.$/);
});

test("lost alerts with nothing else held still get one message once bedtime is over", async () => {
  const start: Saved = { mode: "bedtime", since: "2026-11-27T23:00:00.000Z", until: "2026-11-28T07:00:00.000Z", by: "voice", held: 1, bedtimeDay: null };
  const { modes, sent } = setUp({ start });
  await modes.load(at("2026-11-28T08:00:00.000Z"));
  assert.deepEqual(sent, [{ topic: "test-topic", notification: { title: "Held during bedtime: lost in a restart", message: "1 more was held before the API restarted, and is lost.", tags: "zzz" } }]);
});

test("BEDTIME_FROM starts bedtime by the schedule, ending at BEDTIME_UNTIL, once a night", async () => {
  const { modes, saves } = setUp({ settings: { bedtimeFrom: 30, bedtimeUntil: 7 * 60 } });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.tick(at("2026-11-28T00:29:50.000Z"));
  assert.equal(modes.view().mode, "normal");
  await modes.tick(at("2026-11-28T00:30:10.000Z"));
  assert.deepEqual(modes.view(), { mode: "bedtime", since: "2026-11-28T00:30:10.000Z", until: "2026-11-28T07:00:00.000Z", by: "schedule", held: 0 });
  assert.equal(saves.at(-1)?.bedtimeDay, "2026-11-28");
  await modes.set({ mode: "normal", until: null, by: "voice" }, at("2026-11-28T01:00:00.000Z"));
  await modes.tick(at("2026-11-28T01:00:30.000Z"));
  assert.equal(modes.view().mode, "normal", "switched off by hand, it doesn't start again that night");
  await modes.tick(at("2026-11-29T00:30:00.000Z"));
  assert.equal(modes.view().mode, "bedtime", "the next night it starts again");
});

test("BEDTIME_FROM starts bedtime from gaming or coding, but never ends guest or away", async () => {
  for (const mode of ["gaming", "coding"] as const) {
    const { modes } = setUp({ settings: { bedtimeFrom: 30, bedtimeUntil: 7 * 60 } });
    await modes.load(at("2026-11-27T12:00:00.000Z"));
    await modes.set({ mode, until: null, by: "voice" }, at("2026-11-27T22:00:00.000Z"));
    await modes.tick(at("2026-11-28T00:31:00.000Z"));
    assert.equal(modes.view().mode, "bedtime", mode);
  }
  for (const mode of ["guest", "away"] as const) {
    const { modes, logs } = setUp({ settings: { bedtimeFrom: 30, bedtimeUntil: 7 * 60 } });
    await modes.load(at("2026-11-27T12:00:00.000Z"));
    await modes.set({ mode, until: null, by: "typed" }, at("2026-11-27T22:00:00.000Z"));
    await modes.tick(at("2026-11-28T00:31:00.000Z"));
    assert.equal(modes.view().mode, mode);
    assert.ok(logs.some((line) => line.message === "bedtime's start time skipped" && line.fields.mode === mode));
  }
});

test("a restart inside the bedtime window starts bedtime, but not after it was switched off that night", async () => {
  const settings = { bedtimeFrom: 30, bedtimeUntil: 7 * 60 };
  const fresh = setUp({ settings });
  await fresh.modes.load(at("2026-11-28T03:00:00.000Z"));
  assert.equal(fresh.modes.view().mode, "bedtime");
  const start: Saved = { mode: "normal", since: "2026-11-28T01:00:00.000Z", until: null, by: "voice", held: 0, bedtimeDay: "2026-11-28" };
  const after = setUp({ settings, start });
  await after.modes.load(at("2026-11-28T03:00:00.000Z"));
  assert.equal(after.modes.view().mode, "normal");
});

test("without BEDTIME_FROM, bedtime never starts by itself", async () => {
  const { modes } = setUp({ settings: { bedtimeFrom: null, bedtimeUntil: 7 * 60 } });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.tick(at("2026-11-28T03:00:00.000Z"));
  assert.equal(modes.view().mode, "normal");
});

test("a timed switch changes the mode by the schedule, but is skipped while away or guest", async () => {
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  assert.equal(await modes.scheduled("gaming", at("2026-11-27T19:00:00.000Z")), "switched");
  assert.deepEqual(modes.view(), { mode: "gaming", since: "2026-11-27T19:00:00.000Z", until: null, by: "schedule", held: 0 });
  assert.equal(await modes.scheduled("gaming", at("2026-11-27T19:01:00.000Z")), "already");
  await modes.set({ mode: "away", until: null, by: "voice" }, at("2026-11-27T20:00:00.000Z"));
  assert.equal(await modes.scheduled("bedtime", at("2026-11-27T23:00:00.000Z")), "skipped while away");
  assert.equal(modes.view().mode, "away");
  await modes.set({ mode: "guest", until: null, by: "typed" }, at("2026-11-28T10:00:00.000Z"));
  assert.equal(await modes.scheduled("normal", at("2026-11-28T11:00:00.000Z")), "skipped while guest");
  assert.equal(modes.view().mode, "guest");
});

test("the log for a held alert gives its kind and priority, never its words", async () => {
  const { modes, logs } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  modes.take("secret-topic", { title: "Private title", message: "Private words", tags: "hourglass", priority: 4 }, at("2026-11-28T03:00:00.000Z"));
  const line = logs.find((one) => one.message === "phone alert held for bedtime");
  assert.deepEqual(line?.fields, { held: 1, kind: "hourglass", priority: 4 });
  assert.equal(JSON.stringify(logs).includes("Private"), false);
  assert.equal(JSON.stringify(logs).includes("secret-topic"), false);
});

test("londonAt and nextLondon follow London's clock across the change to summer time", () => {
  assert.equal(londonAt("2026-11-28", 420).toISOString(), "2026-11-28T07:00:00.000Z");
  assert.equal(londonAt("2026-07-01", 420).toISOString(), "2026-07-01T06:00:00.000Z");
  assert.equal(londonAt("2026-03-29", 90).toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(nextLondon(at("2026-03-28T23:00:00.000Z"), 420).toISOString(), "2026-03-29T06:00:00.000Z");
  assert.equal(nextLondon(at("2026-11-28T07:00:00.000Z"), 420).toISOString(), "2026-11-29T07:00:00.000Z");
  assert.equal(nextLondon(at("2026-11-28T06:59:59.000Z"), 420).toISOString(), "2026-11-28T07:00:00.000Z");
});

test("readSaved takes only a whole, well-formed saved mode", () => {
  const good: Saved = { mode: "bedtime", since: "2026-11-27T23:00:00.000Z", until: "2026-11-28T07:00:00.000Z", by: "schedule", held: 3, bedtimeDay: "2026-11-28" };
  assert.deepEqual(readSaved(JSON.stringify(good)), good);
  for (const bad of ["", "{", "[]", JSON.stringify({ ...good, mode: "party" }), JSON.stringify({ ...good, by: "jarvis" }), JSON.stringify({ ...good, since: "yesterday" }), JSON.stringify({ ...good, until: 5 }), JSON.stringify({ ...good, held: -1 }), JSON.stringify({ ...good, held: 1.5 }), JSON.stringify({ ...good, bedtimeDay: "today" })]) {
    assert.equal(readSaved(bad), null, bad);
  }
});

test("the file store keeps the mode readable only by the API, and reads back what it saved", async () => {
  const dir = await mkdtemp(join(tmpdir(), "modes-"));
  const store = createModeStore(join(dir, "mode.json"));
  assert.equal(await store.load(), "missing");
  const saved: Saved = { mode: "away", since: "2026-11-27T13:00:00.000Z", until: null, by: "phone", held: 0, bedtimeDay: null };
  await store.save(saved);
  assert.deepEqual(await store.load(), saved);
  assert.equal((await stat(join(dir, "mode.json"))).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(join(dir, "mode.json"), "utf8")), saved);
  await writeFile(join(dir, "mode.json"), "not json");
  assert.equal(await store.load(), null);
});

test("a save that fails is logged and doesn't stop the mode changing", async () => {
  const logs: string[] = [];
  const modes = createModes({
    store: { load: async () => "missing", save: async () => Promise.reject(new Error("disk full")) },
    settings: { bedtimeFrom: null, bedtimeUntil: null },
    topic: "t",
    send: async () => {},
    log: { warn: (_fields, message) => logs.push(message) },
  });
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  await modes.set({ mode: "gaming", until: null, by: "voice" }, at("2026-11-27T13:00:00.000Z"));
  assert.equal(modes.view().mode, "gaming");
  assert.ok(logs.some((message) => message.includes("couldn't be saved")));
});

test("with the hold in place in bedtime, finding the phone and a cancelled train still reach ntfy, and a late train is held", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  const { modes } = setUp();
  await modes.load(at("2026-11-27T12:00:00.000Z"));
  holdWith((topic, notification) => modes.take(topic, notification, new Date()));
  await modes.set({ mode: "bedtime", until: null, by: "voice" }, at("2026-11-27T23:00:00.000Z"));
  await sendToNtfy("test-topic", findNotification);
  await sendToNtfy("test-topic", changeNotification(["The 07:14 is cancelled."], true));
  await sendToNtfy("test-topic", changeNotification(["The 07:14 is 6 minutes late."], false));
  await sendToNtfy("test-topic", alert);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.deepEqual(fetchMock.mock.calls.map((call) => new Headers(call.arguments[1]?.headers).get("Title")), ["Here's your phone", "Train change"]);
  assert.equal(modes.view().held, 2);
});

test("each switch to another mode posts an event saying where it went, where from and how, and a mode kept with a new end posts none", async () => {
  const posted: unknown[] = [];
  const modes = createModes({
    store: memoryStore().store,
    settings: { bedtimeFrom: null, bedtimeUntil: null },
    topic: "test-topic",
    send: async () => {},
    events: { post: (kind, facts, when) => (posted.push([kind, facts, when?.toISOString()]), null) },
  });
  await modes.load(at("2026-11-28T09:00:00.000Z"));
  await modes.set({ mode: "gaming", until: null, by: "voice" }, at("2026-11-28T10:00:00.000Z"));
  await modes.set({ mode: "away", until: at("2026-11-29T10:00:00.000Z"), by: "phone" }, at("2026-11-28T11:00:00.000Z"));
  await modes.set({ mode: "away", until: at("2026-11-30T10:00:00.000Z"), by: "phone" }, at("2026-11-28T12:00:00.000Z"));
  await modes.tick(at("2026-11-30T10:00:30.000Z"));
  assert.deepEqual(posted, [
    ["mode.switched", { to: "gaming", from: "normal", by: "voice" }, "2026-11-28T10:00:00.000Z"],
    ["mode.switched", { to: "away", from: "gaming", by: "phone" }, "2026-11-28T11:00:00.000Z"],
    ["mode.switched", { to: "normal", from: "away", by: "schedule" }, "2026-11-30T10:00:30.000Z"],
  ]);
});
