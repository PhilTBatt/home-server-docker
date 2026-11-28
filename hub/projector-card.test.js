// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { isProjectorView, powerLine, projectorLine, projectorShows } from "./projector-card.js";

/** @type {import("./projector-card.js").ProjectorView} */
const paired = { paired: true, pairedAt: "2026-11-28T09:00:00.000Z", busy: null, on: null, onSeenAt: null, problem: null };
const timeOf = (/** @type {string} */ at) => at.slice(11, 16);

test("only the hub's own shape of answer is shown", () => {
  assert.ok(isProjectorView(paired));
  assert.ok(isProjectorView({ ...paired, busy: "code", on: true, onSeenAt: "2026-11-28T10:00:00.000Z" }));
  for (const bad of [null, [], { ...paired, busy: "connected" }, { ...paired, on: "yes" }, { ...paired, onSeenAt: "soon" }, { ...paired, problem: 3 }, { ...paired, paired: "yes" }]) assert.equal(isProjectorView(bad), false, JSON.stringify(bad));
});

test("the card says what the hub is doing, then any problem, then whether it was on when the hub last heard", () => {
  assert.equal(projectorLine({ ...paired, busy: "asking" }, timeOf), "Asking the projector for a code...");
  assert.equal(projectorLine({ ...paired, busy: "code" }, timeOf), "Type the code the projector shows.");
  assert.equal(projectorLine({ ...paired, busy: "sending" }, timeOf), "Sending...");
  assert.equal(projectorLine({ ...paired, paired: false }, timeOf), "Not paired with the hub yet.");
  assert.equal(projectorLine({ ...paired, problem: "The hub couldn't reach the projector, so nothing was sent", on: true, onSeenAt: "2026-11-28T10:00:00.000Z" }, timeOf), "The hub couldn't reach the projector, so nothing was sent.");
  assert.equal(projectorLine(paired, timeOf), "Paired. Whether it's on shows after the first press.");
  assert.equal(projectorLine({ ...paired, on: true, onSeenAt: "2026-11-28T10:00:00.000Z" }, timeOf), "On, when the hub last heard at 10:00.");
  assert.equal(projectorLine({ ...paired, on: false, onSeenAt: "2026-11-28T10:05:00.000Z" }, timeOf), "Off, or asleep, when the hub last heard at 10:05.");
});

test("the buttons fit what's going on, and the card checks again soon while the hub is busy", () => {
  assert.deepEqual(projectorShows({ ...paired, paired: false }), { power: false, pair: true, code: false, forget: false, pairWords: "Pair", checkAgain: false });
  assert.deepEqual(projectorShows(paired), { power: true, pair: true, code: false, forget: true, pairWords: "Pair again", checkAgain: false });
  assert.deepEqual(projectorShows({ ...paired, busy: "asking" }), { power: false, pair: false, code: false, forget: false, pairWords: "Pair again", checkAgain: true });
  assert.deepEqual(projectorShows({ ...paired, busy: "code" }), { power: false, pair: false, code: true, forget: false, pairWords: "Pair again", checkAgain: true });
  assert.deepEqual(projectorShows({ ...paired, busy: "sending" }), { power: true, pair: true, code: false, forget: true, pairWords: "Pair again", checkAgain: true });
});

test("after a press, the card says what the projector itself said, and only claims it worked when it did", () => {
  assert.equal(powerLine(true, { sent: true, was: false, on: true }), "It's on.");
  assert.equal(powerLine(false, { sent: true, was: true, on: false }), "It's off.");
  assert.equal(powerLine(true, { sent: true, was: null, on: null }), "Sent, but the projector didn't say it's on, so it may not have got it.");
  assert.equal(powerLine(false, { sent: true, was: null, on: null }), "Sent, but the projector didn't say it's off, so it may not have got it.");
  assert.equal(powerLine(true, { sent: false, on: true }), "It's already on.");
  assert.equal(powerLine(true, { sent: true, was: null, on: false }), "Sent, but the projector says it's still off.");
  assert.equal(powerLine(false, { sent: true, was: null, on: true }), "Sent, but the projector says it's still on.");
});
