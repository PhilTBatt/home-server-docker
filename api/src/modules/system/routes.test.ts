import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { currentProblems, parseReconnects, system } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true };

function buildApp(features = allOn, backupDir = join(tmpdir(), "no-such-backup-status-here")) {
  const app = Fastify();
  app.register(system, { prefix: "/system", features, backupDir });
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

test("features returns the switches it's given", async () => {
  const allOnResponse = await buildApp().inject({ method: "GET", url: "/system/features" });
  assert.equal(allOnResponse.statusCode, 200);
  assert.deepEqual(allOnResponse.json(), { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true });
  const mixed = { alerts: false, heartbeat: true, dailySummary: false, memoryInbox: false, memoryUpload: false };
  const mixedResponse = await buildApp(mixed).inject({ method: "GET", url: "/system/features" });
  assert.deepEqual(mixedResponse.json(), mixed);
});

test("features never includes any other settings", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/features" });
  assert.deepEqual(Object.keys(response.json()), ["alerts", "heartbeat", "dailySummary", "memoryInbox", "memoryUpload"]);
});

test("backup says never run when there's no status yet", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/backup" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { lastRun: null, lastSuccess: null });
});

test("backup answers with the last run and the last success", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-"));
  await writeFile(join(dir, "backup-last-run"), "2026-11-15T03:31:12Z ok\n");
  await writeFile(join(dir, "backup-last-success"), "2026-11-15T03:31:10Z\n");
  const response = await buildApp(allOn, dir).inject({ method: "GET", url: "/system/backup" });
  await rm(dir, { recursive: true, force: true });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    lastRun: { time: "2026-11-15T03:31:12Z", problem: null },
    lastSuccess: "2026-11-15T03:31:10Z",
  });
});