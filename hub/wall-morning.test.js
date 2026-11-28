// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { isWallMorning, morningTrainCard, morningView } from "./wall-morning.js";

const at = 6 * 60 + 45;

/**
 * @param {string} phase
 * @param {string | null} [snoozedUntil]
 */
function morning(phase, snoozedUntil = null) {
  return { phase, at: "06:45", snoozedUntil };
}

/** @type {import("./wall-morning.js").MorningTrain} */
const train = { leaves: "07:14", expected: "On time", platform: "2", to: "Midtown", cancelled: false, late: false, inMinutes: 20 };

test("the morning shows only while the wall is waking you, and never from anything it can't read", () => {
  for (const phase of ["none", "skipped", "before", "early", "up", "over", "anything"]) assert.equal(morningView(morning(phase), at, "", null), null, phase);
  for (const bad of [null, undefined, "speaking", {}, { phase: "speaking" }, { phase: "speaking", at: "6:45", snoozedUntil: null }, { phase: "speaking", at: "06:45", snoozedUntil: 5 }]) assert.equal(morningView(bad, at, "", null), null, JSON.stringify(bad));
  assert.equal(isWallMorning(morning("speaking")), true);
  for (const phase of ["brightening", "sound", "speaking", "snoozed"]) assert.notEqual(morningView(morning(phase), at, "", null), null, phase);
});

test("the glow rises over the 15 minutes before wake-up, from a faint start, and stays full after", () => {
  const glow = (/** @type {string} */ phase, /** @type {number} */ now) => morningView(morning(phase), now, "", null)?.glow;
  assert.deepEqual([glow("brightening", at - 15), glow("brightening", at - 7.5), glow("brightening", at - 6), glow("brightening", at + 3)], [0.05, 0.5, 0.6, 1]);
  assert.deepEqual([glow("sound", at - 5), glow("speaking", at), glow("snoozed", at + 10)], [1, 1, 1]);
});

test("the four steps carry their times and show which is happening now", () => {
  const states = (/** @type {string} */ phase, /** @type {number} */ now) => morningView(morning(phase), now, "", null)?.steps.map((step) => step.state).join(" ");
  assert.deepEqual(morningView(morning("brightening"), at - 10, "", null)?.steps.map((step) => [step.time, step.what]), [["06:30", "The wall starts to brighten"], ["06:40", "A soft sound"], ["06:45", "Jarvis says morning"], ["06:47", "Again, louder, every 2 min"]]);
  assert.deepEqual([states("brightening", at - 10), states("sound", at - 3), states("speaking", at), states("speaking", at + 1.9), states("speaking", at + 2), states("snoozed", at + 9)], ["now next next next", "done now next next", "done done now next", "done done now next", "done done done now", "done done done now"]);
});

test("before Jarvis speaks the wall says to use the phone, then to say I'm up or five more minutes, and a snooze says till when", () => {
  const chips = (/** @type {string} */ phase, /** @type {string} */ until = "") => morningView(morning(phase), at, until, null)?.chips.map((chip) => `${chip.tone}: ${chip.text}`);
  assert.deepEqual(chips("brightening"), ["mint: Tap “I'm up” on your phone"]);
  assert.deepEqual(chips("sound"), ["mint: Tap “I'm up” on your phone"]);
  assert.deepEqual(chips("speaking"), ["mint: Say “I'm up”", "plain: or “five more minutes”"]);
  assert.deepEqual(chips("snoozed", "06:57"), ["yellow: Five more minutes, till 06:57", "mint: Say “I'm up”"]);
  assert.equal(morningView(morning("speaking"), at, "", null)?.wake, "Wake-up at 06:45");
});

test("with a train coming the wall says how long until it goes, and not for a cancelled one or one already gone", () => {
  const first = (/** @type {import("./wall-morning.js").MorningTrain} */ one) => morningView(morning("speaking"), at, "", one)?.chips[0].text;
  assert.equal(first(train), "Train in 20 min");
  assert.equal(first({ ...train, cancelled: true }), "Say “I'm up”");
  assert.equal(first({ ...train, inMinutes: null }), "Say “I'm up”");
  assert.equal(first({ ...train, inMinutes: -2 }), "Say “I'm up”");
});

test("the train card gives the time and how it's running, with the change of trains under it when the hub knows it", () => {
  assert.equal(morningTrainCard(null, ""), null);
  assert.deepEqual(morningTrainCard(train, "Change at Midtown: 07:24 to 07:33, platform 15 (9 min)"), { main: "07:14 · on time", sub: "Change at Midtown: 07:24 to 07:33, platform 15 (9 min)", tone: "good" });
  assert.deepEqual(morningTrainCard(train, ""), { main: "07:14 · on time", sub: "Platform 2", tone: "good" });
  assert.deepEqual(morningTrainCard({ ...train, expected: "07:20", late: true, platform: null }, ""), { main: "07:14 · expected 07:20", sub: "", tone: "warm" });
  assert.deepEqual(morningTrainCard({ ...train, expected: "Cancelled", cancelled: true }, "")?.main, "07:14 · cancelled");
  assert.deepEqual(morningTrainCard({ ...train, expected: "Delayed", late: true }, "")?.main, "07:14 · delayed");
});
