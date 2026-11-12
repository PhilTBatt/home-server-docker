import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { currentProblems, parseReconnects, system } from "./routes.js";

function buildApp() {
  const app = Fastify();
  app.register(system, { prefix: "/system" });
  return app;
}

test("parseReconnects returns nothing for an empty log", () => {
  assert.deepEqual(parseReconnects(""), { total: 0, recent: [] });
});

test("parseReconnects splits each line into a time and a message", () => {
  const text = "2026-11-11T21:22:20+00:00 Hub 192.168.0.1 not answering, reconnecting wlp2s0\n";
  assert.deepEqual(parseReconnects(text), {
    total: 1,
    recent: [
      {
        time: "2026-11-11T21:22:20+00:00",
        message: "Hub 192.168.0.1 not answering, reconnecting wlp2s0",
      },
    ],
  });
});

test("parseReconnects puts the newest entry first", () => {
  const text = "2026-11-11T01:00:00+00:00 first\n2026-11-11T02:00:00+00:00 second\n";
  const result = parseReconnects(text);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.recent.map((r) => r.message),
    ["second", "first"],
  );
});

test("parseReconnects ignores blank lines", () => {
  const text = "\n2026-11-11T01:00:00+00:00 first\n\n\n2026-11-11T02:00:00+00:00 second\n\n";
  assert.equal(parseReconnects(text).total, 2);
});

test("parseReconnects counts every entry but returns only the newest 20", () => {
  const lines = Array.from({ length: 25 }, (_, i) => `2026-11-11T00:00:${String(i).padStart(2, "0")}+00:00 entry ${i + 1}`);
  const result = parseReconnects(lines.join("\n") + "\n");
  assert.equal(result.total, 25);
  assert.equal(result.recent.length, 20);
  assert.equal(result.recent[0]?.message, "entry 25");
  assert.equal(result.recent[19]?.message, "entry 6");
});

test("wifi-reconnects answers with an empty list when the log file doesn't exist", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/wifi-reconnects" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { total: 0, recent: [] });
});

test("status returns five sensible numbers", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/status" });
  assert.equal(response.statusCode, 200);
  const status = response.json();
  assert.deepEqual(Object.keys(status).sort(), [
    "diskAvailableGB",
    "diskTotalGB",
    "memoryAvailableMB",
    "memoryTotalMB",
    "uptimeSeconds",
  ]);
  for (const value of Object.values(status)) {
    assert.equal(typeof value, "number");
    assert.ok(Number.isInteger(value));
    assert.ok((value as number) >= 0);
  }
  assert.ok(status.memoryTotalMB > 0);
  assert.ok(status.memoryAvailableMB <= status.memoryTotalMB);
  assert.ok(status.diskTotalGB > 0);
  assert.ok(status.diskAvailableGB <= status.diskTotalGB);
});

test("alerts returns ok and a list of problems that agree with each other", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/alerts" });
  assert.equal(response.statusCode, 200);
  const alerts = response.json();
  assert.deepEqual(Object.keys(alerts).sort(), ["ok", "problems"]);
  assert.equal(typeof alerts.ok, "boolean");
  assert.ok(Array.isArray(alerts.problems));
  assert.equal(alerts.ok, alerts.problems.length === 0);
  for (const problem of alerts.problems) {
    assert.ok(["disk-low", "memory-low", "wifi-reconnects"].includes(problem.code));
    assert.equal(typeof problem.message, "string");
  }
});

test("alerts reports no Wi-Fi problem when the log file doesn't exist", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/alerts" });
  const codes = response.json().problems.map((p: { code: string }) => p.code);
  assert.equal(codes.includes("wifi-reconnects"), false);
});

test("currentProblems returns a list of problems with known codes", async () => {
  const problems = await currentProblems();
  assert.ok(Array.isArray(problems));
  for (const problem of problems) {
    assert.ok(["disk-low", "memory-low", "wifi-reconnects"].includes(problem.code));
  }
});

test("currentProblems agrees with the alerts route", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/alerts" });
  const fromRoute = response.json().problems.map((p: { code: string }) => p.code);
  const direct = (await currentProblems()).map((p) => p.code);
  assert.deepEqual(direct, fromRoute);
});