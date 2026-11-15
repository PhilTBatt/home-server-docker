import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, seconds, summarise } from "./timing.js";

test("summarise gives nothing for no values", () => {
  assert.equal(summarise([]), null);
});

test("summarise of one value", () => {
  assert.deepEqual(summarise([420]), { median: 420, min: 420, max: 420, count: 1 });
});

test("the median of an odd count is the middle value once sorted", () => {
  assert.deepEqual(summarise([900, 100, 500]), { median: 500, min: 100, max: 900, count: 3 });
});

test("the median of an even count is the average of the middle two", () => {
  assert.deepEqual(summarise([400, 100, 300, 200]), { median: 250, min: 100, max: 400, count: 4 });
});

test("summarise doesn't reorder the values it was given", () => {
  const values = [3, 1, 2];
  summarise(values);
  assert.deepEqual(values, [3, 1, 2]);
});

test("one slow outlier doesn't drag the median", () => {
  assert.equal(summarise([500, 520, 510, 9000, 505])?.median, 510);
});

test("seconds shows two decimal places", () => {
  assert.equal(seconds(1234), "1.23 s");
  assert.equal(seconds(0), "0.00 s");
  assert.equal(seconds(25_000), "25.00 s");
});

test("describe says when there's nothing to show", () => {
  assert.equal(describe([]), "no data");
});

test("describe shows a single try without a range", () => {
  assert.equal(describe([800]), "0.80 s");
});

test("describe shows the median, the range and how many tries", () => {
  assert.equal(describe([700, 900, 800]), "0.80 s (0.70 s to 0.90 s, 3 tries)");
});