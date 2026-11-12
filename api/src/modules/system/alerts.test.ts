import assert from "node:assert/strict";
import { test } from "node:test";
import { findProblems, type Status } from "./alerts.js";

const now = new Date("2026-11-12T12:00:00Z");

const healthy: Status = {
  uptimeSeconds: 273600,
  memoryTotalMB: 8000,
  memoryAvailableMB: 3000,
  diskTotalGB: 230,
  diskAvailableGB: 180,
};

test("a healthy server has no problems", () => {
  assert.deepEqual(findProblems(healthy, [], now), []);
});

test("disk under 10% free is a problem", () => {
  const problems = findProblems({ ...healthy, diskAvailableGB: 22 }, [], now);
  assert.deepEqual(problems, [{ code: "disk-low", message: "Disk is low: 22 of 230 GB free." }]);
});

test("disk at exactly 10% free is not a problem", () => {
  assert.deepEqual(findProblems({ ...healthy, diskAvailableGB: 23 }, [], now), []);
});

test("a full disk is a problem", () => {
  const problems = findProblems({ ...healthy, diskAvailableGB: 0 }, [], now);
  assert.deepEqual(problems.map((p) => p.code), ["disk-low"]);
});

test("memory under 10% available is a problem", () => {
  const problems = findProblems({ ...healthy, memoryAvailableMB: 799 }, [], now);
  assert.deepEqual(problems, [
    { code: "memory-low", message: "Memory is low: 799 of 8000 MB available." },
  ]);
});

test("memory at exactly 10% available is not a problem", () => {
  assert.deepEqual(findProblems({ ...healthy, memoryAvailableMB: 800 }, [], now), []);
});

test("one reconnect in the last 24 hours is a problem, worded in the singular", () => {
  const problems = findProblems(healthy, ["2026-11-12T11:00:00+00:00"], now);
  assert.deepEqual(problems, [
    { code: "wifi-reconnects", message: "Wi-Fi reconnected 1 time in the last 24 hours." },
  ]);
});

test("several reconnects are counted and worded in the plural", () => {
  const times = ["2026-11-12T11:00:00+00:00", "2026-11-12T03:14:07+00:00", "2026-11-11T20:00:00+00:00"];
  const problems = findProblems(healthy, times, now);
  assert.deepEqual(problems, [
    { code: "wifi-reconnects", message: "Wi-Fi reconnected 3 times in the last 24 hours." },
  ]);
});

test("reconnects older than 24 hours are ignored", () => {
  const times = ["2026-11-11T11:59:59+00:00", "2026-11-10T08:00:00+00:00"];
  assert.deepEqual(findProblems(healthy, times, now), []);
});

test("a reconnect exactly 24 hours ago still counts", () => {
  const problems = findProblems(healthy, ["2026-11-11T12:00:00+00:00"], now);
  assert.deepEqual(problems.map((p) => p.code), ["wifi-reconnects"]);
});

test("only the reconnects inside the last 24 hours are counted", () => {
  const times = ["2026-11-12T11:00:00+00:00", "2026-11-10T08:00:00+00:00"];
  const problems = findProblems(healthy, times, now);
  assert.equal(problems[0]?.message, "Wi-Fi reconnected 1 time in the last 24 hours.");
});

test("times in another timezone are compared correctly", () => {
  const problems = findProblems(healthy, ["2026-11-11T13:30:00+01:00"], now);
  assert.deepEqual(problems.map((p) => p.code), ["wifi-reconnects"]);
});

test("a time that can't be read is ignored", () => {
  assert.deepEqual(findProblems(healthy, ["not-a-time", ""], now), []);
});

test("every problem is reported together, in a fixed order", () => {
  const problems = findProblems(
    { ...healthy, diskAvailableGB: 5, memoryAvailableMB: 100 },
    ["2026-11-12T11:00:00+00:00"],
    now,
  );
  assert.deepEqual(problems.map((p) => p.code), ["disk-low", "memory-low", "wifi-reconnects"]);
});

test("the status passed in is left unchanged", () => {
  const status = { ...healthy, diskAvailableGB: 5 };
  const copy = { ...status };
  findProblems(status, [], now);
  assert.deepEqual(status, copy);
});