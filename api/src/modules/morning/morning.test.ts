import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { EventKind, Facts } from "../events/feed.js";
import { createMorning, createMorningStore, notSpeakingTime, notWakingTime, readMorningAt, type MorningDay, type MorningStore } from "./morning.js";

const weekdays = ["mon", "tue", "wed", "thu", "fri"];
const monday = (time: string) => new Date(`2026-11-30T${time}:00.000Z`);

function memoryStore(saved: MorningDay | "missing" | null = "missing") {
  const saves: MorningDay[] = [];
  let failing = false;
  const store: MorningStore = {
    load: async () => saved,
    save: async (day) => {
      if (failing) throw new Error("Couldn't save the morning");
      saves.push(day);
    },
  };
  return { store, saves, fail: () => void (failing = true) };
}

function morningWith(options: { at?: number; days?: string[]; mode?: () => string | null; saved?: MorningDay | "missing" | null } = {}) {
  const { store, saves, fail } = memoryStore(options.saved);
  const lines: [string, string, Record<string, unknown>][] = [];
  const posted: [EventKind, Facts | undefined, Date | undefined][] = [];
  const morning = createMorning({
    settings: { at: options.at ?? 6 * 60 + 45, days: options.days ?? weekdays },
    store,
    mode: options.mode,
    log: { info: (fields, message) => void lines.push(["info", message, fields]), warn: (fields, message) => void lines.push(["warn", message, fields]) },
    events: { post: (kind, facts, at) => (posted.push([kind, facts, at]), null) },
  });
  return { morning, saves, fail, lines, posted };
}

test("MORNING_AT is a time from 04:00 to 11:00, written as two digits, a colon and two digits", () => {
  for (const [text, minutes] of [["06:45", 405], ["04:00", 240], ["11:00", 660], ["07:05", 425]] as const) assert.equal(readMorningAt(text), minutes, text);
  for (const text of ["03:59", "11:01", "6:45", "06:60", "24:00", " 06:45", "06:45 ", "0645", "06-45", "", "noon"]) assert.equal(readMorningAt(text), null, text);
});

test("on a weekday the wall brightens from 15 minutes before, a soft sound comes 5 minutes before, then Jarvis speaks every 2 minutes for an hour", () => {
  const { morning } = morningWith();
  const seen = ["04:44", "04:45", "06:29", "06:30", "06:39", "06:40", "06:44", "06:45", "06:46", "06:47", "07:44", "07:45", "11:59"].map((time) => {
    const view = morning.view(monday(time));
    return [time, view.phase, view.speakSlot];
  });
  assert.deepEqual(seen, [
    ["04:44", "before", null],
    ["04:45", "early", null],
    ["06:29", "early", null],
    ["06:30", "brightening", null],
    ["06:39", "brightening", null],
    ["06:40", "sound", null],
    ["06:44", "sound", null],
    ["06:45", "speaking", 0],
    ["06:46", "speaking", 0],
    ["06:47", "speaking", 1],
    ["07:44", "speaking", 29],
    ["07:45", "over", null],
    ["11:59", "over", null],
  ]);
  assert.deepEqual(morning.view(monday("06:50")), { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 2, upAt: null, by: null, snoozedUntil: null });
});

test("the morning goes by London's clock, so in summer it starts an hour earlier in UTC", () => {
  const { morning } = morningWith();
  assert.deepEqual([morning.view(new Date("2026-06-01T05:45:00.000Z")).phase, morning.view(new Date("2026-06-01T06:45:00.000Z")).phase], ["speaking", "over"]);
});

test("there's no morning on a day that isn't in MORNING_DAYS", () => {
  const saturday = new Date("2026-11-28T06:45:00.000Z");
  assert.equal(morningWith().morning.view(saturday).phase, "none");
  assert.equal(morningWith({ days: ["sat"] }).morning.view(saturday).phase, "speaking");
  assert.equal(morningWith({ days: ["sat"] }).morning.view(monday("06:45")).phase, "none");
});

test("away and guest modes skip the morning, and every other mode, bedtime included, keeps it", () => {
  for (const mode of ["away", "guest"]) assert.equal(morningWith({ mode: () => mode }).morning.view(monday("06:45")).phase, "skipped", mode);
  for (const mode of ["normal", "bedtime", "gaming", "coding", null]) assert.equal(morningWith({ mode: () => mode }).morning.view(monday("06:45")).phase, "speaking", String(mode));
});

test("I'm up works from two hours before wake-up time until the morning ends, and is kept and posted once", async () => {
  for (const time of ["00:30", "04:44", "07:45", "11:59"]) {
    const { morning, saves, posted } = morningWith();
    assert.deepEqual(await morning.up("phone", monday(time)), { refused: notWakingTime }, time);
    assert.deepEqual([saves, posted], [[], []]);
  }
  for (const time of ["04:45", "06:29", "06:30", "06:40", "06:45", "07:44"]) {
    const { morning, saves, posted } = morningWith();
    const answer = await morning.up("voice", monday(time));
    assert.ok("done" in answer, time);
    assert.deepEqual([answer.view.phase, answer.view.upAt, answer.view.by], ["up", monday(time).toISOString(), "voice"], time);
    assert.deepEqual(saves, [{ day: "2026-11-30", upAt: monday(time).toISOString(), by: "voice", snoozedUntil: null }]);
    assert.deepEqual(posted, [["morning.up", { by: "voice" }, monday(time)]]);
  }
  const { morning } = morningWith();
  await morning.up("phone", monday("06:50"));
  assert.deepEqual([morning.view(monday("07:44")).phase, morning.view(monday("07:45")).phase], ["up", "over"]);
  assert.equal(morning.view(new Date("2026-12-01T06:45:00.000Z")).phase, "speaking");
  const early = morningWith().morning;
  await early.up("phone", monday("05:50"));
  assert.deepEqual(["06:00", "06:30", "06:45", "07:00", "07:45"].map((time) => early.view(monday(time)).phase), ["up", "up", "up", "up", "over"], "up early, the wall never brightens and Jarvis never says morning that day");
});

test("saying I'm up again changes nothing and posts nothing more", async () => {
  const { morning, saves, posted } = morningWith();
  await morning.up("phone", monday("06:50"));
  const again = await morning.up("voice", monday("06:52"));
  assert.ok("done" in again);
  assert.deepEqual([again.view.upAt, again.view.by, saves.length, posted.length], [monday("06:50").toISOString(), "phone", 1, 1]);
});

test("the morning is skipped and refuses I'm up while away or in guest mode", async () => {
  const { morning, posted } = morningWith({ mode: () => "guest" });
  assert.deepEqual(await morning.up("phone", monday("06:50")), { refused: notWakingTime });
  assert.deepEqual(posted, []);
});

test("five more minutes only works once Jarvis is saying morning, and holds him off for five minutes from when it's said", async () => {
  for (const time of ["05:00", "06:30", "06:40", "07:45"]) assert.deepEqual(await morningWith().morning.snooze("phone", monday(time)), { refused: notSpeakingTime }, time);
  const { morning, saves, posted } = morningWith();
  const answer = await morning.snooze("voice", monday("06:47"));
  assert.ok("done" in answer);
  assert.deepEqual([answer.view.phase, answer.view.speakSlot, answer.view.snoozedUntil, answer.view.by], ["snoozed", null, monday("06:52").toISOString(), null]);
  assert.equal(morning.view(new Date("2026-11-30T06:51:59.000Z")).phase, "snoozed");
  assert.deepEqual([morning.view(monday("06:52")).phase, morning.view(monday("06:52")).speakSlot], ["speaking", 3]);
  const again = await morning.snooze("phone", monday("06:50"));
  assert.ok("done" in again);
  assert.equal(again.view.snoozedUntil, monday("06:55").toISOString());
  assert.deepEqual(saves.map((day) => day.snoozedUntil), [monday("06:52").toISOString(), monday("06:55").toISOString()]);
  assert.deepEqual(posted, []);
  const up = await morning.up("phone", monday("06:51"));
  assert.ok("done" in up);
  assert.deepEqual([up.view.phase, up.view.snoozedUntil, saves.at(-1)?.snoozedUntil], ["up", null, null]);
  assert.deepEqual(await morning.snooze("phone", monday("06:56")), { refused: notSpeakingTime });
});

test("a snooze that runs past the end of the morning ends with it", async () => {
  const { morning } = morningWith();
  await morning.snooze("phone", monday("07:43"));
  assert.deepEqual([morning.view(monday("07:44")).phase, morning.view(monday("07:45")).phase], ["snoozed", "over"]);
});

test("after a restart, today's saved morning carries on, and another day's is ignored", async () => {
  const kept = morningWith({ saved: { day: "2026-11-30", upAt: monday("06:50").toISOString(), by: "phone", snoozedUntil: null } });
  await kept.morning.load(monday("06:55"));
  assert.deepEqual([kept.morning.view(monday("06:55")).phase, kept.morning.view(monday("06:55")).by], ["up", "phone"]);
  assert.deepEqual(kept.lines, [["info", "the morning at start", { morning: { at: "06:45", days: "mon,tue,wed,thu,fri", phase: "up", up: true } }]]);
  const old = morningWith({ saved: { day: "2026-11-27", upAt: "2026-11-27T06:50:00.000Z", by: "phone", snoozedUntil: null } });
  await old.morning.load(monday("06:55"));
  assert.equal(old.morning.view(monday("06:55")).phase, "speaking");
  const snoozed = morningWith({ saved: { day: "2026-11-30", upAt: null, by: null, snoozedUntil: monday("06:58").toISOString() } });
  await snoozed.morning.load(monday("06:55"));
  assert.equal(snoozed.morning.view(monday("06:55")).phase, "snoozed");
});

test("a saved morning that can't be read is warned about and today starts fresh; a missing one is just fresh", async () => {
  const unreadable = morningWith({ saved: null });
  await unreadable.morning.load(monday("06:00"));
  assert.deepEqual(unreadable.lines.map(([level, message]) => [level, message]), [["warn", "the saved morning couldn't be read, so today starts fresh"], ["info", "the morning at start"]]);
  const missing = morningWith();
  await missing.morning.load(monday("06:00"));
  assert.deepEqual(missing.lines.map(([level, message]) => [level, message]), [["info", "the morning at start"]]);
});

test("if the morning can't be saved, it's warned about and still holds until a restart", async () => {
  const { morning, fail, lines } = morningWith();
  fail();
  const answer = await morning.up("phone", monday("06:50"));
  assert.ok("done" in answer);
  assert.equal(morning.view(monday("06:51")).phase, "up");
  assert.deepEqual(lines, [["warn", "the morning couldn't be saved, so a restart today would start it again", { morning: { day: "2026-11-30" } }], ["info", "up for the morning", { morning: { by: "phone", was: "speaking", slot: 2 } }]]);
});

test("the logs hold the phase, slot and who, never anything else", async () => {
  const { morning, lines } = morningWith();
  await morning.snooze("voice", monday("06:47"));
  await morning.up("phone", monday("06:49"));
  assert.deepEqual(lines, [
    ["info", "the morning was put off for five minutes", { morning: { by: "voice", slot: 1 } }],
    ["info", "up for the morning", { morning: { by: "phone", was: "snoozed", slot: null } }],
  ]);
});

test("the store keeps one day in a file only its owner can read, and anything else in it reads as unreadable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "morning-"));
  const path = join(dir, "morning.json");
  const store = createMorningStore(path);
  assert.equal(await store.load(), "missing");
  const day: MorningDay = { day: "2026-11-30", upAt: monday("06:50").toISOString(), by: "voice", snoozedUntil: null };
  await store.save(day);
  assert.deepEqual(await store.load(), day);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), day);
  for (const text of ["not json", "[]", "null", '{"day":"30-11-2026","upAt":null,"by":null,"snoozedUntil":null}', '{"day":"2026-11-30","upAt":"soon","by":null,"snoozedUntil":null}', '{"day":"2026-11-30","upAt":null,"by":"words","snoozedUntil":null}', '{"day":"2026-11-30","upAt":null,"by":null}']) {
    await writeFile(path, text);
    assert.equal(await store.load(), null, text);
  }
});

test("a store that can't write says so without saying where", async () => {
  const store = createMorningStore(join(tmpdir(), "no-such-folder-for-the-morning", "morning.json"));
  await assert.rejects(store.save({ day: "2026-11-30", upAt: null, by: null, snoozedUntil: null }), { message: "Couldn't save the morning" });
});
