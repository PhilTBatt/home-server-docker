import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Features } from "../../config.js";
import type { Problem, Status } from "../system/alerts.js";
import type { BackupState } from "../system/backup.js";
import { createDailySummary, formatLondonTime, formatUptime, londonTime, summaryFor } from "./daily.js";

const status: Status = {
  uptimeSeconds: 273600,
  memoryTotalMB: 7373,
  memoryAvailableMB: 3174,
  diskTotalGB: 231,
  diskAvailableGB: 180,
};

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true };

const neverRun: BackupState = { lastRun: null, lastSuccess: null };

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
  assert.deepEqual(summaryFor(status, [], allOn, 0, neverRun), {
    title: "Home Hub: daily summary",
    message: [
      "Up 3d 4h.",
      "Memory: 3.1 of 7.2 GB available.",
      "Disk: 180 of 231 GB free.",
      "No problems.",
      "Brain: no notes waiting.",
      "Backups: never run.",
    ].join("\n"),
    tags: "memo",
  });
});

test("a summary with problems lists each one under a heading", () => {
  const summary = summaryFor(status, [diskLow, wifi], allOn, 0, neverRun);
  assert.equal(
    summary.message,
    [
      "Up 3d 4h.",
      "Memory: 3.1 of 7.2 GB available.",
      "Disk: 180 of 231 GB free.",
      "Problems:",
      diskLow.message,
      wifi.message,
      "Brain: no notes waiting.",
      "Backups: never run.",
    ].join("\n"),
  );
});

test("summaryFor leaves its inputs unchanged", () => {
  const statusCopy = { ...status };
  const problems = [diskLow];
  summaryFor(status, problems, allOn, 0, neverRun);
  assert.deepEqual(status, statusCopy);
  assert.deepEqual(problems, [diskLow]);
});

test("nothing is sent before the chosen hour", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T07:59:00Z")), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("the summary is sent during the chosen hour", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T08:02:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://ntfy.sh/my-topic");
  assert.equal(new Headers(options?.headers).get("Title"), "Home Hub: daily summary");
  assert.match(String(options?.body), /^Up 3d 4h\./);
});

test("the summary is only sent once a day", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  const results = [];
  for (const time of ["08:00", "08:05", "08:30", "08:55"]) {
    results.push(await send(new Date(`2026-11-13T${time}:00Z`)));
  }
  assert.deepEqual(results, [true, false, false, false]);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("nothing is sent after the chosen hour, even if it was missed", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T09:00:00Z")), false);
  assert.equal(await send(new Date("2026-11-13T21:00:00Z")), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("the next day gets its own summary", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  assert.equal(await send(new Date("2026-11-14T08:00:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("the hour is London time, so it moves with the clocks in summer", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-07-01T08:00:00Z")), false);
  assert.equal(await send(new Date("2026-07-01T07:00:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a failed send is retried at the next check in the same hour", async () => {
  let reply = 500;
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: reply }));
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
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
    async () => 0,
    async () => neverRun,
  );
  await assert.rejects(send(new Date("2026-11-13T08:00:00Z")), /statfs failed/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("current problems are included in the summary", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [diskLow], 8, allOn, async () => 0, async () => neverRun);
  await send(new Date("2026-11-13T08:00:00Z"));
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /Problems:\nDisk is low: 22 of 230 GB free\./);
});

test("a different hour can be chosen", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 19, allOn, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), false);
  assert.equal(await send(new Date("2026-11-13T19:00:00Z")), true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a summary names anything switched off, in a fixed order", () => {
  const summary = summaryFor(status, [], { alerts: false, heartbeat: false, dailySummary: true, memoryInbox: false, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true }, null, neverRun);
  assert.equal(
    summary.message,
    [
      "Up 3d 4h.",
      "Memory: 3.1 of 7.2 GB available.",
      "Disk: 180 of 231 GB free.",
      "No problems.",
      "Backups: never run.",
      "Switched off: alerts, heartbeat, brain inbox.",
    ].join("\n"),
  );
});

test("the switched-off line comes after the problems", () => {
  const summary = summaryFor(status, [diskLow], { alerts: true, heartbeat: false, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true }, 2, neverRun);
  assert.deepEqual(summary.message.split("\n").slice(-5), ["Problems:", diskLow.message, "Brain: 2 notes waiting.", "Backups: never run.", "Switched off: heartbeat."]);
});

test("a summary with everything on says nothing about switches", () => {
  assert.doesNotMatch(summaryFor(status, [diskLow], allOn, 0, neverRun).message, /Switched off/);
});

test("summaryFor leaves the switches unchanged", () => {
  const features: Features = { alerts: false, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true };
  summaryFor(status, [], features, 3, neverRun);
  assert.deepEqual(features, { alerts: false, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true });
});

test("the summary that's sent includes what's switched off", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, {
    alerts: true,
    heartbeat: false,
    dailySummary: true,
    memoryInbox: false,
    memoryUpload: true,
    deals: true,
    findPhone: true,
    trains: true,
    trainAlerts: true,
    expiryAlerts: true,
    watchers: true,
    catchUp: true,
    modes: true,
    reminders: true,
    chores: true,
    sessions: true,
    spotify: true,
    talk: true,
  }, async () => 0, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  const body = String(fetchMock.mock.calls[0].arguments[1]?.body);
  assert.match(body, /Switched off: heartbeat, brain inbox\.$/);
});

test("with the brain inbox on, the summary says how many notes are waiting", () => {
  const line = (waiting: number) => summaryFor(status, [], allOn, waiting, neverRun).message.split("\n").at(-2);
  assert.equal(line(0), "Brain: no notes waiting.");
  assert.equal(line(1), "Brain: 1 note waiting.");
  assert.equal(line(3), "Brain: 3 notes waiting.");
});

test("if the inbox couldn't be read, the summary says so instead of a number", () => {
  assert.equal(summaryFor(status, [], allOn, null, neverRun).message.split("\n").at(-2), "Brain: couldn't read the inbox.");
});

test("with the brain inbox off, there's no brain line and it's named as switched off", () => {
  const summary = summaryFor(status, [], { ...allOn, memoryInbox: false }, 5, neverRun);
  assert.doesNotMatch(summary.message, /Brain:/);
  assert.match(summary.message, /Switched off: brain inbox\.$/);
});

test("the summary that's sent counts the inbox when the brain inbox is on", async () => {
  const fetchMock = fakeNtfy();
  let counted = 0;
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => {
    counted++;
    return 4;
  }, async () => neverRun);
  await send(new Date("2026-11-13T08:00:00Z"));
  assert.equal(counted, 1);
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /Brain: 4 notes waiting\.\n/);
});

test("the inbox isn't touched when the brain inbox is off", async () => {
  fakeNtfy();
  let counted = 0;
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, { ...allOn, memoryInbox: false }, async () => {
    counted++;
    return 4;
  }, async () => neverRun);
  await send(new Date("2026-11-13T08:00:00Z"));
  assert.equal(counted, 0);
});

test("an unreadable inbox doesn't stop the summary going out", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => {
    throw new Error("Couldn't read the brain inbox");
  }, async () => neverRun);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /Brain: couldn't read the inbox\.\n/);
});

test("formatLondonTime shows the day, month and time in GMT", () => {
  assert.equal(formatLondonTime("2026-11-15T03:31:12Z"), "15 Nov at 03:31");
});

test("formatLondonTime moves to BST in summer", () => {
  assert.equal(formatLondonTime("2026-07-01T02:30:00Z"), "1 Jul at 03:30");
});

test("formatLondonTime gives back anything that isn't a time unchanged", () => {
  assert.equal(formatLondonTime("not a time"), "not a time");
});

const backupLine = (backup: BackupState | null) =>
  summaryFor(status, [], allOn, 0, backup).message.split("\n").find((line) => line.startsWith("Backups:"));

test("a backup that has never run says so", () => {
  assert.equal(backupLine(neverRun), "Backups: never run.");
});

test("a good last run gives its time", () => {
  assert.equal(
    backupLine({ lastRun: { time: "2026-11-15T03:31:12Z", problem: null }, lastSuccess: "2026-11-15T03:31:10Z" }),
    "Backups: last ran 15 Nov at 03:31.",
  );
});

test("a failed last run gives the reason and the last good backup", () => {
  assert.equal(
    backupLine({ lastRun: { time: "2026-11-16T03:30:05Z", problem: "couldn't open the backup repository" }, lastSuccess: "2026-11-15T03:31:10Z" }),
    "Backups: the last run (16 Nov at 03:30) failed: couldn't open the backup repository. Last good backup: 15 Nov at 03:31.",
  );
});

test("a failed last run with no good backup ever says so", () => {
  assert.equal(
    backupLine({ lastRun: { time: "2026-11-16T03:30:05Z", problem: "it isn't set up yet" }, lastSuccess: null }),
    "Backups: the last run (16 Nov at 03:30) failed: it isn't set up yet. No good backup yet.",
  );
});

test("an unreadable backup status says so", () => {
  assert.equal(backupLine(null), "Backups: couldn't read the backup status.");
});

test("the backups line comes after the brain line and before what's switched off", () => {
  const summary = summaryFor(status, [], { ...allOn, heartbeat: false }, 1, neverRun);
  assert.deepEqual(summary.message.split("\n").slice(-3), ["Brain: 1 note waiting.", "Backups: never run.", "Switched off: heartbeat."]);
});

test("the summary that's sent includes the backup state", async () => {
  const fetchMock = fakeNtfy();
  const lastNight: BackupState = { lastRun: { time: "2026-11-13T03:31:00Z", problem: null }, lastSuccess: "2026-11-13T03:30:58Z" };
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => lastNight);
  await send(new Date("2026-11-13T08:00:00Z"));
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /Backups: last ran 13 Nov at 03:31\.$/);
});

test("an unreadable backup status doesn't stop the summary going out", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => {
    throw new Error("EACCES");
  });
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /Backups: couldn't read the backup status\.$/);
});

test("without a deal count, the summary has no Deals line", () => {
  assert.doesNotMatch(summaryFor(status, [], allOn, 0, neverRun).message, /Deals/);
  assert.doesNotMatch(summaryFor(status, [], allOn, 0, neverRun, undefined).message, /Deals/);
});

test("the Deals line says how many searches are being watched and how many are off", () => {
  const line = (on: number, off: number) => summaryFor(status, [], allOn, 0, neverRun, { on, off }).message.split("\n").at(-1);
  assert.equal(line(3, 0), "Deals: watching 3 searches.");
  assert.equal(line(1, 0), "Deals: watching 1 search.");
  assert.equal(line(2, 1), "Deals: watching 2 searches, 1 switched off.");
  assert.equal(line(1, 4), "Deals: watching 1 search, 4 switched off.");
  assert.equal(line(0, 3), "Deals: no searches switched on (3 off).");
  assert.equal(line(0, 0), "Deals: no searches yet.");
});

test("the Deals line comes after the backups and before what's switched off", () => {
  const features: Features = { ...allOn, heartbeat: false };
  const lines = summaryFor(status, [diskLow], features, 2, neverRun, { on: 3, off: 1 }).message.split("\n");
  assert.deepEqual(lines.slice(-4), ["Brain: 2 notes waiting.", "Backups: never run.", "Deals: watching 3 searches, 1 switched off.", "Switched off: heartbeat."]);
});

test("the summary that's sent includes the deal count when it's given one, asked for at send time", async () => {
  const fetchMock = fakeNtfy();
  let asked = 0;
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun, () => {
    asked += 1;
    return { on: 2, off: 0 };
  });
  assert.equal(await send(new Date("2026-11-13T07:59:00Z")), false);
  assert.equal(asked, 0);
  assert.equal(await send(new Date("2026-11-13T08:00:00Z")), true);
  assert.equal(asked, 1);
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /\nDeals: watching 2 searches\.$/);
});

test("the summary that's sent has no Deals line when it isn't given a count", async () => {
  const fetchMock = fakeNtfy();
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun);
  await send(new Date("2026-11-13T08:00:00Z"));
  assert.doesNotMatch(String(fetchMock.mock.calls[0].arguments[1]?.body), /Deals/);
});

test("a deal watcher problem is listed under Problems in the summary like any other", () => {
  const keys: Problem = { code: "deals-source", message: "The deal watcher can't check its searches: eBay refused the keys." };
  const lines = summaryFor(status, [diskLow, keys], allOn, 0, neverRun, { on: 3, off: 0 }).message.split("\n");
  assert.deepEqual(lines.slice(3, 6), ["Problems:", diskLow.message, keys.message]);
});
test("with expiry alerts on, the summary gives the expiring line after the deals line, and none when nothing's within 30 days", async () => {
  const lines = summaryFor(status, [], { ...allOn, heartbeat: false }, 2, neverRun, { on: 3, off: 1 }, "Expiring: Alpha in 7 days.").message.split("\n");
  assert.deepEqual(lines.slice(-3), ["Deals: watching 3 searches, 1 switched off.", "Expiring: Alpha in 7 days.", "Switched off: heartbeat."]);
  assert.doesNotMatch(summaryFor(status, [], allOn, 2, neverRun, undefined, null).message, /Expiring/);
  assert.equal(summaryFor(status, [], allOn, 2, neverRun, undefined, null).message, summaryFor(status, [], allOn, 2, neverRun).message);
});

test("the summary asks for the expiring line with its own time, and says when the list couldn't be read", async () => {
  const fetchMock = fakeNtfy();
  const asked: Date[] = [];
  const send = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun, undefined, async (now) => (asked.push(now), "Expiring: Alpha today."));
  await send(new Date("2026-11-13T08:01:00Z"));
  assert.deepEqual(asked, [new Date("2026-11-13T08:01:00Z")]);
  assert.match(String(fetchMock.mock.calls[0].arguments[1]?.body), /\nExpiring: Alpha today\.$/);
  const failing = createDailySummary("my-topic", async () => status, async () => [], 8, allOn, async () => 0, async () => neverRun, undefined, async () => {
    throw new Error("The expiry list has a problem: there's no expiry/items.json yet");
  });
  await failing(new Date("2026-11-13T08:01:00Z"));
  assert.match(String(fetchMock.mock.calls[1].arguments[1]?.body), /\nExpiring: couldn't read the list\.$/);
});
