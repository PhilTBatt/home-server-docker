import type { RepoReport } from "../catchup/catchup.js";
import type { ChoreResult } from "../chores/chores.js";
import { londonNow } from "../trains/alerts.js";

export const codeSuites = [
  { id: "api", name: "The API" },
  { id: "mcp", name: "The hub's tools" },
  { id: "jarvis", name: "Jarvis" },
  { id: "ears", name: "Ears" },
] as const;
export const heatDays = 28;
export const latestShown = 5;
export const mostMessage = 60;
export const mostRepoName = 40;
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type Suite = { id: string; name: string; tests: number; pass: number; fail: number };
export type Tests = { at: string; ok: boolean; timedOut: boolean; suites: Suite[] } | { none: "chores-off" | "not-run" };
export type HeatDay = { day: string; weekday: string; count: number; known: boolean };
export type LatestCommit = { sha: string; what: string; at: string; repo: string };
export type Commits = { days: HeatDay[]; total: number; more: boolean; latest: LatestCommit[]; repos: number; failed: string[] } | { none: "catch-up-off" | "no-repos" };
export type CodePage = { kind: "code"; tests: Tests; commits: Commits };

function cut(text: string, most: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > most ? `${flat.slice(0, most - 1)}…` : flat;
}

export function readSuites(output: string[]): Suite[] {
  const found = new Map<string, { tests: number; pass: number; fail: number }>();
  let current: string | null = null;
  for (const line of output) {
    const header = /^== ([a-z]+)$/.exec(line);
    if (header !== null) {
      current = codeSuites.some((suite) => suite.id === header[1]) ? header[1] : null;
      if (current !== null) found.set(current, { tests: 0, pass: 0, fail: 0 });
      continue;
    }
    const count = /^(?:ℹ|#) (tests|pass|fail) (\d{1,7})$/.exec(line);
    if (current === null || count === null) continue;
    const kept = found.get(current);
    if (kept !== undefined) kept[count[1] as "tests" | "pass" | "fail"] = Number(count[2]);
  }
  return codeSuites.flatMap((suite) => {
    const kept = found.get(suite.id);
    return kept === undefined ? [] : [{ id: suite.id, name: suite.name, ...kept }];
  });
}

export function testsOf(result: ChoreResult | null, choresOn: boolean): Tests {
  if (!choresOn) return { none: "chores-off" };
  if (result === null || result.endedAt === null) return { none: "not-run" };
  return { at: result.endedAt, ok: result.exit === 0, timedOut: result.timedOut === true, suites: readSuites(result.output) };
}

export function commitsOf(reports: RepoReport[] | null, now: Date): Commits {
  if (reports === null) return { none: "catch-up-off" };
  if (reports.length === 0) return { none: "no-repos" };
  const [year, month, date] = londonNow(now).day.split("-").map(Number);
  const days: HeatDay[] = Array.from({ length: heatDays }, (_, i) => {
    const at = new Date(Date.UTC(year, month - 1, date - (heatDays - 1 - i), 12));
    return { day: at.toISOString().slice(0, 10), weekday: weekdays[at.getUTCDay()], count: 0, known: true };
  });
  let knownFrom = "";
  const all: LatestCommit[] = [];
  let more = false;
  const failed: string[] = [];
  for (const report of reports) {
    if ("failed" in report) {
      failed.push(cut(report.repo.split("/")[1] ?? report.repo, mostRepoName));
      continue;
    }
    more = more || report.more;
    const oldest = report.days.reduce((first, day) => (first === "" || day.day < first ? day.day : first), "");
    if (report.more && oldest > knownFrom) knownFrom = oldest;
    for (const day of report.days) {
      const slot = days.find((one) => one.day === day.day);
      if (slot !== undefined) slot.count += day.commits.length;
      for (const commit of day.commits) all.push({ sha: commit.sha.slice(0, 7), what: cut(commit.message, mostMessage), at: commit.at, repo: cut(report.repo.split("/")[1] ?? report.repo, mostRepoName) });
    }
  }
  all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const day of days) day.known = knownFrom === "" || day.day > knownFrom;
  return { days, total: days.reduce((sum, day) => sum + day.count, 0), more, latest: all.slice(0, latestShown), repos: reports.length, failed };
}

export function codePage(tests: Tests, commits: Commits): CodePage {
  return { kind: "code", tests, commits };
}
