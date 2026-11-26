import type { Features } from "../../config.js";
import { whenText, type ExpiryStatus } from "../expiry/checker.js";
import { formatLondonTime } from "../notify/daily.js";
import type { Problem, Status } from "./alerts.js";
import type { BackupState } from "./backup.js";
import type { WatcherView } from "../watchers/watchers.js";

export type CheckState = "ok" | "warn" | "problem" | "off";

export type Check = {
  name: string;
  state: CheckState;
  detail: string;
  next: string | null;
};

export type DoctorReport = {
  state: Exclude<CheckState, "off">;
  summary: string;
  checkedAt: string;
  checks: Check[];
};

export type Tried = { at: string; ok: boolean };

export type Tries = {
  ok(at: Date): void;
  failed(at: Date): void;
  last(): Tried | null;
};

export type Got<Value> = { value: Value } | { failed: string };

export type LibraryCounts = { movies: number; series: number; episodes: number };

export type Seen = {
  features: Features;
  problems: Problem[];
  status: Status;
  backup: BackupState | null;
  heartbeat: Tried | null;
  alerts: Tried | null;
  downloads: Got<unknown[]>;
  library: Got<LibraryCounts>;
  inbox: Got<number> | null;
  trains: Got<unknown> | null;
  expiries: Got<ExpiryStatus[]> | null;
  watchers: WatcherView[] | null;
};

export type DoctorSources = {
  heartbeat?: Tries;
  alerts?: Tries;
  downloads: (signal: AbortSignal) => Promise<unknown[]>;
  library: (signal: AbortSignal) => Promise<LibraryCounts>;
  inbox: () => Promise<number>;
  trains: () => Promise<unknown>;
  expiries?: (now: Date) => Promise<ExpiryStatus[]>;
  watchers?: () => WatcherView[];
  waitMs?: number;
};

export const doctorWaitMs = 6_000;
export const diskWarnFraction = 0.2;
export const backupStaleDays = 7;
export const expirySoonDays = 7;
const dayMs = 24 * 60 * 60 * 1000;

export function createTries(): Tries {
  let last: Tried | null = null;
  return {
    ok(at) {
      last = { at: at.toISOString(), ok: true };
    },
    failed(at) {
      last = { at: at.toISOString(), ok: false };
    },
    last: () => last,
  };
}

export const reasonMost = 200;

function reasonOf(error: unknown): string {
  const text = (error instanceof Error ? error.message : "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  if (text === "") return "no reason given";
  if (text.length <= reasonMost) return text;
  const cut = text.slice(0, reasonMost - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > reasonMost / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:(]+$/, "")}\u2026`;
}

function sentence(text: string): string {
  return /[.!?\u2026]$/.test(text) ? text : `${text}.`;
}

export async function ask<Value>(asking: (signal: AbortSignal) => Promise<Value>, waitMs = doctorWaitMs): Promise<Got<Value>> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<Got<Value>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ failed: `no answer within ${waitMs / 1000} seconds` });
    }, waitMs);
  });
  try {
    const answer = Promise.resolve()
      .then(() => asking(controller.signal))
      .then(
        (value): Got<Value> => ({ value }),
        (error: unknown): Got<Value> => ({ failed: reasonOf(error) }),
      );
    return await Promise.race([answer, late]);
  } finally {
    clearTimeout(timer);
  }
}

function off(name: string, setting: string): Check {
  return { name, state: "off", detail: `Switched off (${setting}).`, next: null };
}

function found(problems: Problem[], code: Problem["code"]): Problem | undefined {
  return problems.find((problem) => problem.code === code);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function diskCheck(seen: Seen): Check {
  const name = "Disk";
  const { diskAvailableGB: free, diskTotalGB: total } = seen.status;
  const low = found(seen.problems, "disk-low");
  if (low !== undefined) return { name, state: "problem", detail: low.message, next: "docker system df shows how much Docker's images, containers and build cache use, which is often the easiest space to free." };
  if (free < total * diskWarnFraction) return { name, state: "warn", detail: `${free} of ${total} GB free, under a fifth.`, next: "Free some space before it falls under a tenth, when it becomes an alert. docker system df shows what Docker uses." };
  return { name, state: "ok", detail: `${free} of ${total} GB free.`, next: null };
}

function memoryCheck(seen: Seen): Check {
  const name = "Memory";
  const low = found(seen.problems, "memory-low");
  if (low !== undefined) return { name, state: "problem", detail: low.message, next: "docker stats --no-stream shows which containers use the most." };
  const gb = (mb: number) => (mb / 1024).toFixed(1);
  return { name, state: "ok", detail: `${gb(seen.status.memoryAvailableMB)} of ${gb(seen.status.memoryTotalMB)} GB available.`, next: null };
}

function wifiCheck(seen: Seen): Check {
  const name = "Wi-Fi";
  const reconnects = found(seen.problems, "wifi-reconnects");
  if (reconnects !== undefined) return { name, state: "warn", detail: reconnects.message, next: "The hub page's Wi-Fi section says when. If it keeps happening, the watchdog's log is /var/log/wifi-watchdog/reconnects.log." };
  return { name, state: "ok", detail: "No reconnects in the last 24 hours.", next: null };
}

function backupCheck(seen: Seen, now: Date): Check {
  const name = "Backups";
  const backup = seen.backup;
  if (backup === null) return { name, state: "warn", detail: "Couldn't read the backup status.", next: "The API reads it from /var/lib/home-hub, which the backup script writes after each real run." };
  if (backup.lastRun === null) return { name, state: "off", detail: "No backup has run yet.", next: null };
  const lastGood = backup.lastSuccess === null ? "There's no good backup yet." : `The last good one was ${formatLondonTime(backup.lastSuccess)}.`;
  const failed = found(seen.problems, "backup-failed");
  if (failed !== undefined) return { name, state: "problem", detail: `${failed.message} ${lastGood}`, next: "journalctl -u home-hub-backup -n 30 shows the last run's log, and sudo home-hub-backup --dry-run what a run would do." };
  const good = backup.lastRun.time;
  const age = now.getTime() - Date.parse(good);
  if (!(age <= backupStaleDays * dayMs)) return { name, state: "warn", detail: `The last good backup was ${formatLondonTime(good)}, more than a week ago.`, next: "The nightly timer may be off: systemctl status home-hub-backup.timer says." };
  return { name, state: "ok", detail: `The last good backup was ${formatLondonTime(good)}.`, next: null };
}

function heartbeatCheck(seen: Seen): Check {
  const name = "Heartbeat";
  if (!seen.features.heartbeat) return off(name, "HEARTBEAT");
  const last = seen.heartbeat;
  if (last === null) return { name, state: "warn", detail: "No ping to Healthchecks.io has finished since the API started.", next: "It pings every 5 minutes, so ask again in a few minutes." };
  if (!last.ok) return { name, state: "problem", detail: `The last ping to Healthchecks.io, ${formatLondonTime(last.at)}, failed.`, next: "docker compose logs --tail 20 api shows why: look for heartbeat failed." };
  return { name, state: "ok", detail: `The last ping to Healthchecks.io went ${formatLondonTime(last.at)}.`, next: null };
}

function alertsCheck(seen: Seen): Check {
  const name = "Phone alerts";
  if (!seen.features.alerts) return off(name, "ALERTS");
  const last = seen.alerts;
  if (last === null) return { name, state: "warn", detail: "No alert check has finished since the API started.", next: "It checks every 5 minutes, so ask again in a few minutes." };
  if (!last.ok) return { name, state: "problem", detail: `The last alert check, ${formatLondonTime(last.at)}, couldn't finish, so a change may not have reached your phone.`, next: "docker compose logs --tail 20 api shows why: look for notification check failed." };
  return { name, state: "ok", detail: `The last alert check, ${formatLondonTime(last.at)}, worked.`, next: null };
}

function serviceCheck(name: string, service: string, seen: Got<unknown>, said: string): Check {
  if ("failed" in seen) return { name, state: "problem", detail: sentence(`Didn't answer: ${seen.failed}`), next: `docker compose ps ${service} shows whether it's running, and docker compose logs --tail 20 ${service} what it last said.` };
  return { name, state: "ok", detail: said, next: null };
}

function downloadsCheck(seen: Seen): Check {
  const count = "value" in seen.downloads ? seen.downloads.value.length : 0;
  return serviceCheck("qBittorrent", "qbittorrent", seen.downloads, `Answering, with ${count} downloading.`);
}

function libraryCheck(seen: Seen): Check {
  const counts = "value" in seen.library ? seen.library.value : null;
  return serviceCheck("Jellyfin", "jellyfin", seen.library, counts === null ? "" : `Answering, with ${plural(counts.movies, "movie")} and ${counts.series} series.`);
}

function inboxCheck(seen: Seen): Check {
  const name = "Brain inbox";
  if (!seen.features.memoryInbox || seen.inbox === null) return off(name, "MEMORY_INBOX");
  if ("failed" in seen.inbox) return { name, state: "problem", detail: "Couldn't read the brain inbox.", next: "The API reads ~/hub-memory/inbox through a mount, so check that folder is still there and readable: ls -ld ~/hub-memory/inbox." };
  return { name, state: "ok", detail: `${seen.inbox.value === 0 ? "No" : seen.inbox.value} note${seen.inbox.value === 1 ? "" : "s"} waiting.`, next: null };
}

function dealsCheck(seen: Seen): Check {
  const name = "Deal watcher";
  if (!seen.features.deals) return off(name, "DEALS");
  const mine = seen.problems.filter((problem) => problem.code.startsWith("deals-"));
  const serious = mine.filter((problem) => problem.code !== "deals-limit");
  if (serious.length > 0) return { name, state: "problem", detail: mine.map((problem) => problem.message).join(" "), next: "The hub page's Deals section, or get_deal_status and get_deal_searches, say more, and docs/deals.md explains each setting." };
  if (mine.length > 0) return { name, state: "warn", detail: mine.map((problem) => problem.message).join(" "), next: "Nothing to do unless it happens most days, when fewer or less frequent searches would help." };
  return { name, state: "ok", detail: "No problems.", next: null };
}

function trainsCheck(seen: Seen): Check {
  const name = "Train times";
  if (!seen.features.trains || seen.trains === null) return off(name, "TRAINS");
  if ("failed" in seen.trains) return { name, state: "problem", detail: sentence(`The departure board didn't answer: ${seen.trains.failed}`), next: "Ask again in a minute. If it keeps failing, docker compose logs --tail 20 api shows when it started." };
  return { name, state: "ok", detail: "The departure board answered.", next: null };
}

function expiryCheck(seen: Seen): Check {
  const name = "Expiry list";
  if (!seen.features.expiryAlerts || seen.expiries === null) return off(name, "EXPIRY_ALERTS");
  const unsaved = found(seen.problems, "expiry-state");
  if ("failed" in seen.expiries) return { name, state: "problem", detail: [sentence(seen.expiries.failed), unsaved?.message].filter((line) => line !== undefined).join(" "), next: "GET /expiry, or get_expiries, says what's wrong with expiry/items.json." };
  const items = seen.expiries.value;
  const overdue = items.filter((item) => item.overdue);
  const soon = items.filter((item) => !item.overdue && item.daysLeft <= expirySoonDays);
  const lines = [...overdue.map((item) => `${item.name} ${whenText(item.daysLeft)}.`), ...soon.map((item) => `${item.name} expires ${whenText(item.daysLeft)}.`)];
  if (unsaved !== undefined) return { name, state: "problem", detail: [...lines, unsaved.message].join(" "), next: "The API couldn't write expiry/sent.json: check the expiry folder is still there and the API may write to it." };
  if (overdue.length > 0) return { name, state: "problem", detail: lines.join(" "), next: "Renew it, then change its date in expiry/items.json." };
  if (soon.length > 0) return { name, state: "warn", detail: lines.join(" "), next: "Renew it, then change its date in expiry/items.json." };
  return { name, state: "ok", detail: `Nothing due in the next ${expirySoonDays} days, with ${plural(items.length, "item")} on the list.`, next: null };
}

function watchersCheck(seen: Seen): Check {
  const name = "Watchers";
  if (!seen.features.watchers || seen.watchers === null) return off(name, "WATCHERS");
  const unread = seen.watchers.filter((watcher) => watcher.lastCheck?.ok === false);
  const unsent = seen.watchers.filter((watcher) => watcher.waitingToSend);
  const lines = [...unread.map((watcher) => `Couldn't check for ${watcher.what} last time.`), ...unsent.map((watcher) => `It happened, but the notification for ${watcher.what} couldn't be sent yet.`)];
  if (lines.length > 0) return { name, state: "warn", detail: lines.join(" "), next: "GET /watchers, or get_watchers, shows each one's last check. docker compose logs --tail 20 api shows why a notification couldn't be sent." };
  const count = seen.watchers.length;
  return { name, state: "ok", detail: count === 0 ? "Nothing being watched." : `Watching for ${plural(count, "thing")}.`, next: null };
}

function listed(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function summaryOf(checks: Check[]): string {
  const named = (state: CheckState) => checks.filter((check) => check.state === state).map((check) => check.name);
  const problems = named("problem");
  const warns = named("warn");
  if (problems.length === 0 && warns.length === 0) {
    const offCount = named("off").length;
    return `Everything's OK: ${plural(named("ok").length, "check")} fine${offCount === 0 ? "" : `, ${offCount} switched off`}.`;
  }
  const parts: string[] = [];
  if (problems.length > 0) parts.push(`${plural(problems.length, "problem")}: ${listed(problems)}.`);
  if (warns.length > 0) parts.push(`${plural(warns.length, "thing")} to look at: ${listed(warns)}.`);
  return parts.join(" ");
}

export function examine(seen: Seen, now: Date): DoctorReport {
  const checks = [diskCheck(seen), memoryCheck(seen), wifiCheck(seen), backupCheck(seen, now), heartbeatCheck(seen), alertsCheck(seen), downloadsCheck(seen), libraryCheck(seen), inboxCheck(seen), dealsCheck(seen), trainsCheck(seen), expiryCheck(seen), watchersCheck(seen)];
  const state = checks.some((check) => check.state === "problem") ? "problem" : checks.some((check) => check.state === "warn") ? "warn" : "ok";
  return { state, summary: summaryOf(checks), checkedAt: now.toISOString(), checks };
}

export async function runDoctor(
  features: Features,
  sources: DoctorSources,
  read: { problems: () => Promise<Problem[]>; status: () => Promise<Status>; backup: () => Promise<BackupState> },
  now: Date,
): Promise<DoctorReport> {
  const waitMs = sources.waitMs ?? doctorWaitMs;
  const expiries = sources.expiries;
  const [problems, status, backup, downloads, library, inbox, trains, expiring] = await Promise.all([
    read.problems(),
    read.status(),
    read.backup().catch(() => null),
    ask(sources.downloads, waitMs),
    ask(sources.library, waitMs),
    features.memoryInbox ? ask(() => sources.inbox(), waitMs) : null,
    features.trains ? ask(() => sources.trains(), waitMs) : null,
    features.expiryAlerts && expiries !== undefined ? ask(() => expiries(now), waitMs) : null,
  ]);
  return examine({ features, problems, status, backup, heartbeat: sources.heartbeat?.last() ?? null, alerts: sources.alerts?.last() ?? null, downloads, library, inbox, trains, expiries: expiring, watchers: features.watchers && sources.watchers !== undefined ? sources.watchers() : null }, now);
}
