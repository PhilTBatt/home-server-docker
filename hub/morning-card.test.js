// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { isMorningView, morningShows } from "./morning-card.js";

/** @type {import("./morning-card.js").MorningView} */
const view = { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 2, upAt: null, by: null, snoozedUntil: null };
const clock = (/** @type {Date} */ at) => at.toISOString().slice(11, 16);

test("the hub's morning is checked before it's used", () => {
  assert.equal(isMorningView(view), true);
  for (const bad of [null, [], "speaking", { ...view, at: "6:45" }, { ...view, speakSlot: "2" }, { ...view, upAt: "soon" }, { ...view, by: "words" }, { ...view, phase: 3 }, { ...view, snoozedUntil: 5 }]) assert.equal(isMorningView(bad), false, JSON.stringify(bad));
});

test("the card only shows from two hours before wake-up time until just after, with I'm up until you are and five more minutes once Jarvis speaks", () => {
  for (const phase of ["none", "skipped", "before", "over", "anything"]) assert.deepEqual(morningShows({ ...view, phase }, clock), { shown: false, line: "", up: false, snooze: false }, phase);
  assert.deepEqual(morningShows({ ...view, phase: "early" }, clock), { shown: true, line: "Wake-up's at 06:45. Up already? Tap I'm up and the morning won't start.", up: true, snooze: false });
  assert.deepEqual(morningShows({ ...view, phase: "brightening" }, clock), { shown: true, line: "The wall's brightening for 06:45.", up: true, snooze: false });
  assert.deepEqual(morningShows({ ...view, phase: "sound" }, clock), { shown: true, line: "Jarvis says morning at 06:45.", up: true, snooze: false });
  assert.deepEqual(morningShows(view, clock), { shown: true, line: "Jarvis is saying morning, louder each time, until you're up.", up: true, snooze: true });
  assert.deepEqual(morningShows({ ...view, phase: "snoozed", snoozedUntil: "2026-11-30T06:57:00.000Z" }, clock), { shown: true, line: "Five more minutes, till 06:57.", up: true, snooze: true });
  assert.deepEqual(morningShows({ ...view, phase: "up", upAt: "2026-11-30T06:52:00.000Z", by: "voice" }, clock), { shown: true, line: "Up at 06:52, by voice.", up: false, snooze: false });
  assert.equal(morningShows({ ...view, phase: "up", upAt: "2026-11-30T06:52:00.000Z", by: "phone" }, clock).line, "Up at 06:52, from the phone.");
});
