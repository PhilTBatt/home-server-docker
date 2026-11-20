import assert from "node:assert/strict";
import { test } from "node:test";
import { createMuteSwitch, missing, readSwitch, switchEveryMs, switchFile, watchSwitch, type Reading } from "./mute.js";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const says = (text: string | null): Reading => ({ text, readable: true });
const unreadable: Reading = { text: null, readable: false };
const gone = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
const denied = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });

test("the switch is the file /switch/mute, read every 200 ms", () => {
  assert.deepEqual([switchFile, switchEveryMs], ["/switch/mute", 200]);
});

test("only the exact words unmuted and an id unmute; anything else, a missing file included, means muted", () => {
  assert.deepEqual(readSwitch("unmuted 1795137045091000000\n"), { muted: false, id: "1795137045091000000" });
  assert.deepEqual(readSwitch("unmuted abc-1.2_3"), { muted: false, id: "abc-1.2_3" });
  assert.deepEqual(readSwitch("unmuted 42\r\n"), { muted: false, id: "42" });
  for (const text of [null, "", "muted", "muted\n", "unmuted", "unmuted ", "Unmuted 1", "unmuted 1 2", " unmuted 1", "unmuted 1\n\n", "unmuted 1\nmuted", "unmuted é", `unmuted ${"1".repeat(65)}`, "on", "0", "false"]) {
    assert.deepEqual(readSwitch(text), { muted: true }, JSON.stringify(text));
  }
});

test("only a missing file counts as a known starting point; any other read error doesn't", () => {
  assert.equal(missing(gone), true);
  for (const error of [denied, new Error("ENOENT"), null, "ENOENT", { code: "EIO" }]) assert.equal(missing(error), false, String(error));
});

test("an unmute already in the file when ears starts doesn't count, so a restart comes back muted", () => {
  const switched = createMuteSwitch(says("unmuted 1\n"));
  assert.equal(switched.saw(says("unmuted 1\n")), null);
  assert.equal(switched.saw(says("unmuted 2\n")), "unmute");
});

test("each unmute id counts once: a new one unmutes, even after a mute or a failure, and an old one coming back doesn't", () => {
  const switched = createMuteSwitch(says(null));
  assert.equal(switched.saw(says(null)), null);
  assert.equal(switched.saw(says("unmuted 1\n")), "unmute");
  assert.equal(switched.saw(says("unmuted 1\n")), null);
  assert.equal(switched.saw(says("unmuted 2\n")), "unmute");
  assert.equal(switched.saw(says("muted\n")), "mute");
  assert.equal(switched.saw(says("muted\n")), null);
  assert.equal(switched.saw(says("unmuted 3\n")), "unmute");
  assert.equal(switched.saw(says(null)), "mute");
  assert.equal(switched.saw(says("garbled")), "mute");
  assert.equal(switched.saw(says("unmuted 3\n")), null, "a read that fails for a moment, then the same unmute, doesn't unmute again");
  assert.equal(switched.saw(unreadable), "mute");
  assert.equal(switched.saw(says("unmuted 2\n")), null);
  assert.equal(switched.saw(says("unmuted 4\n")), "unmute");
});

test("the stale unmute stays stale even if it comes back after a mute", () => {
  const switched = createMuteSwitch(says("unmuted 7\n"));
  assert.equal(switched.saw(says("muted\n")), "mute");
  assert.equal(switched.saw(says("unmuted 7\n")), null);
  assert.equal(switched.saw(says("unmuted 8\n")), "unmute");
});

test("starting muted, or with no file at all, the first unmute counts", () => {
  assert.equal(createMuteSwitch(says("muted\n")).saw(says("unmuted 1\n")), "unmute");
  assert.equal(createMuteSwitch(says(null)).saw(says("unmuted 1\n")), "unmute");
});

test("if the switch couldn't be read at the start, whatever it first says once it can be read counts as old", () => {
  const switched = createMuteSwitch(unreadable);
  assert.equal(switched.saw(unreadable), null);
  assert.equal(switched.saw(says("unmuted 1\n")), null, "an unmute that may have been there before ears started");
  assert.equal(switched.saw(says("unmuted 2\n")), "unmute");
  const thenGone = createMuteSwitch(unreadable);
  assert.equal(thenGone.saw(says(null)), null);
  assert.equal(thenGone.saw(says("unmuted 1\n")), "unmute");
});

test("watching reads the file now and then every interval, and says only when it changes", async () => {
  let text = "unmuted 1\n";
  const heard: string[] = [];
  const watch = await watchSwitch({ read: async () => text, everyMs: 10, onMute: () => heard.push("mute"), onUnmute: () => heard.push("unmute") });
  await pause(50);
  assert.deepEqual(heard, []);
  text = "unmuted 2\n";
  await pause(50);
  assert.deepEqual(heard, ["unmute"]);
  text = "muted\n";
  await pause(50);
  assert.deepEqual(heard, ["unmute", "mute"]);
  watch.stop();
  text = "unmuted 3\n";
  await pause(50);
  assert.deepEqual(heard, ["unmute", "mute"]);
});

test("a file that can't be read counts as muted, the same unmute after it doesn't count again, and reading never overlaps itself", async () => {
  let reads = 0;
  let fail = false;
  let slow = false;
  const heard: string[] = [];
  const watch = await watchSwitch({
    read: async () => {
      reads++;
      if (slow) await pause(80);
      if (fail) throw denied;
      return "unmuted 9\n";
    },
    everyMs: 10,
    onMute: () => heard.push("mute"),
    onUnmute: () => heard.push("unmute"),
  });
  fail = true;
  await pause(40);
  assert.deepEqual(heard, ["mute"]);
  fail = false;
  slow = true;
  const before = reads;
  await pause(200);
  assert.ok(reads - before <= 3, `${reads - before} reads in 200 ms with each taking 80 ms`);
  assert.deepEqual(heard, ["mute"]);
  watch.stop();
});

test("a change read after the watch was stopped isn't reported", async () => {
  let text = "muted\n";
  let release: () => void = () => {};
  let hold = false;
  const heard: string[] = [];
  const watch = await watchSwitch({
    read: async () => {
      if (hold) await new Promise<void>((resolve) => (release = resolve));
      return text;
    },
    everyMs: 10,
    onMute: () => heard.push("mute"),
    onUnmute: () => heard.push("unmute"),
  });
  hold = true;
  await pause(30);
  text = "unmuted 5\n";
  watch.stop();
  release();
  await pause(30);
  assert.deepEqual(heard, []);
});

test("with no file at the start, the first unmute after it counts", async () => {
  let text: string | null = null;
  const heard: string[] = [];
  const watch = await watchSwitch({
    read: async () => {
      if (text === null) throw gone;
      return text;
    },
    everyMs: 10,
    onMute: () => heard.push("mute"),
    onUnmute: () => heard.push("unmute"),
  });
  text = "unmuted 1\n";
  await pause(50);
  assert.deepEqual(heard, ["unmute"]);
  watch.stop();
});

test("with a file that couldn't be read at the start, the unmute already in it doesn't count once it can be read", async () => {
  let blocked = true;
  let text = "unmuted 1\n";
  const heard: string[] = [];
  const watch = await watchSwitch({
    read: async () => {
      if (blocked) throw denied;
      return text;
    },
    everyMs: 10,
    onMute: () => heard.push("mute"),
    onUnmute: () => heard.push("unmute"),
  });
  await pause(40);
  blocked = false;
  await pause(50);
  assert.deepEqual(heard, []);
  text = "unmuted 2\n";
  await pause(50);
  assert.deepEqual(heard, ["unmute"]);
  watch.stop();
});
