import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Features } from "../../config.js";
import type { Problem, Status } from "../system/alerts.js";
import { createDailySummary, formatUptime, londonTime, summaryFor } from "./daily.js";

const status: Status = {
  uptimeSeconds: 273600,
  memoryTotalMB: 7373,
  memoryAvailableMB: 3174,
  diskTotalGB: 231,
  diskAvailableGB: 180,
};

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true };

const diskLow: Problem = { code: "disk-low", message: "Disk is low: 22 of 230 GB free." };
const wifi: Problem = { code: "wifi-reconnects", message: "Wi-Fi reconnected 2 times in the last 24 hours." };

afterEach(() => {
  mock.restoreAll();
});

function fakeNtfy(status = 200) {
  return mock.method(globalThis, "fetch", async () => new Response(null, { status }));
}

test("londonTime uses GMT in winter", () => {
  assert.deepEqual(londonTime(new Date("2026-11-13T08:30:00Z")), { day: "2026-11-13", hour: 8 });
});

test("londonTime uses BST in summer", () => {
  assert.deepEqual(londonTime(new Date("2026-07-01T07:30:00Z")), { day: "2026-07-01", hour: 8 });
});

test("londonTime moves to the next day after London midnight", () => {
  assert.deepEqual(londonTime(new Date("2026-07-01T23:30:00Z")), { day: "2026-07-02", hour: 0 });
});

test("londonTime handles the hour before midnight", () => {
  assert.deepEqual(londonTime(new Date("2026-11-13T23:59:59Z")), { day: "2026-11-13", hour: 23 });
});

test("londonTime handles the morning the clocks go back", () => {
  assert.deepEqual(londonTime(new Date("2026-10-25T08:00:00Z")), { day: "2026-10-25", hour: 8 });
});

test("londonTime handles the morning the clocks go forward", () => {
  assert.deepEqual(londonTime(new Date("2026-03-29T07:00:00Z")), { day: "2026-03-29", hour: 8 });
});

test("formatUptime shows minutes under an hour", () => {
  assert.equal(formatUptime(0), "0m");
  assert.equal(formatUptime(59), "0m");
  assert.equal(formatUptime(600), "10m");
});

test("formatUptime shows hours and minutes under a day", () => {
  assert.equal(formatUptime(3600), "1h 0m");
  assert.equal(formatUptime(18720), "5h 12m");
  assert.equal(formatUptime(86399), "23h 59m");
});

test("formatUptime shows days and hours from a day up", () => {
  assert.equal(formatUptime(86400), "1d 0h");
  assert.equal(formatUptime(273600), "3d 4h");
  assert.equal(formatUptime(2592000), "30d 0h");
});

test("a healthy summary lists the numbers and says no problems", () => {
  assert.deepEqual(summaryFor(status, [], allOn), {
    title: "Home Hub: daily summary",
    message: [
      "Up 3d 4h.",
      "Memory: 3.1 of 7.2 GB available.",
      "Disk: 180 of 231 GB free.",
      "No problems.",
    ].join("\n"),
    tags: "memo",
  });
});

test("a summary with problems lists each one under a heading", () => {
  const summary = summaryFor(status, [diskLow, wifi], allOn);
  assert.equal(
    summary.message,
    [
      "Up 3d 4h.",
      "Memory: 3.1 of 7.2 GB available.",
      "Disk: 180 of 231 GB free.",
      "Problems:",
      diskLow.message,
      wifi.message,
    ].join("\n"),
  );
});

test("summaryFor leaves its inputs unchanged", () => {
  const statusCopy = { ...status };
  const problems = [diskLow];
  summaryFor(status, problems, allOn);
  assert.deepEqual(status, statusCopy);
  assert.deepEqual(problems, [diskLow]);
});

test("nothing is sent before the chosen hour", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  assert.equal(await send(new Date("2026-11-13T07:59:00Z")), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("the summary is sent during the chosen hour", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  assert.equal(await send(new Date("2026-11-13T08:02:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://ntfy.sh/my-topic");
  assert.equal(new Headers(options?.headers).get("Title"), "Home Hub: daily summary");
  assert.match(String(options?.body), /^Up 3d 4h\./);
});

test("the summary is only sent once a day", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  const results = [];
  for (const time of ["08:00", "08:05", "08:30", "08:55"]) {
    results.push(await send(new Date(`2026-11-13T${time}:00Z`)));
  }
  assert.deepEqual(results, [true, false, false, false]);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("nothing is sent after the chosen hour, even if it was missed", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  assert.equal(await send(new Date("2026-11-13T09:00:00Z")), false);
  assert.equal(await send(new Date("2026-11-13T21:00:00Z")), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("the next day gets its own summary", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  assert.equal(await send(new Date("2026-11-14T08:00:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("the hour is London time, so it moves with the clocks in summer", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  assert.equal(await send(new Date("2026-07-01T08:00:00Z")), false);
  assert.equal(await send(new Date("2026-07-01T07:00:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a failed send is retried at the next check in the same hour", async () => {
  let reply = 500;
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: reply }));
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn);
  await assert.rejects(send(new Date("2026-11-13T08:00:00Z")), /ntfy replied 500/);
  reply = 200;
  assert.equal(await send(new Date("2026-11-13T08:05:00Z")), true);
  assert.equal(await send(new Date("2026-11-13T08:10:00Z")), false);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("a failure reading the status sends nothing", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary(
    "my-topic",
    async () => {
      throw new Error("statfs failed");
    },
    async () => [],
    8,
    allOn,
  );
  await assert.rejects(send(new Date("2026-11-13T08:00:00Z")), /statfs failed/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("current problems are included in the summary", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [diskLow], 8, allOn);
  await send(new Date("2026-11-13T08:00:00Z"));
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /Problems:\nDisk is low: 22 of 230 GB free\./);
});

test("a different hour can be chosen", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 19, allOn);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), false);
  assert.equal(await send(new Date("2026-11-13T19:00:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a summary names anything switched off, in a fixed order", () => {
  const summary = summaryFor(status, [], { alerts: false, heartbeat: false, dailySummary: true });
  assert.equal(
    summary.message,
    [
      "Up 3d 4h.",
      "Memory: 3.1 of 7.2 GB available.",
      "Disk: 180 of 231 GB free.",
      "No problems.",
      "Switched off: alerts, heartbeat.",
    ].join("\n"),
  );
});

test("the switched-off line comes after the problems", () => {
  const summary = summaryFor(status, [diskLow], { alerts: true, heartbeat: false, dailySummary: true });
  assert.deepEqual(summary.message.split("\n").slice(-3), ["Problems:", diskLow.message, "Switched off: heartbeat."]);
});

test("a summary with everything on says nothing about switches", () => {
  assert.doesNotMatch(summaryFor(status, [diskLow], allOn).message, /Switched off/);
});

test("summaryFor leaves the switches unchanged", () => {
  const features: Features = { alerts: false, heartbeat: true, dailySummary: true };
  summaryFor(status, [], features);
  assert.deepEqual(features, { alerts: false, heartbeat: true, dailySummary: true });
});

test("the summary that's sent includes what's switched off", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, {
    alerts: true,
    heartbeat: false,
    dailySummary: true,
  });
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  const body = String(fetchMock.mock.calls[0].arguments[1]?.body);
  assert.match(body, /Switched off: heartbeat\.$/);
});