import type { ExpiryStatus } from "../expiry/checker.js";
import { formatLondonTime, londonTime } from "../notify/daily.js";
import type { Problem } from "../system/alerts.js";
import type { BackupState } from "../system/backup.js";
import { ask, expirySoonDays, type DoctorReport } from "../system/doctor.js";
import type { WatcherView } from "../watchers/watchers.js";
import { fetchCommits, GithubRefused, type Commit, type Commits } from "./github.js";

export type HubSources = {
  server: () => Promise<Pick<DoctorReport, "state" | "summary">>;
  problems: () => Promise<Problem[]>;
  backup: () => Promise<BackupState>;
  inbox?: () => Promise<number>;
  expiries?: (now: Date) => Promise<ExpiryStatus[]>;
  watchers?: () => WatcherView[];
};

export type CatchUpOptions = {
  repos: string[];
  token: string;
  hub: HubSources;
  fetcher?: typeof fetch;
  githubMs?: number;
  waitMs?: number;
  keepMs?: number;
  retryMs?: number;
};

export type Day = { day: string; commits: Commit[] };

export type RepoReport = { repo: string; count: number; more: boolean; latestAt: string | null; days: Day[] } | { repo: string; failed: string };

type Got<Value> = Value | { failed: string };

type Part<Value> = Got<Value> | { off: string };

export type CatchUpReport = {
  days: number;
  since: string;
  checkedAt: string;
  commitsAskedAt: string | null;
  summary: string;
  repos: RepoReport[];
  waiting: {
    inbox: Part<{ notes: number }>;
    expiring: Part<{ within: number; items: ExpiryStatus[] }>;
    watchers: Part<{ watching: string[] }>;
    problems: Got<{ messages: string[] }>;
  };
  backup: Got<BackupState>;
  server: Got<Pick<DoctorReport, "state" | "summary">>;
};

export type CatchUp = { read(days: number, now: Date): Promise<CatchUpReport> };

export const hubWaitMs = 5_000;
export const catchUpDoctorMs = 4_000;
export const keepCommitsMs = 10 * 60 * 1000;
export const retryCommitsMs = 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const hourMs = 60 * 60 * 1000;

export function londonDaysStart(now: Date, days: number): Date {
  const [year, month, day] = londonTime(now).day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  const targetDay = target.toISOString().slice(0, 10);
  const start = [0, 1].map((hours) => new Date(target.getTime() - hours * hourMs)).find((at) => londonTime(at).day === targetDay && londonTime(at).hour === 0);
  return start ?? target;
}

type Asked = { at: number | null; answer: Promise<RepoReport>; failed: boolean | null };

export function byDay(commits: Commit[]): Day[] {
  const days: Day[] = [];
  for (const commit of [...commits].sort((a, b) => b.at.localeCompare(a.at))) {
    const day = londonTime(new Date(commit.at)).day;
    const last = days[days.length - 1];
    if (last !== undefined && last.day === day) last.commits.push(commit);
    else days.push({ day, commits: [commit] });
  }
  return days;
}

export function repoReport(repo: string, got: Commits): RepoReport {
  const days = byDay(got.commits);
  return { repo, count: got.commits.length, more: got.more, latestAt: days[0]?.commits[0].at ?? null, days };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function listed(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function has<Value extends object>(part: Part<Value>): part is Value {
  return !("off" in part) && !("failed" in part);
}

export function summaryOf(report: Omit<CatchUpReport, "summary">): string {
  const lines: string[] = [];
  const span = report.days === 1 ? "the last day" : `the last ${report.days} days`;
  const read = report.repos.flatMap((repo) => ("failed" in repo ? [] : [repo]));
  const failed = report.repos.flatMap((repo) => ("failed" in repo ? [repo.repo] : []));
  if (report.repos.length === 0) lines.push("No repos are listed in CATCH_UP_REPOS.");
  else {
    const busy = read.filter((repo) => repo.count > 0);
    const total = busy.reduce((sum, repo) => sum + repo.count, 0);
    if (total === 0 && read.length > 0) lines.push(`No commits in ${span}${failed.length > 0 ? " in the repos that could be read" : ""}.`);
    if (total > 0) {
      const latest = [...busy].sort((a, b) => (b.latestAt ?? "").localeCompare(a.latestAt ?? ""))[0];
      const atLeast = busy.some((repo) => repo.more) ? "At least " : "";
      lines.push(`${atLeast}${plural(total, "commit")} in ${span}, in ${busy.length} of ${plural(report.repos.length, "repo")}; the latest was in ${latest.repo}, ${formatLondonTime(latest.latestAt ?? "")}.`);
    }
    if (failed.length > 0) lines.push(`Couldn't read ${listed(failed)}.`);
  }
  const waiting: string[] = [];
  const { inbox, expiring, watchers, problems } = report.waiting;
  if (has(inbox) && inbox.notes > 0) waiting.push(`${plural(inbox.notes, "note")} in the brain inbox`);
  if (has(expiring) && expiring.items.length > 0) waiting.push(`${plural(expiring.items.length, "thing")} expiring within ${expiring.within} days or overdue`);
  if (has(watchers) && watchers.watching.length > 0) waiting.push(`${plural(watchers.watching.length, "watcher")} still waiting`);
  if (has(problems) && problems.messages.length > 0) waiting.push(`${plural(problems.messages.length, "problem")} in the alerts`);
  if (waiting.length > 0) lines.push(`Waiting: ${listed(waiting)}.`);
  if (has(report.server)) lines.push(`Server: ${report.server.summary}`);
  else if ("failed" in report.server) lines.push("Couldn't ask the server doctor.");
  return lines.join(" ");
}

async function read<Value, Shown>(source: () => Promise<Value>, show: (value: Value) => Shown, waitMs: number): Promise<Got<Shown>> {
  const got = await ask(() => source(), waitMs);
  return "failed" in got ? { failed: got.failed } : show(got.value);
}

async function part<Value, Shown>(source: (() => Promise<Value>) | undefined, setting: string, show: (value: Value) => Shown, waitMs: number): Promise<Part<Shown>> {
  return source === undefined ? { off: setting } : read(source, show, waitMs);
}

export function createCatchUp(options: CatchUpOptions): CatchUp {
  const asked = new Map<string, Asked>();
  let waitUntil = 0;
  const keepMs = options.keepMs ?? keepCommitsMs;
  const retryMs = options.retryMs ?? retryCommitsMs;
  const waitMs = options.waitMs ?? hubWaitMs;
  const hub = options.hub;

  const askGithub = (repo: string, days: number, now: Date): Asked => {
    const entry: Asked = {
      at: now.getTime(),
      failed: null,
      answer: fetchCommits(repo, londonDaysStart(now, days), { token: options.token, fetcher: options.fetcher, ms: options.githubMs, now: now.getTime() }).then(
        (got) => {
          entry.failed = false;
          return repoReport(repo, got);
        },
        (error: unknown): RepoReport => {
          entry.failed = true;
          if (error instanceof GithubRefused && error.waitUntil !== null) waitUntil = Math.max(waitUntil, error.waitUntil);
          return { repo, failed: error instanceof Error ? error.message : "no reason given" };
        },
      ),
    };
    return entry;
  };

  const commitsFor = (repo: string, days: number, now: Date): Asked => {
    const key = `${days} ${repo}`;
    const cached = asked.get(key);
    if (cached !== undefined && cached.at !== null && now.getTime() - cached.at < (cached.failed === true ? retryMs : keepMs)) return cached;
    if (now.getTime() < waitUntil) return { at: null, failed: true, answer: Promise.resolve({ repo, failed: `not asked: GitHub said to wait until ${formatLondonTime(new Date(waitUntil).toISOString())}` }) };
    const fresh = askGithub(repo, days, now);
    asked.set(key, fresh);
    return fresh;
  };

  return {
    async read(days, now) {
      const github = options.repos.map((repo) => commitsFor(repo, days, now));
      const askedAt = github.flatMap((entry) => (entry.at === null ? [] : [entry.at]));
      const expiries = hub.expiries;
      const watchers = hub.watchers;
      const [repos, inbox, expiring, watching, problems, backup, server] = await Promise.all([
        Promise.all(github.map((entry) => entry.answer)),
        part(hub.inbox, "MEMORY_INBOX", (notes) => ({ notes }), waitMs),
        part(expiries === undefined ? undefined : () => expiries(now), "EXPIRY_ALERTS", (items) => ({ within: expirySoonDays, items: items.filter((item) => item.daysLeft <= expirySoonDays) }), waitMs),
        part(watchers === undefined ? undefined : async () => watchers(), "WATCHERS", (list) => ({ watching: list.map((watcher) => watcher.what) }), waitMs),
        read(hub.problems, (list) => ({ messages: list.map((problem) => problem.message) }), waitMs),
        read(hub.backup, (state) => state, waitMs),
        read(hub.server, (report) => ({ state: report.state, summary: report.summary }), waitMs),
      ]);
      const report = {
        days,
        since: londonDaysStart(now, days).toISOString(),
        checkedAt: now.toISOString(),
        commitsAskedAt: askedAt.length === 0 ? null : new Date(Math.min(...askedAt)).toISOString(),
        repos,
        waiting: { inbox, expiring, watchers: watching, problems },
        backup,
        server,
      };
      return { ...report, summary: summaryOf(report) };
    },
  };
}
