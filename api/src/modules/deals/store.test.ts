import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, emptyMemory, maxSeenPerSearch, readMemory, writeMemory, type Memory } from "./store.js";

const made: string[] = [];

after(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

async function folder() {
  const dir = await mkdtemp(join(tmpdir(), "deals-state-"));
  made.push(dir);
  return dir;
}

const criteria = "0123456789abcdef";
const t1 = "2026-11-18T10:00:00.000Z";
const t2 = "2026-11-18T11:00:00.000Z";
const t3 = "2026-11-18T12:00:00.000Z";

function sample(): Memory {
  const memory = emptyMemory();
  memory.counters = { day: "2026-11-18", calls: 42, alerts: 3, capNoted: false };
  memory.searches.set("optiplex", {
    criteria,
    since: t1,
    checked: t3,
    wide: false,
    known: true,
    seen: new Map([
      ["v1|110000000001|0", { first: t1, last: t3 }],
      ["v1|110000000002|0", { first: t2, last: t3, price: 9500 }],
    ]),
  });
  return memory;
}

test("an empty memory has no searches and zeroed counters", () => {
  assert.deepEqual(emptyMemory(), { searches: new Map(), counters: { day: "", calls: 0, alerts: 0, capNoted: false }, alertsToday: new Map(), snoozed: new Map() });
  assert.notEqual(emptyMemory().searches, emptyMemory().searches);
});

test("with seen listings kept on disk, everything comes back as it was saved", async () => {
  const path = join(await folder(), "state.json");
  const store = createStore(path, true);
  await store.save(sample());
  assert.deepEqual(await store.load(), { memory: sample(), note: null });
});

test("with seen listings kept in memory only, no listing id or price ever reaches the disk", async () => {
  const path = join(await folder(), "state.json");
  await createStore(path, false).save(sample());
  const text = await readFile(path, "utf8");
  assert.ok(!text.includes("110000000001"));
  assert.ok(!text.includes("110000000002"));
  assert.ok(!text.includes("9500"));
  assert.ok(!text.includes("seen"));
  assert.deepEqual(JSON.parse(text), {
    counters: { day: "2026-11-18", calls: 42, alerts: 3, capNoted: false },
    searches: { optiplex: { criteria, since: t1, checked: t3, wide: false } },
  });
});

test("memory-only mode still remembers each search's fingerprint and when it was last checked", async () => {
  const path = join(await folder(), "state.json");
  const store = createStore(path, false);
  await store.save(sample());
  const { memory, note } = await store.load();
  assert.equal(note, null);
  assert.deepEqual(memory.counters, sample().counters);
  assert.deepEqual(memory.searches.get("optiplex"), { criteria, since: t1, checked: t3, wide: false, known: false, seen: new Map() });
});

test("a state file saved in memory-only mode loads as not knowing what was seen, even with disk mode on", async () => {
  const path = join(await folder(), "state.json");
  await createStore(path, false).save(sample());
  const { memory } = await createStore(path, true).load();
  assert.equal(memory.searches.get("optiplex")?.known, false);
  assert.equal(memory.searches.get("optiplex")?.seen.size, 0);
});

test("switching to memory-only ignores seen listings on disk and removes them at the next save", async () => {
  const path = join(await folder(), "state.json");
  await createStore(path, true).save(sample());
  assert.ok((await readFile(path, "utf8")).includes("110000000001"));
  const memoryOnly = createStore(path, false);
  const { memory } = await memoryOnly.load();
  assert.equal(memory.searches.get("optiplex")?.known, false);
  assert.equal(memory.searches.get("optiplex")?.seen.size, 0);
  await memoryOnly.save(memory);
  assert.ok(!(await readFile(path, "utf8")).includes("110000000001"));
});

test("a search whose seen listings aren't known yet is saved without a seen list, so it stays unknown", async () => {
  const path = join(await folder(), "state.json");
  const memory = sample();
  const search = memory.searches.get("optiplex");
  assert.ok(search);
  search.known = false;
  search.seen = new Map();
  const store = createStore(path, true);
  await store.save(memory);
  assert.ok(!(await readFile(path, "utf8")).includes("seen"));
  assert.equal((await store.load()).memory.searches.get("optiplex")?.known, false);
});

test("no state file yet is a quiet fresh start", async () => {
  const path = join(await folder(), "state.json");
  assert.deepEqual(await createStore(path, true).load(), { memory: emptyMemory(), note: null });
  assert.deepEqual(await createStore(path, false).load(), { memory: emptyMemory(), note: null });
});

test("a damaged state file starts fresh, says so, and is kept aside", async () => {
  const dir = await folder();
  const path = join(dir, "state.json");
  for (const text of ["{ not json", "", "[]", "null", '"state"', "{}", '{"searches":{}}', '{"counters":{}}', '{"searches":[],"counters":{}}', '{"searches":{},"counters":7}']) {
    await rm(`${path}.bad`, { force: true });
    await writeFile(path, text);
    const { memory, note } = await createStore(path, true).load();
    assert.deepEqual(memory, emptyMemory(), text);
    assert.equal(note, "The deal watcher's state file was damaged, so every search started fresh. The old file was kept as state.json.bad.");
    assert.deepEqual((await readdir(dir)).sort(), ["state.json.bad"]);
    assert.equal(await readFile(`${path}.bad`, "utf8"), text);
  }
});

test("a second damaged file replaces the first one kept aside", async () => {
  const dir = await folder();
  const path = join(dir, "state.json");
  await writeFile(path, "first");
  await createStore(path, true).load();
  await writeFile(path, "second");
  await createStore(path, true).load();
  assert.equal(await readFile(`${path}.bad`, "utf8"), "second");
});

test("a state file that can't be read at all starts fresh and says so, without the system's own error", async () => {
  const dir = await folder();
  const path = join(dir, "state.json");
  await mkdir(path);
  const { memory, note } = await createStore(path, true).load();
  assert.deepEqual(memory, emptyMemory());
  assert.equal(note, "The deal watcher's state file couldn't be read, so every search started fresh.");
});

test("an enormous state file is treated as damaged, not read into memory", () => {
  assert.equal(readMemory(`{"counters":{},"searches":{},"pad":"${"x".repeat(16 * 1024 * 1024)}"}`, true), null);
});

test("saving replaces the file in one step and leaves no temporary file", async () => {
  const dir = await folder();
  const path = join(dir, "state.json");
  const store = createStore(path, true);
  await store.save(sample());
  const second = sample();
  second.counters.calls = 43;
  await store.save(second);
  assert.deepEqual(await readdir(dir), ["state.json"]);
  assert.equal((await store.load()).memory.counters.calls, 43);
});

test("the state file is readable only by its owner", async () => {
  const path = join(await folder(), "state.json");
  await createStore(path, true).save(sample());
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("a save that fails says so plainly and leaves the last good file alone", async () => {
  const dir = await folder();
  const path = join(dir, "state.json");
  const store = createStore(path, true);
  await store.save(sample());
  await mkdir(`${path}.tmp`);
  const changed = sample();
  changed.counters.calls = 999;
  await assert.rejects(store.save(changed), { message: "Couldn't save the deal watcher's state" });
  assert.equal((await store.load()).memory.counters.calls, 42);
});

test("a save into a folder that isn't there fails with the plain message, not the path", async () => {
  const path = join(await folder(), "missing", "state.json");
  await assert.rejects(createStore(path, true).save(sample()), (error: Error) => error.message === "Couldn't save the deal watcher's state" && !error.message.includes("missing"));
});

function stateWith(searches: Record<string, unknown>, counters: Record<string, unknown> = { day: "2026-11-18", calls: 1, alerts: 1, capNoted: false }) {
  return JSON.stringify({ counters, searches });
}

const goodSearch = { criteria, since: t1, checked: t2, seen: { "v1|1|0": { first: t1, last: t2 } } };

test("a search entry that doesn't look right is dropped on its own, and the rest kept", () => {
  const memory = readMemory(
    stateWith({
      "good": goodSearch,
      "Bad Id": goodSearch,
      "bad-criteria": { ...goodSearch, criteria: "not-a-fingerprint" },
      "long-criteria": { ...goodSearch, criteria: `${criteria}0` },
      "no-since": { ...goodSearch, since: undefined },
      "bad-checked": { ...goodSearch, checked: "yesterday" },
      "number-time": { ...goodSearch, since: 1763460000000 },
      "not-an-object": "optiplex",
      "a-list": [goodSearch],
      ["x".repeat(41)]: goodSearch,
    }),
    true,
  );
  assert.deepEqual([...(memory?.searches.keys() ?? [])], ["good"]);
});

test("a seen entry that doesn't look right is dropped on its own", () => {
  const seen = {
    "v1|1|0": { first: t1, last: t2 },
    "v1|2|0": { first: t1, last: t2, price: 9500 },
    "has space": { first: t1, last: t2 },
    "under_score": { first: t1, last: t2 },
    "line\nbreak": { first: t1, last: t2 },
    "v1|3|0": { first: "never", last: t2 },
    "v1|4|0": { first: t1 },
    "v1|5|0": "seen",
    "v1|6|0": null,
    ["x".repeat(65)]: { first: t1, last: t2 },
  };
  const memory = readMemory(stateWith({ optiplex: { ...goodSearch, seen } }), true);
  assert.deepEqual([...(memory?.searches.get("optiplex")?.seen.keys() ?? [])], ["v1|1|0", "v1|2|0"]);
});

test("a remembered price that isn't a whole number of pence is forgotten, but the listing stays seen", () => {
  for (const price of [95.5, -1, "9500", null, 2_000_000_000, Number.NaN]) {
    const memory = readMemory(stateWith({ optiplex: { ...goodSearch, seen: { "v1|1|0": { first: t1, last: t2, price } } } }), true);
    assert.deepEqual(memory?.searches.get("optiplex")?.seen.get("v1|1|0"), { first: t1, last: t2 });
  }
});

test("times are stored as full UTC times whatever form they were written in", () => {
  const memory = readMemory(stateWith({ optiplex: { criteria, since: "2026-11-18T11:00:00+01:00", checked: "2026-11-18T10:30:00Z", seen: {} } }), true);
  assert.equal(memory?.searches.get("optiplex")?.since, "2026-11-18T10:00:00.000Z");
  assert.equal(memory?.searches.get("optiplex")?.checked, "2026-11-18T10:30:00.000Z");
});

test("a seen list that isn't a group of entries means the search doesn't know what was seen", () => {
  for (const seen of [undefined, null, [], "all", 7]) {
    const memory = readMemory(stateWith({ optiplex: { ...goodSearch, seen } }), true);
    assert.equal(memory?.searches.get("optiplex")?.known, false, JSON.stringify(seen));
  }
  assert.equal(readMemory(stateWith({ optiplex: { ...goodSearch, seen: {} } }), true)?.searches.get("optiplex")?.known, true);
});

test("counters that don't look right start again from zero", () => {
  const zero = { day: "", calls: 0, alerts: 0, capNoted: false };
  assert.deepEqual(readMemory(stateWith({}, { day: "18/11/2026", calls: 5, alerts: 5 }), true)?.counters, zero);
  assert.deepEqual(readMemory(stateWith({}, { calls: 5, alerts: 5 }), true)?.counters, zero);
  assert.deepEqual(readMemory(stateWith({}, { day: "2026-11-18", calls: -5, alerts: 2.5, capNoted: "yes" }), true)?.counters, { day: "2026-11-18", calls: 0, alerts: 0, capNoted: false });
  assert.deepEqual(readMemory(stateWith({}, { day: "2026-11-18", calls: 7, alerts: 2, capNoted: true }), true)?.counters, { day: "2026-11-18", calls: 7, alerts: 2, capNoted: true });
});

test("at most 50 searches are read", () => {
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`s${i}`, goodSearch]));
  assert.equal(readMemory(stateWith(many), true)?.searches.size, 50);
});

test("only the most recently seen listings are kept when a search has too many", () => {
  const seen = Object.fromEntries(
    Array.from({ length: maxSeenPerSearch + 10 }, (_, i) => [`v1|${i}|0`, { first: t1, last: new Date(Date.parse(t1) + i * 1000).toISOString() }]),
  );
  const kept = readMemory(stateWith({ optiplex: { ...goodSearch, seen } }), true)?.searches.get("optiplex")?.seen;
  assert.equal(kept?.size, maxSeenPerSearch);
  assert.equal(kept?.has(`v1|${maxSeenPerSearch + 9}|0`), true);
  assert.equal(kept?.has("v1|10|0"), true);
  assert.equal(kept?.has("v1|9|0"), false);
  assert.equal(kept?.has("v1|0|0"), false);
});

test("odd keys in a state file change nothing outside it", () => {
  const text = '{"__proto__":{"polluted":true},"counters":{"__proto__":{"polluted":true},"day":"2026-11-18"},"searches":{"__proto__":{"polluted":true},"constructor":{"criteria":"0123456789abcdef","since":"2026-11-18T10:00:00.000Z","checked":"2026-11-18T10:00:00.000Z","seen":{"__proto__":{"first":"x"},"toString":{"first":"2026-11-18T10:00:00.000Z","last":"2026-11-18T10:00:00.000Z"}}}}}';
  const memory = readMemory(text, true);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.deepEqual([...(memory?.searches.keys() ?? [])], ["constructor"]);
  assert.deepEqual([...(memory?.searches.get("constructor")?.seen.keys() ?? [])], ["toString"]);
  const again = readMemory(writeMemory(memory ?? emptyMemory(), true), true);
  assert.deepEqual(again, memory);
});

test("what's written is plain JSON that reads back the same", () => {
  assert.deepEqual(readMemory(writeMemory(sample(), true), true), sample());
  assert.deepEqual(JSON.parse(writeMemory(emptyMemory(), true)), { counters: { day: "", calls: 0, alerts: 0, capNoted: false }, searches: {} });
});

test("writing never changes the memory it was given", () => {
  const memory = sample();
  writeMemory(memory, false);
  writeMemory(memory, true);
  assert.deepEqual(memory, sample());
});

test("in memory-only mode a damaged state file is deleted, not kept aside, in case it holds listing ids from disk mode", async () => {
  const dir = await folder();
  const path = join(dir, "state.json");
  await writeFile(path, '{"searches":{"optiplex":{"seen":{"110000000001":{"first":"x"');
  const { memory, note } = await createStore(path, false).load();
  assert.deepEqual(memory, emptyMemory());
  assert.equal(note, "The deal watcher's state file was damaged, so every search started fresh.");
  assert.deepEqual(await readdir(dir), []);
});

test("whether a search's last check saw every result is remembered", async () => {
  const path = join(await folder(), "state.json");
  const memory = sample();
  const search = memory.searches.get("optiplex");
  assert.ok(search);
  search.wide = true;
  for (const keepSeen of [true, false]) {
    const store = createStore(path, keepSeen);
    await store.save(memory);
    assert.equal((await store.load()).memory.searches.get("optiplex")?.wide, true);
  }
  for (const wide of [undefined, "yes", 1, null]) {
    assert.equal(readMemory(stateWith({ optiplex: { ...goodSearch, wide } }), true)?.searches.get("optiplex")?.wide, false);
  }
});

test("a state file as full as the limits allow can still be read back", () => {
  const memory = emptyMemory();
  for (let n = 0; n < 50; n++) {
    const seen = new Map(Array.from({ length: maxSeenPerSearch }, (_, i) => [String(110_000_000_000 + n * 10_000 + i), { first: t1, last: t2, price: 123_456_789 }]));
    memory.searches.set(`search-number-${n}`, { criteria, since: t1, checked: t2, wide: true, known: true, seen });
  }
  const text = writeMemory(memory, true);
  const back = readMemory(text, true);
  assert.equal(back?.searches.size, 50);
  assert.equal(back?.searches.get("search-number-49")?.seen.size, maxSeenPerSearch);
  assert.ok(text.length < 16 * 1024 * 1024, String(text.length));
});

test("snoozes, each search's alerts today and the ending-soon mark come back as saved, in either mode", () => {
  const memory = sample();
  memory.alertsToday.set("optiplex", 4);
  memory.snoozed.set("optiplex", "2026-11-19T12:00:00.000Z");
  memory.snoozed.set("ram", null);
  memory.searches.get("optiplex")?.seen.set("v1|110000000003|0", { first: t1, last: t3, ending: true });
  for (const keepSeen of [true, false]) {
    const back = readMemory(writeMemory(memory, keepSeen), keepSeen);
    assert.deepEqual(back?.alertsToday, new Map([["optiplex", 4]]));
    assert.deepEqual(back?.snoozed, new Map([["optiplex", "2026-11-19T12:00:00.000Z"], ["ram", null]]));
    assert.deepEqual(back?.searches.get("optiplex")?.seen.get("v1|110000000003|0"), keepSeen ? { first: t1, last: t3, ending: true } : undefined);
  }
  assert.ok(!writeMemory(memory, false).includes("110000000003"));
});

test("a state file from before snoozes existed still reads, and an empty memory writes neither new part", () => {
  const old = readMemory(stateWith({ optiplex: goodSearch }), true);
  assert.deepEqual([old?.alertsToday.size, old?.snoozed.size, old?.searches.size], [0, 0, 1]);
  assert.equal(writeMemory(emptyMemory(), true), '{"counters":{"day":"","calls":0,"alerts":0,"capNoted":false},"searches":{}}');
});

test("odd snoozes, counts and marks in the state file are dropped, not trusted", () => {
  const proto = '"__proto__": 5';
  const text = JSON.stringify({
    counters: { day: "2026-11-18", calls: 1, alerts: 1, capNoted: false },
    searches: { optiplex: { ...goodSearch, seen: { "v1|1|0": { first: t1, last: t2, ending: "yes" }, "v1|2|0": { first: t1, last: t2, ending: true } } } },
    alertsToday: { "optiplex": 3, "Bad Id": 2, "ram": -1, "zero": 0, "half": 1.5, "text": "7" },
    snoozed: { "optiplex": "2026-11-19T12:00:00.000Z", "ram": null, "soon": "tomorrow", "number": 5, "Bad Id": null, "flag": true },
  });
  const memory = readMemory(text.replace('"alertsToday":{', `"alertsToday":{${proto}, `).replace('"snoozed":{', `"snoozed":{${proto}, `), true);
  assert.equal(text.includes("__proto__"), false);
  assert.deepEqual(memory?.alertsToday, new Map([["optiplex", 3]]));
  assert.deepEqual(memory?.snoozed, new Map([["optiplex", "2026-11-19T12:00:00.000Z"], ["ram", null]]));
  assert.deepEqual(memory?.searches.get("optiplex")?.seen, new Map([["v1|1|0", { first: t1, last: t2 }], ["v1|2|0", { first: t1, last: t2, ending: true }]]));
  const noDay = readMemory(JSON.stringify({ counters: { day: "yesterday" }, searches: {}, alertsToday: { optiplex: 3 }, snoozed: { optiplex: null } }), true);
  assert.deepEqual([noDay?.alertsToday.size, noDay?.snoozed.size], [0, 1]);
  assert.deepEqual(readMemory(JSON.stringify({ counters: {}, searches: {}, alertsToday: [1, 2], snoozed: "all" }), true), emptyMemory());
});

test("no more snoozes or counts are read than there can be searches", () => {
  const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${i}`, 1]));
  const snoozes = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${i}`, null]));
  const memory = readMemory(JSON.stringify({ counters: { day: "2026-11-18", calls: 0, alerts: 0, capNoted: false }, searches: {}, alertsToday: many, snoozed: snoozes }), true);
  assert.deepEqual([memory?.alertsToday.size, memory?.snoozed.size], [50, 50]);
});