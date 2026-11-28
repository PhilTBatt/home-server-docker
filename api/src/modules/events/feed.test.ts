import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canSee, checkFacts, createEventFeed, createEventStore, eventKinds, firstSeq, mostPerDay, mostShown, narrower, readEvent, savedLine, titleFor, type EventKind, type EventStore, type Facts } from "./feed.js";

function memoryStore(lines: Record<string, string[]> = {}) {
  const pruned: string[] = [];
  const store: EventStore = {
    load: async (day) => lines[day] ?? "missing",
    append: async (day, line) => void (lines[day] ??= []).push(line),
    prune: async (keep) => {
      pruned.push(keep);
      const old = Object.keys(lines).filter((day) => day !== keep);
      for (const day of old) delete lines[day];
      return old.length;
    },
  };
  return { store, lines, pruned };
}

function logged() {
  const lines: { level: string; message: string; fields: Record<string, unknown> }[] = [];
  return { lines, log: { info: (fields: Record<string, unknown>, message: string) => void lines.push({ level: "info", message, fields }), warn: (fields: Record<string, unknown>, message: string) => void lines.push({ level: "warn", message, fields }) } };
}

const at = (iso: string) => new Date(iso);
const settle = () => new Promise((resolve) => setImmediate(resolve));

const examples: Record<EventKind, Facts> = {
  "hub.started": {},
  "mode.switched": { to: "gaming", from: "normal", by: "voice" },
  "reminder.due": { id: "0000000a", urgent: false, late: false },
  "trains.changed": { count: 2 },
  "phone.rang": {},
  "session.waiting": { name: "docker" },
  "screen.paired": {},
  "projector.switched": { on: true },
};

test("each kind of event has one audience, set here and nowhere else: what anyone in the room may see, the household, or only Phil", () => {
  assert.deepEqual(eventKinds, {
    "hub.started": "home",
    "mode.switched": "room",
    "reminder.due": "home",
    "trains.changed": "home",
    "phone.rang": "room",
    "session.waiting": "owner",
    "screen.paired": "owner",
    "projector.switched": "room",
  });
  assert.deepEqual(Object.keys(examples).sort(), Object.keys(eventKinds).sort());
});

test("who sees what: the room sees only room events, the household sees room and home ones, and Phil sees all", () => {
  assert.deepEqual(
    (["room", "home", "owner"] as const).map((audience) => (["room", "home", "owner"] as const).map((reach) => canSee(audience, reach))),
    [
      [true, true, true],
      [false, true, true],
      [false, false, true],
    ],
  );
  assert.equal(narrower("owner", "room"), "room");
  assert.equal(narrower("room", "owner"), "room");
  assert.equal(narrower("home", "owner"), "home");
});

test("an event's details must be exactly its kind's, as short lowercase words, small counts and yes or no, so no one's words can get into the feed", () => {
  for (const [kind, facts] of Object.entries(examples)) assert.deepEqual(checkFacts(kind as EventKind, facts), facts, kind);
  const refused: [EventKind, Record<string, unknown>][] = [
    ["hub.started", { extra: "x" }],
    ["mode.switched", { to: "gaming", from: "normal" }],
    ["mode.switched", { to: "gaming", from: "normal", by: "voice", extra: true }],
    ["mode.switched", { to: "Gaming", from: "normal", by: "voice" }],
    ["mode.switched", { to: "take the bins out", from: "normal", by: "voice" }],
    ["mode.switched", { to: "a".repeat(41), from: "normal", by: "voice" }],
    ["mode.switched", { to: "-gaming", from: "normal", by: "voice" }],
    ["mode.switched", { to: 3, from: "normal", by: "voice" }],
    ["reminder.due", { id: "0000000a", urgent: "no", late: false }],
    ["trains.changed", { count: -1 }],
    ["trains.changed", { count: 1.5 }],
    ["trains.changed", { count: 1001 }],
    ["trains.changed", { count: "2" }],
    ["session.waiting", { name: "my secret project" }],
    ["projector.switched", { on: 1 }],
  ];
  for (const [kind, facts] of refused) assert.equal(checkFacts(kind, facts), null, `${kind} ${JSON.stringify(facts)}`);
});

test("titles are the hub's own words, made from the details", () => {
  assert.deepEqual(
    Object.entries(examples).map(([kind, facts]) => titleFor(kind as EventKind, facts)),
    ["The hub started", "Mode: Gaming, by voice", "A reminder went off", "2 trains you watch changed", "Your phone was rung", "Claude Code session docker is waiting for you", "A screen was paired with the wall", "The projector came on"],
  );
  assert.equal(titleFor("mode.switched", { to: "bedtime", from: "normal", by: "schedule" }), "Mode: Bedtime, on a timer");
  assert.equal(titleFor("mode.switched", { to: "normal", from: "away", by: "phone" }), "Mode: Normal, from the phone");
  assert.equal(titleFor("mode.switched", { to: "guest", from: "normal", by: "typed" }), "Mode: Guest, typed");
  assert.equal(titleFor("mode.switched", { to: "normal", from: "guest", by: "start" }), "Mode: Normal, as the hub started");
  assert.equal(titleFor("reminder.due", { id: "0000000a", urgent: true, late: true }), "An urgent reminder went off, late");
  assert.equal(titleFor("trains.changed", { count: 1 }), "A train you watch changed");
  assert.equal(titleFor("projector.switched", { on: false }), "The projector went off");
});

test("each event is numbered on from its London day's own start, so a number from another day or before a restart can always be told apart", async () => {
  const { store } = memoryStore();
  const feed = createEventFeed({ store, now: () => at("2026-11-28T09:00:00.000Z") });
  await feed.load();
  const first = feed.post("hub.started");
  const second = feed.post("mode.switched", { to: "gaming", from: "normal", by: "voice" }, at("2026-11-28T09:01:00.000Z"));
  assert.equal(first?.seq, firstSeq("2026-11-28") + 1);
  assert.equal(second?.seq, firstSeq("2026-11-28") + 2);
  assert.equal(firstSeq("2026-11-29") - firstSeq("2026-11-28"), 1_000_000);
  assert.deepEqual(second, { seq: firstSeq("2026-11-28") + 2, at: "2026-11-28T09:01:00.000Z", kind: "mode.switched", audience: "room", title: "Mode: Gaming, by voice", facts: { to: "gaming", from: "normal", by: "voice" } });
});

test("details that don't fit their kind are refused with a log line naming only the kind, and nothing is numbered or saved", async () => {
  const { store, lines } = memoryStore();
  const { lines: logs, log } = logged();
  const feed = createEventFeed({ store, log, now: () => at("2026-11-28T09:00:00.000Z") });
  await feed.load();
  assert.equal(feed.post("session.waiting", { name: "Take the bins out" }), null);
  await settle();
  assert.deepEqual(lines, {});
  assert.deepEqual(logs.filter((line) => line.message !== "events at start"), [{ level: "warn", message: "an event's details didn't fit its kind, so it wasn't kept", fields: { events: { kind: "session.waiting" } } }]);
  assert.equal(feed.post("hub.started")?.seq, firstSeq("2026-11-28") + 1);
});

test("a reader sees only what its reach allows, everything after the number it had, and the whole day when its number is from before", async () => {
  const { store } = memoryStore();
  const feed = createEventFeed({ store, now: () => at("2026-11-28T09:00:00.000Z") });
  await feed.load();
  for (const [kind, facts] of Object.entries(examples)) feed.post(kind as EventKind, facts);
  const kinds = (answer: { events: { kind: string }[] }) => answer.events.map((event) => event.kind);
  assert.deepEqual(kinds(feed.answer(-1, "room")), ["mode.switched", "phone.rang", "projector.switched"]);
  assert.deepEqual(kinds(feed.answer(-1, "home")), ["hub.started", "mode.switched", "reminder.due", "trains.changed", "phone.rang", "projector.switched"]);
  assert.deepEqual(kinds(feed.answer(-1, "owner")), Object.keys(examples));
  const base = firstSeq("2026-11-28");
  const after = feed.answer(base + 5, "owner");
  assert.deepEqual([after.all, kinds(after), after.seq, after.day], [false, ["session.waiting", "screen.paired", "projector.switched"], base + 8, "2026-11-28"]);
  assert.deepEqual([feed.answer(base + 8, "owner").all, feed.answer(base + 8, "owner").events], [false, []]);
  for (const stale of [-1, 0, base, base - 7, firstSeq("2026-11-27") + 40, base + 9, firstSeq("2026-11-29") + 1]) {
    const answer = feed.answer(stale, "owner");
    assert.equal(answer.all, stale !== base, String(stale));
    if (stale !== base) assert.equal(answer.events.length, 8, String(stale));
  }
});

test(`an answer holds at most ${mostShown} events, the latest, and says how many earlier ones it left out`, async () => {
  const { store } = memoryStore();
  const feed = createEventFeed({ store, now: () => at("2026-11-28T09:00:00.000Z") });
  await feed.load();
  for (let i = 0; i < mostShown + 5; i++) feed.post("phone.rang");
  const answer = feed.answer(-1, "room");
  assert.deepEqual([answer.events.length, answer.more, answer.events[0]?.seq], [mostShown, 5, firstSeq("2026-11-28") + 6]);
  const few = feed.answer(-1, "room", 3);
  assert.deepEqual([few.events.map((event) => event.seq), few.more], [[firstSeq("2026-11-28") + mostShown + 3, firstSeq("2026-11-28") + mostShown + 4, firstSeq("2026-11-28") + mostShown + 5], mostShown + 2]);
});

test("a new London day starts the feed again, numbered from that day, and removes the files of every earlier day", async () => {
  const { store, pruned } = memoryStore();
  const { lines: logs, log } = logged();
  let now = at("2026-11-28T23:59:00.000Z");
  const feed = createEventFeed({ store, log, now: () => now });
  await feed.load();
  feed.post("phone.rang");
  now = at("2026-11-29T00:00:30.000Z");
  assert.deepEqual(feed.answer(-1, "owner").events, []);
  assert.equal(feed.answer(-1, "owner").day, "2026-11-29");
  assert.equal(feed.post("phone.rang")?.seq, firstSeq("2026-11-29") + 1);
  await settle();
  assert.deepEqual(pruned, ["2026-11-28", "2026-11-29"], "the start prunes before today, then the new day prunes before it");
  assert.ok(logs.some((line) => line.message === "a new day for the events feed" && JSON.stringify(line.fields) === JSON.stringify({ events: { day: "2026-11-29", was: "2026-11-28", events: 1, refused: 0 } })));
});

test("the day is London's: in summer an event at half past eleven at night, UTC, belongs to the next day", async () => {
  const { store } = memoryStore();
  const feed = createEventFeed({ store, now: () => at("2026-07-01T23:30:00.000Z") });
  await feed.load();
  assert.equal(feed.answer(-1, "owner").day, "2026-07-02");
  assert.equal(feed.post("phone.rang")?.seq, firstSeq("2026-07-02") + 1);
});

test("every event is saved as its number, time, kind and details, one line each, in order, and a restart reads today's back", async () => {
  const { store, lines } = memoryStore();
  const now = () => at("2026-11-28T10:00:00.000Z");
  const feed = createEventFeed({ store, now });
  await feed.load();
  feed.post("mode.switched", { to: "gaming", from: "normal", by: "voice" });
  feed.post("session.waiting", { name: "docker" });
  await settle();
  await settle();
  const base = firstSeq("2026-11-28");
  assert.deepEqual(lines["2026-11-28"], [
    `{"seq":${base + 1},"at":"2026-11-28T10:00:00.000Z","kind":"mode.switched","facts":{"to":"gaming","from":"normal","by":"voice"}}`,
    `{"seq":${base + 2},"at":"2026-11-28T10:00:00.000Z","kind":"session.waiting","facts":{"name":"docker"}}`,
  ]);
  const again = createEventFeed({ store, now });
  await again.load();
  assert.deepEqual(again.answer(-1, "owner").events, feed.answer(-1, "owner").events);
  assert.equal(again.post("phone.rang")?.seq, base + 3);
});

test("a saved line is only taken back if it's exactly an event of that day, with nothing extra, so a damaged or edited file can't widen who sees what", async () => {
  const base = firstSeq("2026-11-28");
  const good = { seq: base + 1, at: "2026-11-28T10:00:00.000Z", kind: "phone.rang", facts: {} };
  const line = (fields: Record<string, unknown>) => JSON.stringify({ ...good, ...fields });
  assert.deepEqual(readEvent(line({}), "2026-11-28"), { ...good, audience: "room", title: "Your phone was rung" });
  const bad = [
    "not json",
    "[]",
    JSON.stringify({ ...good, audience: "room" }),
    JSON.stringify({ ...good, title: "Something else" }),
    line({ seq: base }),
    line({ seq: base + 1_000_000 }),
    line({ seq: base + 1.5 }),
    line({ at: "2026-11-27T10:00:00.000Z" }),
    line({ at: "yesterday" }),
    line({ kind: "door.opened" }),
    line({ kind: "session.waiting", facts: { name: "My Project" } }),
    line({ facts: { extra: 1 } }),
    line({ facts: [] }),
  ];
  for (const one of bad) assert.equal(readEvent(one, "2026-11-28"), null, one);
  const { store } = memoryStore({ "2026-11-28": [line({}), ...bad, line({ seq: base + 3, kind: "screen.paired" }), line({})] });
  const { lines: logs, log } = logged();
  const feed = createEventFeed({ store, log, now: () => at("2026-11-28T11:00:00.000Z") });
  await feed.load();
  assert.deepEqual(feed.answer(-1, "owner").events.map((event) => [event.seq, event.audience]), [
    [base + 1, "room"],
    [base + 3, "owner"],
  ]);
  assert.equal(feed.post("phone.rang")?.seq, base + 4);
  assert.ok(logs.some((one) => one.message === "some of today's saved events couldn't be read and were left out" && JSON.stringify(one.fields) === JSON.stringify({ events: { day: "2026-11-28", bad: bad.length } })));
});

test("a file that can't be read leaves the feed empty, and a save that fails is logged by its number, kind and error code, and the feed carries on", async () => {
  const { lines: logs, log } = logged();
  const broken: EventStore = {
    load: async () => {
      throw Object.assign(new Error("secret path /data/events"), { code: "EACCES" });
    },
    append: async () => {
      throw Object.assign(new Error("disk full at /data"), { code: "ENOSPC" });
    },
    prune: async () => 0,
  };
  const feed = createEventFeed({ store: broken, log, now: () => at("2026-11-28T11:00:00.000Z") });
  await feed.load();
  assert.deepEqual(feed.answer(-1, "owner").events, []);
  const event = feed.post("phone.rang");
  await settle();
  await settle();
  assert.equal(feed.answer(-1, "owner").events.length, 1);
  assert.deepEqual(
    logs.filter((one) => one.level === "warn"),
    [
      { level: "warn", message: "today's events couldn't be read, so the feed starts empty", fields: { events: { day: "2026-11-28", why: "EACCES" } } },
      { level: "warn", message: "an event couldn't be saved, so a restart will forget it", fields: { events: { seq: event?.seq, kind: "phone.rang", why: "ENOSPC" } } },
    ],
  );
  assert.ok(!JSON.stringify(logs).includes("/data"));
});

test(`a day keeps at most ${mostPerDay} events, and says so once`, async () => {
  const { store } = memoryStore();
  const { lines: logs, log } = logged();
  const feed = createEventFeed({ store, log, now: () => at("2026-11-28T11:00:00.000Z") });
  await feed.load();
  for (let i = 0; i < mostPerDay; i++) assert.notEqual(feed.post("phone.rang"), null);
  assert.equal(feed.post("phone.rang"), null);
  assert.equal(feed.post("hub.started"), null);
  assert.equal(logs.filter((one) => one.message.startsWith("the events feed has kept the most")).length, 1);
  assert.equal(feed.answer(-1, "owner", 500).more, mostPerDay - 500);
});

test("the logs say each event's number, kind and audience, never its details", async () => {
  const { store } = memoryStore();
  const { lines: logs, log } = logged();
  const feed = createEventFeed({ store, log, now: () => at("2026-11-28T11:00:00.000Z") });
  await feed.load();
  const event = feed.post("session.waiting", { name: "secretname" });
  assert.deepEqual(logs.at(-1), { level: "info", message: "event", fields: { events: { seq: event?.seq, kind: "session.waiting", audience: "owner" } } });
  assert.ok(!JSON.stringify(logs).includes("secretname"));
});

test("a long poll ends at once when the reader is behind, waits for the next event, and ends when its time is up or it's called off", async () => {
  const { store } = memoryStore();
  const feed = createEventFeed({ store, now: () => at("2026-11-28T11:00:00.000Z") });
  await feed.load();
  const base = firstSeq("2026-11-28");
  feed.post("phone.rang");
  const started = Date.now();
  await feed.waitForChange(-1, 5_000, new AbortController().signal);
  await feed.waitForChange(base, 5_000, new AbortController().signal);
  assert.ok(Date.now() - started < 1_000);
  const waiting = feed.waitForChange(base + 1, 5_000, new AbortController().signal);
  setTimeout(() => feed.post("phone.rang"), 20);
  await waiting;
  assert.equal(feed.answer(base + 1, "room").events.length, 1);
  const timed = Date.now();
  await feed.waitForChange(base + 2, 50, new AbortController().signal);
  assert.ok(Date.now() - timed >= 40);
  const stop = new AbortController();
  const stopped = feed.waitForChange(base + 2, 5_000, stop.signal);
  stop.abort();
  await stopped;
  const already = new AbortController();
  already.abort();
  await feed.waitForChange(base + 2, 5_000, already.signal);
});

test("the file store writes one file per day, readable only by the API, and removes only other days' files", async () => {
  const folder = join(await mkdtemp(join(tmpdir(), "events-")), "events");
  const store = createEventStore(folder);
  assert.equal(await store.load("2026-11-28"), "missing");
  assert.equal(await store.prune("2026-11-28"), 0);
  await store.append("2026-11-28", "one");
  await store.append("2026-11-28", "two");
  assert.deepEqual(await store.load("2026-11-28"), ["one", "two"]);
  assert.equal((await stat(folder)).mode & 0o777, 0o700);
  assert.equal((await stat(join(folder, "2026-11-28.jsonl"))).mode & 0o777, 0o600);
  await store.append("2026-11-27", "old");
  await writeFile(join(folder, "notes.txt"), "keep me");
  assert.equal(await store.prune("2026-11-28"), 1);
  assert.deepEqual((await readdir(folder)).sort(), ["2026-11-28.jsonl", "notes.txt"]);
  assert.equal(await readFile(join(folder, "2026-11-28.jsonl"), "utf8"), "one\ntwo\n");
});

test("a saved line holds no title or audience, which are always worked out again from the kind", async () => {
  const feed = createEventFeed({ store: memoryStore().store, now: () => at("2026-11-28T11:00:00.000Z") });
  await feed.load();
  const event = feed.post("screen.paired");
  assert.ok(event !== null);
  assert.deepEqual(Object.keys(JSON.parse(savedLine(event))), ["seq", "at", "kind", "facts"]);
});

test("events posted before the feed has loaded are held, then kept after today's saved ones with fresh numbers, and saved", { timeout: 5_000 }, async () => {
  const day = "2026-11-28";
  const first = firstSeq(day);
  const { store, lines } = memoryStore({ [day]: [savedLine({ seq: first + 1, at: "2026-11-28T07:00:00.000Z", kind: "hub.started", audience: "home", title: "", facts: {} }), savedLine({ seq: first + 2, at: "2026-11-28T07:30:00.000Z", kind: "phone.rang", audience: "room", title: "", facts: {} })] });
  const { log, lines: logs } = logged();
  const feed = createEventFeed({ store, log, now: () => at("2026-11-28T09:00:00.000Z") });
  assert.equal(feed.post("mode.switched", { to: "normal", from: "bedtime", by: "time" }, at("2026-11-28T08:59:00.000Z")), null, "held, not numbered yet");
  assert.deepEqual(feed.answer(-1, "owner").events, []);
  await feed.load();
  const all = feed.answer(-1, "owner").events;
  assert.deepEqual(all.map((event) => [event.seq - first, event.kind]), [[1, "hub.started"], [2, "phone.rang"], [3, "mode.switched"]]);
  assert.equal(all[2].at, "2026-11-28T08:59:00.000Z", "it keeps the time it happened");
  await settle();
  assert.equal(lines[day].length, 3);
  assert.equal(new Set(lines[day].map((line) => JSON.parse(line).seq)).size, 3, "no number is saved twice");
  assert.ok(logs.some((line) => line.message === "events posted before the feed had loaded were kept after today's saved ones" && line.fields.events !== undefined));
  const again = createEventFeed({ store, now: () => at("2026-11-28T09:05:00.000Z") });
  await again.load();
  assert.deepEqual(again.answer(-1, "owner").events.map((event) => event.kind), ["hub.started", "phone.rang", "mode.switched"], "and it's still there after a restart");
});

test("events posted while the feed is loading are held until it has", { timeout: 5_000 }, async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const day = "2026-11-28";
  const saved = [savedLine({ seq: firstSeq(day) + 1, at: "2026-11-28T07:00:00.000Z", kind: "hub.started", audience: "home", title: "", facts: {} })];
  const store: EventStore = { load: async () => (await gate, saved), append: async () => {}, prune: async () => 0 };
  const feed = createEventFeed({ store, now: () => at("2026-11-28T09:00:00.000Z") });
  const loading = feed.load();
  assert.equal(feed.post("phone.rang"), null);
  release();
  await loading;
  assert.deepEqual(feed.answer(-1, "owner").events.map((event) => [event.seq - firstSeq(day), event.kind]), [[1, "hub.started"], [2, "phone.rang"]]);
});

test("a feed that couldn't read today's file still keeps what was posted while it tried", { timeout: 5_000 }, async () => {
  const store: EventStore = { load: async () => Promise.reject(new Error("unreadable")), append: async () => {}, prune: async () => 0 };
  const feed = createEventFeed({ store, now: () => at("2026-11-28T09:00:00.000Z") });
  feed.post("phone.rang");
  await feed.load();
  assert.deepEqual(feed.answer(-1, "owner").events.map((event) => event.kind), ["phone.rang"]);
});

test("an event given a time on another London day is kept at the time now, so it can't roll the feed back a day", { timeout: 5_000 }, async () => {
  const { store, pruned } = memoryStore();
  const feed = createEventFeed({ store, now: () => at("2026-11-28T09:00:00.000Z") });
  await feed.load();
  feed.post("phone.rang");
  const late = feed.post("phone.rang", {}, at("2026-11-27T23:00:00.000Z"));
  assert.equal(late?.at, "2026-11-28T09:00:00.000Z");
  assert.equal(feed.answer(-1, "owner").events.length, 2, "today's events are all still there");
  assert.ok(!pruned.includes("2026-11-27"));
});

test("a reader asking after midnight wakes the long polls still waiting from the day before, rather than leaving them their full wait", { timeout: 5_000 }, async () => {
  let clock = at("2026-11-28T23:59:59.000Z");
  const feed = createEventFeed({ store: memoryStore().store, now: () => clock });
  const before = feed.answer(-1, "owner").seq;
  const started = Date.now();
  const waiting = feed.waitForChange(before, 4_000, new AbortController().signal);
  clock = at("2026-11-29T00:00:01.000Z");
  feed.answer(-1, "owner");
  await waiting;
  assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms`);
});

test("every long poll's waiter is let go of, however it ends: a change, its time running out, or its reader leaving", { timeout: 5_000 }, async () => {
  const feed = createEventFeed({ store: memoryStore().store, now: () => at("2026-11-28T09:00:00.000Z") });
  await feed.load();
  const seq = feed.answer(-1, "owner").seq;
  const changed = feed.waitForChange(seq, 4_000, new AbortController().signal);
  const timed = feed.waitForChange(seq, 20, new AbortController().signal);
  const leaving = new AbortController();
  const left = feed.waitForChange(seq, 4_000, leaving.signal);
  assert.equal(feed.waiters(), 3);
  await timed;
  assert.equal(feed.waiters(), 2);
  leaving.abort();
  await left;
  assert.equal(feed.waiters(), 1);
  feed.post("phone.rang");
  await changed;
  assert.equal(feed.waiters(), 0);
});

test("a feed that's never loaded keeps nothing, and holds at most a day's worth, saying how many more it couldn't", { timeout: 5_000 }, async () => {
  const { store, lines } = memoryStore();
  const { log, lines: logs } = logged();
  const feed = createEventFeed({ store, log, now: () => at("2026-11-28T09:00:00.000Z") });
  for (let i = 0; i < mostPerDay + 3; i++) assert.equal(feed.post("phone.rang"), null);
  assert.deepEqual(feed.answer(-1, "owner").events, []);
  await settle();
  assert.deepEqual(lines, {}, "nothing is saved before the feed has read today's file");
  await feed.load();
  assert.equal(feed.answer(-1, "owner", 500).events.length + feed.answer(-1, "owner", 500).more, mostPerDay);
  assert.deepEqual(logs.find((line) => line.message === "more events were posted before the feed had loaded than it holds, so the rest weren't kept")?.fields, { events: { dropped: 3, most: mostPerDay } });
});
