import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Notification } from "../notify/notifier.js";
import { createExpiryChecker, createSentStore, dateText, daysBetween, expiringLine, readSent, stageFor, statusFor, warningFor, warningLine, warningMostBytes, whenText, writeSent, type ExpiryStatus, type SentStore, type Warned } from "./checker.js";
import type { ExpiryItem } from "./list.js";

const morning = (day: string) => new Date(`${day}T08:00:00Z`);

function status(name: string, date: string, daysLeft: number, note: string | null = null): ExpiryStatus {
  return { name, date, note, daysLeft, overdue: daysLeft < 0 };
}

function memoryStore(start: Map<string, Warned> | null = new Map()) {
  const saved: Map<string, Warned>[] = [];
  let loads = 0;
  let failSave = false;
  const store: SentStore = {
    async load() {
      loads++;
      return start === null ? null : new Map(start);
    },
    async save(sent) {
      if (failSave) throw new Error("Couldn't save the expiry warnings already sent");
      saved.push(new Map(sent));
    },
  };
  return { store, saved, loads: () => loads, failSaves: (fail: boolean) => (failSave = fail) };
}

function checker(items: () => ExpiryItem[], options: { store?: SentStore; failSend?: () => boolean } = {}) {
  const sent: Notification[] = [];
  const problems: (string | null)[] = [];
  const warnings: string[] = [];
  const check = createExpiryChecker({
    load: async () => items(),
    store: options.store ?? memoryStore().store,
    send: async (notification) => {
      if (options.failSend?.()) throw new Error("ntfy replied 500");
      sent.push(notification);
    },
    listProblem: (message) => problems.push(message),
    warn: (message) => warnings.push(message),
  });
  return { check, sent, problems, warnings };
}

test("days between two London days count whole days, across the clocks changing and the year's end", () => {
  assert.equal(daysBetween("2026-11-26", "2026-11-26"), 0);
  assert.equal(daysBetween("2026-11-26", "2026-12-26"), 30);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-11-26", "2026-11-20"), -6);
});

test("each number of days left falls in the stage at or above it, overdue below none, and nothing over 30", () => {
  const expected: [number, number | null][] = [[45, null], [31, null], [30, 30], [15, 30], [14, 14], [8, 14], [7, 7], [4, 7], [3, 3], [2, 3], [1, 1], [0, 0], [-1, -1], [-400, -1]];
  for (const [days, stage] of expected) assert.equal(stageFor(days), stage, String(days));
});

test("items get their days left from today in London, overdue below zero, soonest first and then by name", () => {
  const items: ExpiryItem[] = [
    { name: "Gamma", date: "2026-12-10", note: null },
    { name: "Beta", date: "2026-07-01", note: "Old" },
    { name: "Alpha", date: "2026-12-10", note: null },
  ];
  assert.deepEqual(statusFor(items, new Date("2026-07-01T23:30:00Z")), [
    { name: "Beta", date: "2026-07-01", note: "Old", daysLeft: -1, overdue: true },
    { name: "Alpha", date: "2026-12-10", note: null, daysLeft: 161, overdue: false },
    { name: "Gamma", date: "2026-12-10", note: null, daysLeft: 161, overdue: false },
  ]);
  assert.equal(statusFor([{ name: "Beta", date: "2026-07-01", note: null }], new Date("2026-07-01T22:59:00Z"))[0].overdue, false);
});

test("when it's due is said in plain words", () => {
  assert.deepEqual([12, 2, 1, 0, -1, -2].map(whenText), ["in 12 days", "in 2 days", "tomorrow", "today", "expired yesterday", "expired 2 days ago"]);
  assert.equal(dateText("2026-12-03"), "3 Dec 2026");
  assert.equal(dateText("2027-01-31"), "31 Jan 2027");
});

test("a warning line names the item, when and the date, then its note", () => {
  assert.equal(warningLine(status("Alpha", "2026-12-03", 7)), "Alpha expires in 7 days, on 3 Dec 2026.");
  assert.equal(warningLine(status("Alpha", "2026-11-27", 1)), "Alpha expires tomorrow, on 27 Nov 2026.");
  assert.equal(warningLine(status("Alpha", "2026-11-26", 0)), "Alpha expires today.");
  assert.equal(warningLine(status("Alpha", "2026-11-25", -1)), "Alpha expired yesterday, on 25 Nov 2026.");
  assert.equal(warningLine(status("Alpha", "2026-11-20", -6, "Renew it")), "Alpha expired 6 days ago, on 20 Nov 2026. Note: Renew it");
});

test("one warning is titled by its item, several are counted, and only those a day away or less are high priority", () => {
  assert.deepEqual(warningFor([status("Alpha", "2026-12-03", 7)]), { title: "Home Hub: Alpha expires in 7 days", message: "Alpha expires in 7 days, on 3 Dec 2026.", tags: "hourglass" });
  assert.equal(warningFor([status("Alpha", "2026-11-28", 2)]).priority, undefined);
  assert.deepEqual(warningFor([status("Alpha", "2026-11-27", 1)]), { title: "Home Hub: Alpha expires tomorrow", message: "Alpha expires tomorrow, on 27 Nov 2026.", tags: "hourglass", priority: 4 });
  assert.equal(warningFor([status("Alpha", "2026-11-26", 0)]).title, "Home Hub: Alpha expires today");
  assert.deepEqual(warningFor([status("Alpha", "2026-11-20", -6)]), { title: "Home Hub: Alpha has expired", message: "Alpha expired 6 days ago, on 20 Nov 2026.", tags: "hourglass", priority: 4 });
  assert.deepEqual(warningFor([status("Alpha", "2026-11-25", -1), status("Beta", "2026-12-26", 30)]), {
    title: "Home Hub: 2 expiry reminders",
    message: "Alpha expired yesterday, on 25 Nov 2026.\nBeta expires in 30 days, on 26 Dec 2026.",
    tags: "hourglass",
    priority: 4,
  });
});

test("a warning too long for one ntfy message lists what fits in 3,500 bytes, soonest first, and says how many more there are", () => {
  assert.equal(warningMostBytes, 3_500);
  const due = (count: number, name: string) => Array.from({ length: count }, () => status(name, "2026-12-03", 7));
  const plain = "A".repeat(15);
  assert.equal(Buffer.byteLength(`${warningLine(status(plain, "2026-12-03", 7))}\n`), 50);
  const fits = warningFor(due(70, plain));
  assert.deepEqual([fits.title, fits.message.split("\n").length, fits.message.includes("more")], ["Home Hub: 70 expiry reminders", 70, false]);
  const over = warningFor(due(71, plain));
  assert.deepEqual([over.title, over.message.split("\n").length, over.message.split("\n")[70]], ["Home Hub: 71 expiry reminders", 71, "And 1 more: the hub page lists them all."]);
  const accented = warningFor(due(60, "\u00E9".repeat(15)));
  assert.deepEqual([accented.message.split("\n").length, accented.message.split("\n")[53]], [54, "And 7 more: the hub page lists them all."]);
  const longest = Array.from({ length: 50 }, (_, index) => status(`${String(index).padStart(2, "0")}${"\u4E2D".repeat(38)}`, "2026-11-20", -6, "\u4E2D".repeat(100)));
  const most = warningFor(longest);
  assert.ok(Buffer.byteLength(most.message) < 4_096);
  assert.match(most.message, /^00/);
  assert.match(most.message, /\nAnd \d+ more: the hub page lists them all\.$/);
  assert.equal(most.priority, 4);
});

test("the daily summary's line lists what's within 30 days or overdue, and is left out otherwise", () => {
  assert.equal(expiringLine([]), null);
  assert.equal(expiringLine([status("Alpha", "2026-12-27", 31)]), null);
  assert.equal(expiringLine([status("Beta", "2026-11-25", -1), status("Gamma", "2026-11-26", 0), status("Alpha", "2026-12-26", 30), status("Delta", "2027-12-26", 395)]), "Expiring: Beta expired yesterday, Gamma today, Alpha in 30 days.");
});

test("what was sent is read back as written, and anything damaged or odd in it is dropped", () => {
  const sent = new Map<string, Warned>([["Alpha", { date: "2026-12-03", stage: 7 }], ["Beta", { date: "2026-11-01", stage: -1 }]]);
  assert.deepEqual(readSent(writeSent(sent)), sent);
  assert.equal(writeSent(sent), '{"sent":{"Alpha":{"date":"2026-12-03","stage":7},"Beta":{"date":"2026-11-01","stage":-1}}}');
  for (const text of ["not json", "[]", "{}", '{"sent":[]}', '{"sent":null}']) assert.equal(readSent(text), null, text);
  const odd = { sent: { A: { date: "2026-12-03", stage: 5 }, B: { date: "2026-02-30", stage: 7 }, C: { stage: 7 }, D: "x", E: { date: "2026-12-03", stage: "7" }, F: { date: "2026-12-03", stage: 30 } } };
  assert.deepEqual(readSent(JSON.stringify(odd)), new Map([["F", { date: "2026-12-03", stage: 30 }]]));
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`Item ${index}`, { date: "2026-12-03", stage: 7 }]));
  assert.equal(readSent(JSON.stringify({ sent: many }))?.size, 50);
});

test("the store starts empty with no file, says it couldn't read one it can't, and saves only to its own file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "expiry-"));
  const store = createSentStore(join(dir, "sent.json"));
  assert.deepEqual(await store.load(), new Map());
  await store.save(new Map([["Alpha", { date: "2026-12-03", stage: 7 }]]));
  assert.equal(await readFile(join(dir, "sent.json"), "utf8"), '{"sent":{"Alpha":{"date":"2026-12-03","stage":7}}}');
  assert.equal((await stat(join(dir, "sent.json"))).mode & 0o777, 0o600);
  assert.deepEqual(await store.load(), new Map([["Alpha", { date: "2026-12-03", stage: 7 }]]));
  await writeFile(join(dir, "sent.json"), "damaged");
  assert.equal(await store.load(), null);
  await mkdir(join(dir, "folder.json"));
  assert.equal(await createSentStore(join(dir, "folder.json")).load(), null);
  await assert.rejects(createSentStore(join(dir, "missing", "sent.json")).save(new Map()), { message: "Couldn't save the expiry warnings already sent" });
});

test("nothing is sent, or the store read, before 08:00 in London, even with something due", async () => {
  const memory = memoryStore();
  const { check, sent } = checker(() => [{ name: "Alpha", date: "2026-07-01", note: null }], { store: memory.store });
  assert.equal(await check.run(new Date("2026-11-26T07:59:00Z")), "too early");
  assert.equal(await check.run(new Date("2026-07-01T06:59:00Z")), "too early");
  assert.deepEqual([sent.length, memory.loads()], [0, 0]);
  assert.equal(await check.run(new Date("2026-07-01T07:00:00Z")), "sent");
});

test("from 08:00 it sends one notification for everything due, then nothing more that day", async () => {
  const { check, sent } = checker(() => [
    { name: "Alpha", date: "2026-12-03", note: null },
    { name: "Beta", date: "2026-11-26", note: "Renew it" },
    { name: "Gamma", date: "2027-06-01", note: null },
  ]);
  assert.equal(await check.run(new Date("2026-11-26T08:00:00Z")), "sent");
  assert.deepEqual(sent, [{ title: "Home Hub: 2 expiry reminders", message: "Beta expires today. Note: Renew it\nAlpha expires in 7 days, on 3 Dec 2026.", tags: "hourglass", priority: 4 }]);
  assert.equal(await check.run(new Date("2026-11-26T08:05:00Z")), "nothing due");
  assert.equal(await check.run(new Date("2026-11-26T22:00:00Z")), "nothing due");
  assert.equal(sent.length, 1);
});

test("an item is warned at 30, 14, 7, 3 and 1 days, on the day, and once overdue, and on no day between", async () => {
  const { check, sent } = checker(() => [{ name: "Alpha", date: "2027-01-31", note: null }]);
  const warnedOn: number[] = [];
  for (let day = 0; day < 45; day++) {
    const now = new Date(Date.UTC(2026, 11, 20 + day, 9));
    if ((await check.run(now)) === "sent") warnedOn.push(daysBetween(now.toISOString().slice(0, 10), "2027-01-31"));
  }
  assert.deepEqual(warnedOn, [30, 14, 7, 3, 1, 0, -1]);
  assert.equal(sent.at(-1)?.title, "Home Hub: Alpha has expired");
});

test("an item first seen part way through a stage is warned once for it, with its real days left", async () => {
  const { check, sent } = checker(() => [{ name: "Alpha", date: "2026-12-06", note: null }]);
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  assert.equal(sent[0].message, "Alpha expires in 10 days, on 6 Dec 2026.");
  assert.equal(await check.run(morning("2026-11-27")), "nothing due");
  assert.equal(await check.run(morning("2026-11-29")), "sent");
  assert.equal(sent[1].message, "Alpha expires in 7 days, on 6 Dec 2026.");
});

test("a day it couldn't check is made up the next day with the stage it's in by then", async () => {
  const { check, sent } = checker(() => [{ name: "Alpha", date: "2026-12-26", note: null }]);
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  assert.equal(await check.run(morning("2026-12-14")), "sent");
  assert.equal(sent[1].message, "Alpha expires in 12 days, on 26 Dec 2026.");
});

test("a new date for an item, like after renewing it, starts its warnings again", async () => {
  let date = "2026-11-26";
  const { check, sent } = checker(() => [{ name: "Alpha", date, note: null }]);
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  date = "2027-11-26";
  assert.equal(await check.run(morning("2026-11-27")), "nothing due");
  date = "2026-11-28";
  assert.equal(await check.run(morning("2026-11-27")), "sent");
  assert.equal(sent[1].title, "Home Hub: Alpha expires tomorrow");
});

test("what was sent is saved after each send, and a checker started later doesn't send it again", async () => {
  const memory = memoryStore();
  const items = () => [{ name: "Alpha", date: "2026-12-03", note: null }, { name: "Beta", date: "2027-06-01", note: null }];
  const first = checker(items, { store: memory.store });
  assert.equal(await first.check.run(morning("2026-11-26")), "sent");
  assert.deepEqual(memory.saved, [new Map([["Alpha", { date: "2026-12-03", stage: 7 }]])]);
  const restarted = checker(items, { store: createStoreFrom(memory.saved[0]) });
  assert.equal(await restarted.check.run(morning("2026-11-26")), "nothing due");
  assert.equal(await restarted.check.run(morning("2026-11-30")), "sent");
});

function createStoreFrom(sent: Map<string, Warned>): SentStore {
  return memoryStore(sent).store;
}

test("the store is read once, at the first check from 08:00", async () => {
  const memory = memoryStore();
  const { check } = checker(() => [{ name: "Alpha", date: "2026-12-03", note: null }], { store: memory.store });
  await check.run(morning("2026-11-26"));
  await check.run(morning("2026-11-27"));
  assert.equal(memory.loads(), 1);
});

test("items no longer on the list, or with a new date, are dropped from what's saved, and the rest kept", async () => {
  const memory = memoryStore(new Map([["Gone", { date: "2026-12-01", stage: 7 }], ["Beta", { date: "2026-12-20", stage: 30 }], ["Moved", { date: "2026-12-02", stage: 7 }]]));
  const { check } = checker(() => [{ name: "Alpha", date: "2026-11-27", note: null }, { name: "Beta", date: "2026-12-20", note: null }, { name: "Moved", date: "2027-12-02", note: null }], { store: memory.store });
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  assert.deepEqual(memory.saved[0], new Map([["Alpha", { date: "2026-11-27", stage: 1 }], ["Beta", { date: "2026-12-20", stage: 30 }]]));
});

test("a notification ntfy didn't take isn't counted as sent, and goes at the next check", async () => {
  let failing = true;
  const memory = memoryStore();
  const { check, sent } = checker(() => [{ name: "Alpha", date: "2026-12-03", note: null }], { store: memory.store, failSend: () => failing });
  assert.equal(await check.run(morning("2026-11-26")), "unsent");
  assert.deepEqual(memory.saved, []);
  failing = false;
  assert.equal(await check.run(new Date("2026-11-26T08:05:00Z")), "sent");
  assert.equal(sent.length, 1);
});

test("a save that fails is a problem until one works, and nothing is sent twice meanwhile", async () => {
  const memory = memoryStore();
  memory.failSaves(true);
  let date = "2026-12-03";
  const { check, sent } = checker(() => [{ name: "Alpha", date, note: null }], { store: memory.store });
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  assert.deepEqual(check.problems(), [{ code: "expiry-state", message: "The expiry checker couldn't save which warnings it has sent, so it may send one again after a restart." }]);
  assert.equal(await check.run(morning("2026-11-26")), "nothing due");
  memory.failSaves(false);
  date = "2026-11-26";
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  assert.deepEqual([check.problems(), sent.length], [[], 2]);
});

test("a store that can't be read is warned about once, and the check starts afresh", async () => {
  const { check, sent, warnings } = checker(() => [{ name: "Alpha", date: "2026-12-03", note: null }], { store: memoryStore(null).store });
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  await check.run(morning("2026-11-27"));
  assert.deepEqual(warnings, ["The expiry warnings already sent couldn't be read, so one may be sent again"]);
  assert.equal(sent.length, 1);
});

test("a list with a problem sends nothing, is a problem naming the file, and is reported once until it changes or is fixed", async () => {
  let fail: string | null = "there's no expiry/items.json yet";
  const memory = memoryStore();
  const check = createExpiryChecker({
    load: async () => {
      if (fail !== null) throw new Error(fail);
      return [{ name: "Alpha", date: "2026-12-03", note: null }];
    },
    store: memory.store,
    send: async () => undefined,
    listProblem: (message) => reported.push(message),
  });
  const reported: (string | null)[] = [];
  assert.equal(await check.run(morning("2026-11-26")), "list problem");
  assert.equal(await check.run(new Date("2026-11-26T03:00:00Z")), "list problem");
  assert.deepEqual(check.problems(), [{ code: "expiry-list", message: "The expiry list has a problem: there's no expiry/items.json yet." }]);
  await assert.rejects(check.list(morning("2026-11-26")), { message: "The expiry list has a problem: there's no expiry/items.json yet" });
  fail = "expiry/items.json isn't valid JSON";
  await check.run(morning("2026-11-26"));
  fail = null;
  assert.equal(await check.run(morning("2026-11-26")), "sent");
  await check.run(morning("2026-11-26"));
  assert.deepEqual(reported, ["The expiry list has a problem: there's no expiry/items.json yet", "The expiry list has a problem: expiry/items.json isn't valid JSON", null]);
  assert.deepEqual(check.problems(), []);
  assert.equal(memory.loads(), 1);
});

test("a list that fails with something that isn't an Error still says there's a problem", async () => {
  const check = createExpiryChecker({ load: () => Promise.reject("odd"), store: memoryStore().store, send: async () => undefined });
  await assert.rejects(check.list(morning("2026-11-26")), { message: "The expiry list has a problem: it couldn't be read" });
});

test("a check while one is still running does nothing", async () => {
  let release: () => void = () => undefined;
  let sending: () => void = () => undefined;
  const reachedSend = new Promise<void>((resolve) => (sending = resolve));
  const sent: Notification[] = [];
  const check = createExpiryChecker({
    load: async () => [{ name: "Alpha", date: "2026-12-03", note: null }],
    store: memoryStore().store,
    send: (notification) => new Promise((resolve) => ((release = () => (sent.push(notification), resolve())), sending())),
  });
  const first = check.run(morning("2026-11-26"));
  await reachedSend;
  assert.equal(await check.run(morning("2026-11-26")), "busy");
  release();
  assert.equal(await first, "sent");
  assert.equal(await check.run(morning("2026-11-26")), "nothing due");
  assert.equal(sent.length, 1);
});

test("list gives every item with its days left, soonest first", async () => {
  const { check } = checker(() => [{ name: "Beta", date: "2027-06-01", note: null }, { name: "Alpha", date: "2026-11-20", note: "Old" }]);
  assert.deepEqual(await check.list(morning("2026-11-26")), [status("Alpha", "2026-11-20", -6, "Old"), status("Beta", "2027-06-01", 187)]);
});
