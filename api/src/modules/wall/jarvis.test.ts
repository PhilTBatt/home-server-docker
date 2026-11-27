import assert from "node:assert/strict";
import { test } from "node:test";
import { activities, createJarvisDesk, mostHeardChars, mostSaidChars, readReport, runningMs, wordsKeptMs, type JarvisReport } from "./jarvis.js";

const quiet: JarvisReport = { activity: "waiting", muted: false, heard: null, said: null };

test("a report is read when it has every part right", () => {
  assert.deepEqual(readReport({ activity: "speaking", muted: false, heard: { text: "what's on tomorrow", voice: "owner", slot: null }, said: "Bins go out tonight." }), { activity: "speaking", muted: false, heard: { text: "what's on tomorrow", voice: "owner", slot: null }, said: "Bins go out tonight." });
});

test("every activity is allowed, and nothing else", () => {
  for (const activity of activities) assert.equal((readReport({ ...quiet, activity }) as JarvisReport).activity, activity);
  for (const activity of ["idle", "Speaking", "", null, 3]) assert.deepEqual(readReport({ ...quiet, activity }), { refused: `activity must be one of ${activities.join(", ")}` });
});

test("muted, heard and said can be left out, and count as unknown or nothing", () => {
  assert.deepEqual(readReport({ activity: "waiting" }), { activity: "waiting", muted: null, heard: null, said: null });
});

test("anything that isn't an object, or has other fields, is refused", () => {
  for (const body of [null, "waiting", [], 1]) assert.deepEqual(readReport(body), { refused: "Send a JSON object with activity, muted, heard and said" });
  assert.deepEqual(readReport({ ...quiet, words: "hi" }), { refused: "Only activity, muted, heard, said are allowed" });
  assert.deepEqual(readReport({ ...quiet, heard: { text: "hi", voice: null, slot: null, who: "pat" } }), { refused: "heard must be null or an object with text, voice and slot" });
});

test("muted must be true, false or null", () => {
  assert.deepEqual(readReport({ ...quiet, muted: "yes" }), { refused: "muted must be true, false or null" });
  assert.equal((readReport({ ...quiet, muted: null }) as JarvisReport).muted, null);
  assert.equal((readReport({ ...quiet, muted: true }) as JarvisReport).muted, true);
});

test("what was heard needs words, a known voice and a slot only for another voice", () => {
  assert.deepEqual(readReport({ ...quiet, heard: { text: "  ", voice: null, slot: null } }), { refused: "heard.text must be what was heard" });
  assert.deepEqual(readReport({ ...quiet, heard: { text: "hi", voice: "pat", slot: null } }), { refused: "heard.voice must be null or one of owner, other, unknown" });
  assert.deepEqual(readReport({ ...quiet, heard: { text: "hi", voice: "other", slot: 5 } }), { refused: "heard.slot must be null or a whole number from 0 to 4" });
  assert.deepEqual(readReport({ ...quiet, heard: { text: "hi", voice: "other", slot: 1.5 } }), { refused: "heard.slot must be null or a whole number from 0 to 4" });
  assert.deepEqual(readReport({ ...quiet, heard: { text: "hi", voice: "owner", slot: 2 } }), { refused: "heard.slot is only for another known voice" });
  assert.deepEqual((readReport({ ...quiet, heard: { text: "hi", voice: "other", slot: 4 } }) as JarvisReport).heard, { text: "hi", voice: "other", slot: 4 });
  assert.deepEqual((readReport({ ...quiet, heard: { text: "hi" } }) as JarvisReport).heard, { text: "hi", voice: null, slot: null });
});

test("words are tidied and cut to their limits", () => {
  const report = readReport({ ...quiet, heard: { text: `a\u0007b${"x".repeat(400)}`, voice: null, slot: null }, said: `one\r\ntwo${"y".repeat(700)}` }) as JarvisReport;
  assert.equal(report.heard?.text.length, mostHeardChars);
  assert.ok(report.heard?.text.startsWith("a b"));
  assert.equal(report.said?.length, mostSaidChars);
  assert.ok(report.said?.startsWith("one\ntwo"));
  assert.equal((readReport({ ...quiet, said: "   " }) as JarvisReport).said, null);
  assert.deepEqual(readReport({ ...quiet, said: 5 }), { refused: "said must be null or Jarvis's words" });
});

test("before Jarvis reports, the desk says he isn't running", () => {
  assert.deepEqual(createJarvisDesk().view(1000), { seq: 0, running: false, activity: "waiting", muted: null, heard: null, said: null, saidAgeMs: null });
});

test("a report is shown with how long ago the words came, and moves seq on", () => {
  const desk = createJarvisDesk();
  assert.equal(desk.report({ activity: "thinking", muted: false, heard: { text: "hi", voice: "other", slot: 2 }, said: null }, 1000), 1);
  assert.deepEqual(desk.view(1500), { seq: 1, running: true, activity: "thinking", muted: false, heard: { text: "hi", voice: "other", slot: 2, ageMs: 500 }, said: null, saidAgeMs: null });
});

test("the same report again keeps seq and the words' ages, so a heartbeat wakes nobody", () => {
  const desk = createJarvisDesk();
  const report: JarvisReport = { activity: "speaking", muted: false, heard: { text: "hi", voice: null, slot: null }, said: "Hello." };
  desk.report(report, 1000);
  assert.equal(desk.report({ ...report, heard: { text: "hi", voice: null, slot: null } }, 21_000), 1);
  const view = desk.view(21_000);
  assert.equal(view.heard?.ageMs, 20_000);
  assert.equal(view.saidAgeMs, 20_000);
});

test("growing words count as new, and their age starts again", () => {
  const desk = createJarvisDesk();
  desk.report({ ...quiet, activity: "speaking", said: "Hello." }, 1000);
  assert.equal(desk.report({ ...quiet, activity: "speaking", said: "Hello. Bins tonight." }, 2000), 2);
  assert.equal(desk.view(2500).saidAgeMs, 500);
});

test("words are forgotten a minute after they came, even while the same words keep being sent", () => {
  const desk = createJarvisDesk();
  desk.report({ ...quiet, heard: { text: "hi", voice: null, slot: null }, said: "Hello." }, 1000);
  desk.report({ ...quiet, heard: { text: "hi", voice: null, slot: null }, said: "Hello." }, 1000 + wordsKeptMs - 1);
  assert.notEqual(desk.view(1000 + wordsKeptMs).heard, null);
  const later = desk.view(1001 + wordsKeptMs);
  assert.deepEqual([later.heard, later.said, later.saidAgeMs], [null, null, null]);
});

test("words forgotten aren't brought back by a heartbeat holding the same words", () => {
  const desk = createJarvisDesk();
  const heard = { text: "hi", voice: null, slot: null };
  desk.report({ ...quiet, heard, said: "Hello." }, 1000);
  assert.equal(desk.view(2000 + wordsKeptMs).said, null);
  desk.report({ ...quiet, heard, said: "Hello." }, 3000 + wordsKeptMs);
  const view = desk.view(3000 + wordsKeptMs);
  assert.deepEqual([view.heard, view.said], [null, null]);
});

test("the same words can be shown again once something else came between", () => {
  const desk = createJarvisDesk();
  desk.report({ ...quiet, said: "Hello." }, 1000);
  desk.view(2000 + wordsKeptMs);
  desk.report({ ...quiet, said: null }, 3000 + wordsKeptMs);
  desk.report({ ...quiet, said: "Hello." }, 4000 + wordsKeptMs);
  assert.deepEqual([desk.view(4000 + wordsKeptMs).said, desk.view(4000 + wordsKeptMs).saidAgeMs], ["Hello.", 0]);
});

test("new words after forgotten ones are shown", () => {
  const desk = createJarvisDesk();
  desk.report({ ...quiet, said: "Hello." }, 1000);
  desk.view(2000 + wordsKeptMs);
  desk.report({ ...quiet, said: "Bins tonight." }, 3000 + wordsKeptMs);
  assert.equal(desk.view(3000 + wordsKeptMs).said, "Bins tonight.");
});

test("with no report for a while he counts as not running, and his state is dropped", () => {
  const desk = createJarvisDesk();
  desk.report({ activity: "speaking", muted: true, heard: { text: "hi", voice: null, slot: null }, said: "Hi." }, 1000);
  assert.equal(desk.view(1000 + runningMs).running, true);
  assert.deepEqual(desk.view(1001 + runningMs), { seq: 2, running: false, activity: "waiting", muted: null, heard: null, said: null, saidAgeMs: null });
  assert.equal(desk.view(5000 + runningMs).seq, 2);
  assert.equal(desk.report({ ...quiet }, 6000 + runningMs), 3);
});

test("waiting ends at once when seq has moved, and when a report comes", async () => {
  const desk = createJarvisDesk();
  const never = new AbortController().signal;
  desk.report(quiet, 1000);
  await desk.waitForChange(0, 60_000, never);
  let woke = false;
  const waiting = desk.waitForChange(1, 60_000, never).then(() => (woke = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(woke, false);
  desk.report(quiet, 2000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(woke, false);
  desk.report({ ...quiet, activity: "listening" }, 3000);
  await waiting;
  assert.equal(woke, true);
});

test("waiting ends after its time, or when called off", async () => {
  const desk = createJarvisDesk();
  const began = Date.now();
  await desk.waitForChange(0, 30, new AbortController().signal);
  assert.ok(Date.now() - began >= 25);
  const stop = new AbortController();
  const waiting = desk.waitForChange(0, 60_000, stop.signal);
  stop.abort();
  await waiting;
  stop.abort();
  await desk.waitForChange(0, 60_000, stop.signal);
});
