// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { todayLines } from "./today.js";

const timeOf = (/** @type {string} */ at) => at.slice(11, 16);

test("today's events are shown newest first, each with its time, and how many earlier ones were left out", () => {
  const reply = { events: [{ at: "2026-11-28T09:00:00.000Z", title: "The hub started" }, { at: "2026-11-28T10:30:00.000Z", title: "Mode: Gaming, by voice" }], more: 0 };
  assert.deepEqual(todayLines(reply, timeOf), ["10:30 Mode: Gaming, by voice", "09:00 The hub started"]);
  assert.deepEqual(todayLines({ ...reply, more: 3 }, timeOf), ["10:30 Mode: Gaming, by voice", "09:00 The hub started", "and 3 earlier"]);
});

test("a day with nothing yet says so", () => {
  assert.deepEqual(todayLines({ events: [], more: 0 }, timeOf), ["Nothing yet today."]);
});

test("a reply that isn't today's events is refused rather than shown in part", () => {
  for (const reply of [null, [], {}, { events: [] }, { events: {}, more: 0 }, { events: [{ at: "soon", title: "x" }], more: 0 }, { events: [{ at: "2026-11-28T09:00:00.000Z" }], more: 0 }, { events: [{ at: "2026-11-28T09:00:00.000Z", title: 3 }], more: 0 }, { events: [], more: "0" }]) {
    assert.equal(todayLines(reply, timeOf), null, JSON.stringify(reply));
  }
});
