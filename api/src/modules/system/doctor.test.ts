import assert from "node:assert/strict";
import { test } from "node:test";
import type { Features } from "../../config.js";
import type { ExpiryStatus } from "../expiry/checker.js";
import type { WatcherView } from "../watchers/watchers.js";
import type { Problem, Status } from "./alerts.js";
import { ask, createTries, doctorKeepMs, doctorWaitMs, examine, kept, runDoctor, summaryOf, type Check, type DoctorSources, type Seen } from "./doctor.js";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true, projector: true, events: true, morning: true, switches: true };
const allOff: Features = { alerts: false, heartbeat: false, dailySummary: false, memoryInbox: false, memoryUpload: false, deals: false, findPhone: false, trains: false, trainAlerts: false, expiryAlerts: false, watchers: false, catchUp: false, modes: false, reminders: false, chores: false, sessions: false, spotify: false, talk: false, wall: false, projector: false, events: false, morning: false, switches: false };
const now = new Date("2026-11-26T12:00:00Z");
const status: Status = { uptimeSeconds: 3600, memoryTotalMB: 8192, memoryAvailableMB: 4096, diskTotalGB: 100, diskAvailableGB: 40 };

function item(name: string, daysLeft: number): ExpiryStatus {
  return { name, date: "2026-12-01", note: null, daysLeft, overdue: daysLeft < 0 };
}

function healthy(): Seen {
  return {
    features: allOn,
    problems: [],
    status,
    backup: { lastRun: { time: "2026-11-26T02:00:00Z", problem: null }, lastSuccess: "2026-11-26T02:00:00Z" },
    heartbeat: { at: "2026-11-26T11:55:00Z", ok: true },
    alerts: { at: "2026-11-26T09:00:00Z", ok: true },
    downloads: { value: [{}, {}] },
    library: { value: { movies: 12, series: 3, episodes: 40 } },
    inbox: { value: 2 },
    trains: { value: { departures: [] } },
    expiries: { value: [item("Alpha", 20)] },
    watchers: [],
  };
}

function checkOf(seen: Seen, name: string): Check {
  const found = examine(seen, now).checks.find((check) => check.name === name);
  assert.ok(found !== undefined, name);
  return found;
}

const problem = (code: Problem["code"], message: string): Problem => ({ code, message });

test("with everything healthy, every check is ok with plain words and nothing to try, and the summary says so", () => {
  const report = examine(healthy(), now);
  assert.equal(report.state, "ok");
  assert.equal(report.summary, "Everything's OK: 13 checks fine.");
  assert.equal(report.checkedAt, "2026-11-26T12:00:00.000Z");
  assert.deepEqual(report.checks, [
    { name: "Disk", state: "ok", detail: "40 of 100 GB free.", next: null },
    { name: "Memory", state: "ok", detail: "4.0 of 8.0 GB available.", next: null },
    { name: "Wi-Fi", state: "ok", detail: "No reconnects in the last 24 hours.", next: null },
    { name: "Backups", state: "ok", detail: "The last good backup was 26 Nov at 02:00.", next: null },
    { name: "Heartbeat", state: "ok", detail: "The last ping to Healthchecks.io went 26 Nov at 11:55.", next: null },
    { name: "Phone alerts", state: "ok", detail: "The last alert check, 26 Nov at 09:00, worked.", next: null },
    { name: "qBittorrent", state: "ok", detail: "Answering, with 2 downloading.", next: null },
    { name: "Jellyfin", state: "ok", detail: "Answering, with 12 movies and 3 series.", next: null },
    { name: "Brain inbox", state: "ok", detail: "2 notes waiting.", next: null },
    { name: "Deal watcher", state: "ok", detail: "No problems.", next: null },
    { name: "Train times", state: "ok", detail: "The departure board answered.", next: null },
    { name: "Expiry list", state: "ok", detail: "Nothing due in the next 7 days, with 1 item on the list.", next: null },
    { name: "Watchers", state: "ok", detail: "Nothing being watched.", next: null },
  ]);
});

test("every switched-off feature is off, never a problem, with its setting named and nothing to try", () => {
  const seen: Seen = { ...healthy(), features: allOff, heartbeat: { at: "2026-11-26T11:55:00Z", ok: false }, alerts: { at: "2026-11-26T11:55:00Z", ok: false }, inbox: null, trains: null, expiries: null, watchers: null, problems: [problem("deals-list", "The deal watcher's search list has a problem: x.")] };
  const report = examine(seen, now);
  const offChecks = report.checks.filter((check) => check.state === "off");
  assert.deepEqual(offChecks, [
    { name: "Heartbeat", state: "off", detail: "Switched off (HEARTBEAT).", next: null },
    { name: "Phone alerts", state: "off", detail: "Switched off (ALERTS).", next: null },
    { name: "Brain inbox", state: "off", detail: "Switched off (MEMORY_INBOX).", next: null },
    { name: "Deal watcher", state: "off", detail: "Switched off (DEALS).", next: null },
    { name: "Train times", state: "off", detail: "Switched off (TRAINS).", next: null },
    { name: "Expiry list", state: "off", detail: "Switched off (EXPIRY_ALERTS).", next: null },
    { name: "Watchers", state: "off", detail: "Switched off (WATCHERS).", next: null },
  ]);
  assert.equal(report.state, "ok");
  assert.equal(report.summary, "Everything's OK: 6 checks fine, 7 switched off.");
});

test("each feature's own switch decides whether it's off, whatever the others are set to", () => {
  const heartbeatOnly: Seen = { ...healthy(), features: { ...allOn, alerts: false }, heartbeat: { at: "2026-11-26T11:55:00Z", ok: false }, alerts: { at: "2026-11-26T11:55:00Z", ok: false } };
  assert.deepEqual([checkOf(heartbeatOnly, "Heartbeat").state, checkOf(heartbeatOnly, "Phone alerts").state], ["problem", "off"]);
  const alertsOnly: Seen = { ...heartbeatOnly, features: { ...allOn, heartbeat: false } };
  assert.deepEqual([checkOf(alertsOnly, "Heartbeat").state, checkOf(alertsOnly, "Phone alerts").state], ["off", "problem"]);
});

test("a switched-off feature is off even when it's handed something to look at", () => {
  const seen: Seen = { ...healthy(), features: { ...allOn, memoryInbox: false, trains: false, expiryAlerts: false }, inbox: { failed: "x" }, trains: { failed: "y" }, expiries: { value: [item("Alpha", -3)] } };
  assert.deepEqual(["Brain inbox", "Train times", "Expiry list"].map((name) => checkOf(seen, name).state), ["off", "off", "off"]);
});

test("a switch that's on but given nothing to look at is still counted as off rather than guessed", () => {
  const seen: Seen = { ...healthy(), inbox: null, trains: null, expiries: null };
  assert.deepEqual(["Brain inbox", "Train times", "Expiry list"].map((name) => checkOf(seen, name).state), ["off", "off", "off"]);
});

test("low disk is the alert's problem, with its words; under a fifth free is a warning; a fifth or more is fine", () => {
  const low = checkOf({ ...healthy(), status: { ...status, diskAvailableGB: 9 }, problems: [problem("disk-low", "Disk is low: 9 of 100 GB free.")] }, "Disk");
  assert.equal(low.state, "problem");
  assert.equal(low.detail, "Disk is low: 9 of 100 GB free.");
  assert.match(low.next ?? "", /docker system df/);
  const under = checkOf({ ...healthy(), status: { ...status, diskAvailableGB: 19 } }, "Disk");
  assert.deepEqual([under.state, under.detail], ["warn", "19 of 100 GB free, under a fifth."]);
  assert.match(under.next ?? "", /docker system df/);
  assert.equal(checkOf({ ...healthy(), status: { ...status, diskAvailableGB: 20 } }, "Disk").state, "ok");
});

test("low memory is a problem only when the alerts say so, and the doctor never adds a rule of its own for it", () => {
  const low = checkOf({ ...healthy(), status: { ...status, memoryAvailableMB: 700 }, problems: [problem("memory-low", "Memory is low: 700 of 8192 MB available.")] }, "Memory");
  assert.deepEqual([low.state, low.detail], ["problem", "Memory is low: 700 of 8192 MB available."]);
  assert.match(low.next ?? "", /docker stats --no-stream/);
  assert.equal(checkOf({ ...healthy(), status: { ...status, memoryAvailableMB: 1000 } }, "Memory").state, "ok");
});

test("Wi-Fi reconnects in the last day are something to look at, in the alert's words", () => {
  const check = checkOf({ ...healthy(), problems: [problem("wifi-reconnects", "Wi-Fi reconnected 2 times in the last 24 hours.")] }, "Wi-Fi");
  assert.deepEqual([check.state, check.detail], ["warn", "Wi-Fi reconnected 2 times in the last 24 hours."]);
  assert.match(check.next ?? "", /reconnects\.log/);
});

test("backups: never run is off, a failed run is a problem naming the last good one, and an unreadable status is a warning", () => {
  assert.deepEqual(checkOf({ ...healthy(), backup: { lastRun: null, lastSuccess: null } }, "Backups"), { name: "Backups", state: "off", detail: "No backup has run yet.", next: null });
  const failed = checkOf({ ...healthy(), backup: { lastRun: { time: "2026-11-26T02:00:00Z", problem: "restic exited 1" }, lastSuccess: "2026-11-24T02:00:00Z" }, problems: [problem("backup-failed", "The last backup failed: restic exited 1.")] }, "Backups");
  assert.deepEqual([failed.state, failed.detail], ["problem", "The last backup failed: restic exited 1. The last good one was 24 Nov at 02:00."]);
  assert.match(failed.next ?? "", /journalctl -u home-hub-backup/);
  const never = checkOf({ ...healthy(), backup: { lastRun: { time: "2026-11-26T02:00:00Z", problem: "restic exited 1" }, lastSuccess: null }, problems: [problem("backup-failed", "The last backup failed: restic exited 1.")] }, "Backups");
  assert.equal(never.detail, "The last backup failed: restic exited 1. There's no good backup yet.");
  const unread = checkOf({ ...healthy(), backup: null }, "Backups");
  assert.deepEqual([unread.state, unread.detail], ["warn", "Couldn't read the backup status."]);
});

test("a good backup more than a week old is a warning, and one exactly a week old is still fine", () => {
  const week = checkOf({ ...healthy(), backup: { lastRun: { time: "2026-11-19T12:00:00Z", problem: null }, lastSuccess: "2026-11-19T12:00:00Z" } }, "Backups");
  assert.equal(week.state, "ok");
  const old = checkOf({ ...healthy(), backup: { lastRun: { time: "2026-11-19T11:59:00Z", problem: null }, lastSuccess: "2026-11-19T11:59:00Z" } }, "Backups");
  assert.deepEqual([old.state, old.detail], ["warn", "The last good backup was 19 Nov at 11:59, more than a week ago."]);
  assert.equal(old.next, "sudo home-hub-backup runs one now. If the nightly timer is meant to be on, systemctl status home-hub-backup.timer says whether it is.");
  assert.match(old.next ?? "", /home-hub-backup\.timer/);
  const noSuccessTime = checkOf({ ...healthy(), backup: { lastRun: { time: "2026-11-25T02:00:00Z", problem: null }, lastSuccess: null } }, "Backups");
  assert.deepEqual([noSuccessTime.state, noSuccessTime.detail], ["ok", "The last good backup was 25 Nov at 02:00."]);
  assert.equal(checkOf({ ...healthy(), backup: { lastRun: { time: "not a time", problem: null }, lastSuccess: null } }, "Backups").state, "warn");
});

test("the heartbeat is a problem when its last ping failed, a warning before any has finished, and never shows the address", () => {
  const failed = checkOf({ ...healthy(), heartbeat: { at: "2026-11-26T11:55:00Z", ok: false } }, "Heartbeat");
  assert.deepEqual([failed.state, failed.detail], ["problem", "The last ping to Healthchecks.io, 26 Nov at 11:55, failed."]);
  assert.match(failed.next ?? "", /docker compose logs --tail 20 api/);
  const none = checkOf({ ...healthy(), heartbeat: null }, "Heartbeat");
  assert.deepEqual([none.state, none.detail], ["warn", "No ping to Healthchecks.io has finished since the API started."]);
  assert.ok(!JSON.stringify(examine(healthy(), now)).includes("hc-ping"));
});

test("phone alerts are a problem when the last check failed, and worth a look before any check has finished", () => {
  const failed = checkOf({ ...healthy(), alerts: { at: "2026-11-26T11:55:00Z", ok: false } }, "Phone alerts");
  assert.deepEqual([failed.state, failed.detail], ["problem", "The last alert check, 26 Nov at 11:55, couldn't finish, so a change may not have reached your phone."]);
  assert.match(failed.next ?? "", /notification check failed/);
  assert.deepEqual(checkOf({ ...healthy(), alerts: null }, "Phone alerts"), { name: "Phone alerts", state: "warn", detail: "No alert check has finished since the API started.", next: "It checks every 5 minutes, so ask again in a few minutes." });
});

test("qBittorrent and Jellyfin not answering are problems that say why and name their own service", () => {
  const seen: Seen = { ...healthy(), downloads: { failed: "qBittorrent replied 403" }, library: { failed: "no answer within 10 seconds" } };
  const qbit = checkOf(seen, "qBittorrent");
  assert.deepEqual([qbit.state, qbit.detail, qbit.next], ["problem", "Didn't answer: qBittorrent replied 403.", "docker compose ps qbittorrent shows whether it's running, and docker compose logs --tail 20 qbittorrent what it last said."]);
  const jellyfin = checkOf(seen, "Jellyfin");
  assert.deepEqual([jellyfin.state, jellyfin.detail, jellyfin.next], ["problem", "Didn't answer: no answer within 10 seconds.", "docker compose ps jellyfin shows whether it's running, and docker compose logs --tail 20 jellyfin what it last said."]);
  assert.equal(checkOf({ ...healthy(), downloads: { value: [] } }, "qBittorrent").detail, "Answering, with 0 downloading.");
});

test("the brain inbox counts notes, says none or one plainly, and is a problem when it can't be read", () => {
  assert.equal(checkOf({ ...healthy(), inbox: { value: 0 } }, "Brain inbox").detail, "No notes waiting.");
  assert.equal(checkOf({ ...healthy(), inbox: { value: 1 } }, "Brain inbox").detail, "1 note waiting.");
  const failed = checkOf({ ...healthy(), inbox: { failed: "Couldn't read the brain inbox" } }, "Brain inbox");
  assert.deepEqual([failed.state, failed.detail], ["problem", "Couldn't read the brain inbox."]);
  assert.match(failed.next ?? "", /ls -ld ~\/hub-memory\/inbox/);
});

test("the deal watcher's own problems are a problem, but a used-up day of calls alone is only a warning", () => {
  const broken = checkOf({ ...healthy(), problems: [problem("deals-limit", "Used up."), problem("deals-source", "Can't check.")] }, "Deal watcher");
  assert.deepEqual([broken.state, broken.detail], ["problem", "Used up. Can't check."]);
  assert.match(broken.next ?? "", /get_deal_status/);
  const limit = checkOf({ ...healthy(), problems: [problem("deals-limit", "The deal watcher has used today's 5000 calls and carries on tomorrow.")] }, "Deal watcher");
  assert.deepEqual([limit.state, limit.detail], ["warn", "The deal watcher has used today's 5000 calls and carries on tomorrow."]);
  assert.equal(checkOf({ ...healthy(), problems: [problem("expiry-list", "x"), problem("disk-low", "y")] }, "Deal watcher").state, "ok");
  for (const code of ["deals-list", "deals-state"] as const) assert.equal(checkOf({ ...healthy(), problems: [problem(code, "z")] }, "Deal watcher").state, "problem", code);
});

test("train times are a problem when the board doesn't answer, with the board's own reason", () => {
  const check = checkOf({ ...healthy(), trains: { failed: "the departure board couldn't be reached (no connection)" } }, "Train times");
  assert.deepEqual([check.state, check.detail], ["problem", "The departure board didn't answer: the departure board couldn't be reached (no connection)."]);
  assert.match(check.next ?? "", /Ask again in a minute/);
});

test("the expiry list: overdue is a problem, a week or less is a warning, further off is fine, and each is named", () => {
  const overdue = checkOf({ ...healthy(), expiries: { value: [item("Alpha", -2), item("Beta", 3), item("Gamma", 40)] } }, "Expiry list");
  assert.deepEqual([overdue.state, overdue.detail, overdue.next], ["problem", "Alpha expired 2 days ago. Beta expires in 3 days.", "Renew it, then change its date in expiry/items.json."]);
  const soon = checkOf({ ...healthy(), expiries: { value: [item("Beta", 7), item("Gamma", 0)] } }, "Expiry list");
  assert.deepEqual([soon.state, soon.detail], ["warn", "Beta expires in 7 days. Gamma expires today."]);
  const later = checkOf({ ...healthy(), expiries: { value: [item("Beta", 8), item("Gamma", 30)] } }, "Expiry list");
  assert.deepEqual([later.state, later.detail], ["ok", "Nothing due in the next 7 days, with 2 items on the list."]);
  assert.equal(checkOf({ ...healthy(), expiries: { value: [] } }, "Expiry list").detail, "Nothing due in the next 7 days, with 0 items on the list.");
});

test("an expiry list that can't be read, or warnings that couldn't be saved, are problems that say so", () => {
  const unread = checkOf({ ...healthy(), expiries: { failed: "The expiry list has a problem: expiry/items.json isn't valid JSON" } }, "Expiry list");
  assert.deepEqual([unread.state, unread.detail], ["problem", "The expiry list has a problem: expiry/items.json isn't valid JSON."]);
  assert.match(unread.next ?? "", /get_expiries/);
  const saving = "The expiry checker couldn't save which warnings it has sent, so it may send one again after a restart.";
  const unsaved = checkOf({ ...healthy(), problems: [problem("expiry-state", saving)] }, "Expiry list");
  assert.deepEqual([unsaved.state, unsaved.detail], ["problem", saving]);
  assert.match(unsaved.next ?? "", /expiry\/sent\.json/);
  const both = checkOf({ ...healthy(), expiries: { failed: "Bad." }, problems: [problem("expiry-state", saving)] }, "Expiry list");
  assert.equal(both.detail, `Bad. ${saving}`);
  const dueAndUnsaved = checkOf({ ...healthy(), expiries: { value: [item("Beta", 3)] }, problems: [problem("expiry-state", saving)] }, "Expiry list");
  assert.deepEqual([dueAndUnsaved.state, dueAndUnsaved.detail], ["problem", `Beta expires in 3 days. ${saving}`]);
});

function watcher(what: string, lastCheck: WatcherView["lastCheck"], waitingToSend = false): WatcherView {
  return { kind: "disk-free-below", percent: 10, id: "0a1b2c3d", what, hours: 24, createdAt: "2026-11-26T11:00:00.000Z", expiresAt: "2026-11-27T11:00:00.000Z", lastCheck, waitingToSend };
}

test("watchers are off with their switch off, even with a list", () => {
  assert.deepEqual(checkOf({ ...healthy(), features: { ...allOn, watchers: false }, watchers: [watcher("Jellyfin to answer", { at: "2026-11-26T11:59:00.000Z", ok: false })] }, "Watchers"), { name: "Watchers", state: "off", detail: "Switched off (WATCHERS).", next: null });
});

test("watchers are fine when every last check read its source, counting what's watched", () => {
  assert.deepEqual(checkOf({ ...healthy(), watchers: [watcher("free disk space to fall below 10%", null), watcher("Jellyfin to answer", { at: "2026-11-26T11:59:00.000Z", ok: true })] }, "Watchers"), { name: "Watchers", state: "ok", detail: "Watching for 2 things.", next: null });
  assert.equal(checkOf({ ...healthy(), watchers: [watcher("x", null)] }, "Watchers").detail, "Watching for 1 thing.");
});

test("a watcher whose last check couldn't read its source, or whose notification is waiting to be sent, is something to look at", () => {
  const unread = checkOf({ ...healthy(), watchers: [watcher('a download matching "Alpha" to finish', { at: "2026-11-26T11:59:00.000Z", ok: false }), watcher("Jellyfin to answer", null)] }, "Watchers");
  assert.deepEqual([unread.state, unread.detail], ["warn", 'Couldn\'t check for a download matching "Alpha" to finish last time.']);
  assert.match(unread.next ?? "", /get_watchers/);
  const unsent = checkOf({ ...healthy(), watchers: [watcher("free disk space to fall below 10%", { at: "2026-11-26T11:59:00.000Z", ok: true }, true)] }, "Watchers");
  assert.deepEqual([unsent.state, unsent.detail], ["warn", "It happened, but the notification for free disk space to fall below 10% couldn't be sent yet."]);
  assert.match(unsent.next ?? "", /docker compose logs/);
});

test("the overall state is the worst of the checks, and the summary names problems first, then things to look at", () => {
  const warned = examine({ ...healthy(), status: { ...status, diskAvailableGB: 15 } }, now);
  assert.deepEqual([warned.state, warned.summary], ["warn", "1 thing to look at: Disk."]);
  const mixed = examine({ ...healthy(), status: { ...status, diskAvailableGB: 15 }, heartbeat: { at: "2026-11-26T11:55:00Z", ok: false }, downloads: { failed: "x" }, library: { failed: "y" }, problems: [problem("wifi-reconnects", "Wi-Fi reconnected 1 time in the last 24 hours.")] }, now);
  assert.deepEqual([mixed.state, mixed.summary], ["problem", "3 problems: Heartbeat, qBittorrent and Jellyfin. 2 things to look at: Disk and Wi-Fi."]);
  const one = examine({ ...healthy(), downloads: { failed: "x" } }, now);
  assert.deepEqual([one.state, one.summary], ["problem", "1 problem: qBittorrent."]);
});

test("the summary counts a single fine check in the singular", () => {
  assert.equal(summaryOf([{ name: "Disk", state: "ok", detail: "", next: null }]), "Everything's OK: 1 check fine.");
  assert.equal(summaryOf([{ name: "Disk", state: "ok", detail: "", next: null }, { name: "Heartbeat", state: "off", detail: "", next: null }]), "Everything's OK: 1 check fine, 1 switched off.");
});

test("tries remember only the latest outcome and its time", () => {
  const tries = createTries();
  assert.equal(tries.last(), null);
  tries.failed(new Date("2026-11-26T10:00:00Z"));
  assert.deepEqual(tries.last(), { at: "2026-11-26T10:00:00.000Z", ok: false });
  tries.ok(new Date("2026-11-26T10:05:00Z"));
  assert.deepEqual(tries.last(), { at: "2026-11-26T10:05:00.000Z", ok: true });
});

test("asking turns an answer into a value and a failure into its reason, without control characters and cut to 200 characters", async () => {
  assert.deepEqual(await ask(async () => 3), { value: 3 });
  assert.deepEqual(await ask(async () => Promise.reject(new Error("refused\nby it"))), { failed: "refused by it" });
  assert.deepEqual(await ask(() => {
    throw new Error("at once");
  }), { failed: "at once" });
  assert.deepEqual(await ask(async () => Promise.reject("a string")), { failed: "no reason given" });
  assert.deepEqual(await ask(async () => Promise.reject(new Error(""))), { failed: "no reason given" });
  const long = await ask(async () => Promise.reject(new Error("x".repeat(300))));
  assert.deepEqual(long, { failed: `${"x".repeat(199)}\u2026` });
  const words = await ask(async () => Promise.reject(new Error(`${"word, ".repeat(40)}end`)));
  assert.deepEqual(words, { failed: `${"word, ".repeat(32)}word\u2026` });
  const early = await ask(async () => Promise.reject(new Error(`a ${"z".repeat(300)}`)));
  assert.deepEqual(early, { failed: `a ${"z".repeat(197)}\u2026` }, "a space near the start isn't worth cutting back to");
  const exact = await ask(async () => Promise.reject(new Error("y".repeat(200))));
  assert.deepEqual(exact, { failed: "y".repeat(200) });
});

test("a reason cut short ends with an ellipsis, and the detail doesn't add a full stop after it or after one already there", () => {
  assert.equal(checkOf({ ...healthy(), downloads: { failed: "cut short\u2026" } }, "qBittorrent").detail, "Didn't answer: cut short\u2026");
  assert.equal(checkOf({ ...healthy(), trains: { failed: "the board said no." } }, "Train times").detail, "The departure board didn't answer: the board said no.");
  assert.equal(checkOf({ ...healthy(), expiries: { failed: "The list is wrong" } }, "Expiry list").detail, "The list is wrong.");
});

test("asking gives up after its wait, says so, and aborts what it asked", async () => {
  let aborted = false;
  const started = Date.now();
  const got = await ask(
    (signal) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          setTimeout(() => resolve("too late"), 10);
        });
      }),
    50,
  );
  assert.deepEqual(got, { failed: "no answer within 0.05 seconds" });
  assert.ok(aborted);
  assert.ok(Date.now() - started < 2_000);
});

function sources(overrides: Partial<DoctorSources> = {}): DoctorSources & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    heartbeat: createTries(),
    alerts: createTries(),
    downloads: async () => (asked.push("downloads"), []),
    library: async () => (asked.push("library"), { movies: 1, series: 2, episodes: 3 }),
    inbox: async () => (asked.push("inbox"), 0),
    trains: async () => (asked.push("trains"), {}),
    expiries: async () => (asked.push("expiries"), []),
    ...overrides,
  };
}

const reads = { problems: async () => [], status: async () => status, backup: async () => ({ lastRun: null, lastSuccess: null }) };

test("running the doctor asks only what's switched on, and never asks the board, the inbox or the list for a switched-off feature", async () => {
  const on = sources();
  await runDoctor(allOn, on, reads, now);
  assert.deepEqual(on.asked.sort(), ["downloads", "expiries", "inbox", "library", "trains"]);
  const off = sources();
  const report = await runDoctor(allOff, off, reads, now);
  assert.deepEqual(off.asked.sort(), ["downloads", "library"]);
  assert.equal(report.state, "ok");
  const noList = sources({ expiries: undefined });
  const listless = await runDoctor(allOn, noList, reads, now);
  assert.equal(listless.checks.find((check) => check.name === "Expiry list")?.state, "off");
});

test("running the doctor lists the watchers only with their switch on and a list handed over", async () => {
  let asked = 0;
  const list = () => (asked++, [watcher("Jellyfin to answer", null)]);
  const on = await runDoctor(allOn, sources({ watchers: list }), reads, now);
  assert.equal(on.checks.find((check) => check.name === "Watchers")?.detail, "Watching for 1 thing.");
  const off = await runDoctor({ ...allOn, watchers: false }, sources({ watchers: list }), reads, now);
  assert.equal(off.checks.find((check) => check.name === "Watchers")?.state, "off");
  assert.equal(asked, 1);
  const missing = await runDoctor(allOn, sources(), reads, now);
  assert.equal(missing.checks.find((check) => check.name === "Watchers")?.state, "off");
});

test("running the doctor passes the tries' latest outcomes, the time and the expiry list's own time through", async () => {
  const given = sources();
  given.heartbeat?.failed(new Date("2026-11-26T11:00:00Z"));
  given.alerts?.ok(new Date("2026-11-26T10:00:00Z"));
  let listTime: Date | null = null;
  const report = await runDoctor(allOn, { ...given, expiries: async (at) => ((listTime = at), [item("Alpha", -1)]) }, reads, now);
  assert.equal(listTime, now);
  assert.deepEqual(report.checks.filter((check) => ["Heartbeat", "Phone alerts", "Expiry list"].includes(check.name)).map((check) => check.state), ["problem", "ok", "problem"]);
  assert.equal(report.checkedAt, now.toISOString());
  const untried = await runDoctor(allOn, { ...sources(), heartbeat: undefined, alerts: undefined }, reads, now);
  assert.deepEqual(untried.checks.filter((check) => ["Heartbeat", "Phone alerts"].includes(check.name)).map((check) => check.state), ["warn", "warn"]);
});

test("one slow or failing source doesn't hold up or spoil the others", async () => {
  const started = Date.now();
  const report = await runDoctor(allOn, sources({ waitMs: 50, trains: () => new Promise(() => {}), downloads: async () => Promise.reject(new Error("qBittorrent replied 500")) }), reads, now);
  const byName = Object.fromEntries(report.checks.map((check) => [check.name, check]));
  assert.equal(byName["Train times"].detail, "The departure board didn't answer: no answer within 0.05 seconds.");
  assert.equal(byName.qBittorrent.detail, "Didn't answer: qBittorrent replied 500.");
  assert.equal(byName.Jellyfin.state, "ok");
  const hung = await runDoctor(allOn, sources({ waitMs: 50, downloads: () => new Promise(() => {}), library: () => new Promise(() => {}), inbox: () => new Promise(() => {}), expiries: () => new Promise(() => {}) }), reads, now);
  const hungByName = Object.fromEntries(hung.checks.map((check) => [check.name, check]));
  assert.deepEqual(["qBittorrent", "Jellyfin", "Brain inbox", "Expiry list"].map((name) => hungByName[name].state), ["problem", "problem", "problem", "problem"]);
  assert.equal(hungByName.Jellyfin.detail, "Didn't answer: no answer within 0.05 seconds.");
  assert.equal(hungByName["Expiry list"].detail, "no answer within 0.05 seconds.");
  assert.ok(Date.now() - started < 3_000);
});

test("the doctor waits 6 seconds at most for each source, under the 10 seconds Claude Code's tools wait for the API", () => {
  assert.equal(doctorWaitMs, 6_000);
});

test("an unreadable backup status is a warning, not a failure of the whole check", async () => {
  const report = await runDoctor(allOn, sources(), { ...reads, backup: async () => Promise.reject(new Error("EACCES")) }, now);
  assert.equal(report.checks.find((check) => check.name === "Backups")?.detail, "Couldn't read the backup status.");
});

test("a kept source is asked once for everyone who asks within 10 seconds, even while the first ask is still out, and again after that", async () => {
  assert.equal(doctorKeepMs, 10_000);
  let at = 0;
  let calls = 0;
  const waiting: ((value: number) => void)[] = [];
  const source = kept(() => new Promise<number>((resolve) => waiting.push(resolve)).then((value) => value + ++calls * 100), doctorKeepMs, () => at);
  const first = source();
  at = 9_999;
  const second = source();
  await Promise.resolve();
  assert.equal(waiting.length, 1, "the second ask joins the first, which hasn't answered yet");
  waiting[0](1);
  assert.deepEqual(await Promise.all([first, second]), [101, 101]);
  assert.equal(await source(), 101, "still inside the 10 seconds, so the answer is reused");
  at = 10_000;
  const third = source();
  await Promise.resolve();
  assert.equal(waiting.length, 2, "10 seconds on, it asks again");
  waiting[1](2);
  assert.equal(await third, 202);
});

test("a kept source doesn't keep a failure: the next ask tries again, and one that throws straight away counts as a failure", async () => {
  let at = 0;
  const signals: AbortSignal[] = [];
  const failing = kept(async (signal) => {
    signals.push(signal);
    throw new Error(`refused ${signals.length}`);
  }, doctorKeepMs, () => at);
  await assert.rejects(failing(), { message: "refused 1" });
  await assert.rejects(failing(), { message: "refused 2" });
  at = 1;
  await assert.rejects(failing(), { message: "refused 3" });
  assert.deepEqual(signals.map((signal) => [signal instanceof AbortSignal, signal.aborted]), [[true, false], [true, false], [true, false]]);
  const throwing = kept((): Promise<number> => {
    throw new Error("broke before asking");
  });
  await assert.rejects(throwing(), { message: "broke before asking" });
  assert.deepEqual(await ask(throwing, 50), { failed: "broke before asking" });
  let calls = 0;
  const flaky = kept(async () => {
    calls++;
    if (calls === 1) throw new Error("down");
    return calls;
  }, doctorKeepMs, () => at);
  await assert.rejects(flaky(), { message: "down" });
  assert.deepEqual([await flaky(), await flaky()], [2, 2], "a good answer after a failure is kept as usual");
});

test("someone who joins a kept call that never answers is told it didn't answer within 6 seconds, in words, and the next ask tries again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let at = 0;
  let calls = 0;
  const hanging = kept((signal) => {
    calls++;
    return new Promise<number>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  }, doctorKeepMs, () => at);
  const first = hanging();
  at = 2_000;
  const joined = hanging();
  await Promise.resolve();
  assert.equal(calls, 1);
  const outcomes = Promise.allSettled([first, joined]);
  t.mock.timers.tick(doctorWaitMs);
  const settled = await outcomes;
  assert.deepEqual(settled.map((outcome) => (outcome.status === "rejected" ? (outcome.reason as Error).message : "answered")), ["no answer within 6 seconds", "no answer within 6 seconds"]);
  at = 7_000;
  void hanging().catch(() => {});
  await Promise.resolve();
  assert.equal(calls, 2, "the failure isn't kept, so a later ask inside the 10 seconds asks again");
});

test("an old kept call that fails late doesn't throw away a newer answer", async () => {
  let at = 0;
  const failLate: Array<(reason: Error) => void> = [];
  let calls = 0;
  const source = kept(() => {
    calls++;
    if (calls === 1) return new Promise<number>((_, reject) => failLate.push(reject));
    return Promise.resolve(calls);
  }, 1_000, () => at);
  const first = source();
  at = 2_000;
  assert.equal(await source(), 2);
  failLate[0]?.(new Error("late"));
  await assert.rejects(first, { message: "late" });
  await new Promise((resolve) => setImmediate(resolve));
  at = 2_500;
  assert.equal(await source(), 2, "the newer answer is still the one kept");
  assert.equal(calls, 2);
});

test("the time limit a kept source gives its call is the doctor's longest wait, so a call nobody is waiting for any more is dropped", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const hanging = kept((given) => {
    signal = given;
    return new Promise<number>(() => {});
  });
  void hanging();
  await Promise.resolve();
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(doctorWaitMs - 1);
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal?.aborted, true);
  let answered: AbortSignal | undefined;
  const quick = kept(async (given) => {
    answered = given;
    return 1;
  });
  assert.equal(await quick(), 1);
  t.mock.timers.tick(doctorWaitMs);
  assert.equal(answered?.aborted, false, "once it has answered, its limit is cleared");
});
