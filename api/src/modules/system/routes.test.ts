import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import type { Problem } from "./alerts.js";
import { currentProblems, parseReconnects, system } from "./routes.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true };

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
    assert.ok(["disk-low", "memory-low", "wifi-reconnects", "backup-failed"].includes(problem.code));
    assert.equal(typeof problem.message, "string");
  }
});

test("alerts reports no Wi-Fi problem when the log file doesn't exist", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/alerts" });
  const codes = response.json().problems.map((p: { code: string }) => p.code);
  assert.equal(codes.includes("wifi-reconnects"), false);
});

test("currentProblems returns a list of problems with known codes", async () => {
  const problems = await currentProblems(join(tmpdir(), "no-such-backup-status-here"));
  assert.ok(Array.isArray(problems));
  for (const problem of problems) {
    assert.ok(["disk-low", "memory-low", "wifi-reconnects", "backup-failed"].includes(problem.code));
  }
});

test("currentProblems agrees with the alerts route", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/alerts" });
  const fromRoute = response.json().problems.map((p: { code: string }) => p.code);
  const direct = (await currentProblems(join(tmpdir(), "no-such-backup-status-here"))).map((p) => p.code);
  assert.deepEqual(direct, fromRoute);
});

test("features returns the switches it's given", async () => {
  const allOnResponse = await buildApp().inject({ method: "GET", url: "/system/features" });
  assert.equal(allOnResponse.statusCode, 200);
  assert.deepEqual(allOnResponse.json(), { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true });
  const mixed = { alerts: false, heartbeat: true, dailySummary: false, memoryInbox: false, memoryUpload: false, deals: true, findPhone: true, trains: true };
  const mixedResponse = await buildApp(mixed).inject({ method: "GET", url: "/system/features" });
  assert.deepEqual(mixedResponse.json(), mixed);
});

test("features never includes any other settings", async () => {
  const response = await buildApp().inject({ method: "GET", url: "/system/features" });
  assert.deepEqual(Object.keys(response.json()), ["alerts", "heartbeat", "dailySummary", "memoryInbox", "memoryUpload", "deals", "findPhone", "trains"]);
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

test("alerts include a failed last backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-"));
  await writeFile(join(dir, "backup-last-run"), "2026-11-16T03:30:05Z couldn't open the backup repository\n");
  const response = await buildApp(allOn, dir).inject({ method: "GET", url: "/system/alerts" });
  await rm(dir, { recursive: true, force: true });
  const problems = response.json().problems;
  assert.ok(problems.some((p: { code: string; message: string }) => p.code === "backup-failed" && p.message === "The last backup failed: couldn't open the backup repository."));
});

test("an unreadable backup status doesn't stop the alerts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-"));
  await mkdir(join(dir, "backup-last-run"));
  const response = await buildApp(allOn, dir).inject({ method: "GET", url: "/system/alerts" });
  await rm(dir, { recursive: true, force: true });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().problems.some((p: { code: string }) => p.code === "backup-failed"), false);
});

const noBackups = join(tmpdir(), "no-such-backup-status-here");
const dealProblem: Problem = { code: "deals-source", message: "The deal watcher can't check its searches: eBay refused the keys." };
const listProblem: Problem = { code: "deals-list", message: "The deal watcher's search list has a problem: search 1 (ram): switch must be on or off." };

test("currentProblems adds the problems it's handed after the server's own, in the order given", async () => {
  const own = await currentProblems(noBackups);
  const all = await currentProblems(noBackups, [dealProblem, listProblem]);
  assert.deepEqual(all, [...own, dealProblem, listProblem]);
});

test("currentProblems with nothing extra is just the server's own", async () => {
  assert.deepEqual(await currentProblems(noBackups, []), await currentProblems(noBackups));
  assert.deepEqual(await currentProblems(noBackups, undefined), await currentProblems(noBackups));
});

test("currentProblems leaves the list it was handed unchanged", async () => {
  const extra = [dealProblem];
  await currentProblems(noBackups, extra);
  assert.deepEqual(extra, [dealProblem]);
});

test("the alerts route includes problems from elsewhere, and isn't ok while there are any", async () => {
  const app = Fastify();
  app.register(system, { prefix: "/system", features: allOn, backupDir: noBackups, moreProblems: () => [dealProblem] });
  const response = await app.inject({ method: "GET", url: "/system/alerts" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, false);
  assert.deepEqual(response.json().problems.at(-1), dealProblem);
});

test("the alerts route asks for those problems afresh each time", async () => {
  let current: Problem[] = [dealProblem];
  const app = Fastify();
  app.register(system, { prefix: "/system", features: allOn, backupDir: noBackups, moreProblems: () => current });
  const before = (await app.inject({ method: "GET", url: "/system/alerts" })).json().problems.length;
  current = [];
  const after = (await app.inject({ method: "GET", url: "/system/alerts" })).json().problems.length;
  assert.equal(before - after, 1);
});

test("only the alerts route asks for those problems", async () => {
  let asked = 0;
  const app = Fastify();
  app.register(system, {
    prefix: "/system",
    features: allOn,
    backupDir: noBackups,
    moreProblems: () => {
      asked += 1;
      return [];
    },
  });
  for (const url of ["/system/status", "/system/features", "/system/backup", "/system/wifi-reconnects"]) await app.inject({ method: "GET", url });
  assert.equal(asked, 0);
  await app.inject({ method: "GET", url: "/system/alerts" });
  assert.equal(asked, 1);
});