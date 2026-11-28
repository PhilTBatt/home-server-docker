import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepoReport } from "../catchup/catchup.js";
import type { ChoreResult } from "../chores/chores.js";
import { codePage, commitsOf, heatDays, latestShown, readSuites, testsOf } from "./code.js";

const output = ["== api", "ℹ tests 1814", "ℹ pass 1814", "ℹ fail 0", "ℹ skipped 0", "== mcp", "ℹ tests 186", "ℹ pass 186", "ℹ fail 0", "== jarvis", "# tests 1941", "# pass 1940", "# fail 1", "== ears", "ℹ tests 487", "ℹ pass 485", "ℹ fail 0", "ℹ skipped 2"];
const result = (over: Partial<ChoreResult> = {}): ChoreResult => ({ id: "0123456789abcdef", state: "done", job: "run-tests", exit: 0, timedOut: false, seconds: 400, startedAt: "2026-11-30T09:00:00Z", endedAt: "2026-11-30T09:06:40Z", limitSeconds: 2400, why: null, output, ...over });

test("the test counts come from the run-tests chore's output, a suite each, in a fixed order", () => {
  assert.deepEqual(readSuites(output), [
    { id: "api", name: "The API", tests: 1814, pass: 1814, fail: 0 },
    { id: "mcp", name: "The hub's tools", tests: 186, pass: 186, fail: 0 },
    { id: "jarvis", name: "Jarvis", tests: 1941, pass: 1940, fail: 1 },
    { id: "ears", name: "Ears", tests: 487, pass: 485, fail: 0 },
  ]);
  assert.deepEqual(readSuites(["== ears", "ℹ tests 5", "== api", "ℹ tests 9"]).map((suite) => [suite.id, suite.tests]), [["api", 9], ["ears", 5]]);
  assert.deepEqual(readSuites(["ℹ tests 5", "== other", "ℹ tests 9", "== api; rm", "ℹ tests 1", "== api", "ℹ tests 12345678", "ℹ tests 3 more"]), [{ id: "api", name: "The API", tests: 0, pass: 0, fail: 0 }], "only known suites and plain counts are read");
  assert.deepEqual(readSuites([]), []);
});

test("the tests part says when they last ran and whether they passed, or why there's nothing", () => {
  assert.deepEqual(testsOf(result(), true), { at: "2026-11-30T09:06:40Z", ok: true, timedOut: false, suites: readSuites(output) });
  assert.deepEqual([testsOf(result({ exit: 1 }), true), testsOf(result({ exit: 124, timedOut: true }), true)].map((tests) => ("ok" in tests ? [tests.ok, tests.timedOut] : null)), [[false, false], [false, true]]);
  assert.deepEqual(testsOf(null, true), { none: "not-run" });
  assert.deepEqual(testsOf(result(), false), { none: "chores-off" });
  assert.deepEqual(testsOf(result({ endedAt: null }), true), { none: "not-run" });
});

const now = new Date("2026-11-30T12:00:00.000Z");
const repo = (name: string, commits: [string, string, string][], more = false): RepoReport => {
  const byDay = new Map<string, { sha: string; at: string; message: string }[]>();
  for (const [sha, at, message] of commits) byDay.set(at.slice(0, 10), [...(byDay.get(at.slice(0, 10)) ?? []), { sha, at, message }]);
  return { repo: name, count: commits.length, more, latestAt: commits[0]?.[1] ?? null, days: [...byDay].map(([day, list]) => ({ day, commits: list })) };
};

test("commits are counted for each of the last four weeks' days, London's, across every repo, with the latest five", () => {
  const commits = commitsOf([
    repo("alpha/home-server-docker", [["aaaaaaa1111", "2026-11-30T10:00:00Z", "Add the code page"], ["bbbbbbb2222", "2026-11-30T09:00:00Z", "Fix a test"], ["ccccccc3333", "2026-11-27T20:00:00Z", "Older one"], ["ddddddd4444", "2026-10-01T10:00:00Z", "Far too old"]]),
    repo("alpha/hub-memory", [["eeeeeee5555", "2026-11-30T11:00:00Z", "A note"], ["fffffff6666", "2026-11-29T08:00:00Z", "Another\nline two"], ["ggggggg7777", "2026-11-28T08:00:00Z", "Third"]], true),
  ], now);
  assert.ok("days" in commits);
  if (!("days" in commits)) return;
  assert.equal(commits.days.length, heatDays);
  assert.deepEqual(commits.days.at(-1), { day: "2026-11-30", weekday: "mon", count: 3, known: true });
  assert.deepEqual(commits.days.at(-2), { day: "2026-11-29", weekday: "sun", count: 1, known: true });
  assert.deepEqual(commits.days.find((day) => day.day === "2026-11-28"), { day: "2026-11-28", weekday: "sat", count: 1, known: false }, "the oldest day GitHub's latest reached may be cut part-way, so it's only at least");
  assert.deepEqual(commits.days.find((day) => day.day === "2026-11-27"), { day: "2026-11-27", weekday: "fri", count: 1, known: false }, "a day before it is only what the other repos gave");
  assert.equal(commits.days.filter((day) => !day.known).length, heatDays - 2);
  assert.equal(commits.days[0].day, "2026-11-03");
  assert.equal(commits.total, 6, "a commit older than the four weeks isn't counted");
  assert.equal(commits.more, true, "a repo with more than GitHub gave says so");
  assert.deepEqual(commits.latest.map((one) => [one.sha, one.repo, one.what]), [["eeeeeee", "hub-memory", "A note"], ["aaaaaaa", "home-server-docker", "Add the code page"], ["bbbbbbb", "home-server-docker", "Fix a test"], ["fffffff", "hub-memory", "Another line two"], ["ggggggg", "hub-memory", "Third"]]);
  assert.equal(commits.latest.length, latestShown);
  assert.deepEqual([commits.repos, commits.failed], [2, []]);
});

test("the days are London's calendar days, one each, across both clock changes and at any hour", () => {
  for (const at of ["2026-03-29T23:30:00Z", "2026-04-05T23:30:00Z", "2026-10-25T23:30:00Z", "2026-11-01T12:00:00Z", "2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z", "2026-12-31T23:59:00Z"]) {
    const commits = commitsOf([repo("alpha/one", [])], new Date(at));
    assert.ok("days" in commits);
    if (!("days" in commits)) return;
    assert.equal(commits.days.length, heatDays, at);
    for (let i = 1; i < commits.days.length; i++) assert.equal(Date.parse(`${commits.days[i].day}T12:00:00Z`) - Date.parse(`${commits.days[i - 1].day}T12:00:00Z`), 24 * 60 * 60 * 1000, `${at}: ${commits.days[i - 1].day} then ${commits.days[i].day}`);
    const london = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
    assert.equal(commits.days.at(-1)?.day, london, at);
    for (const day of commits.days) assert.equal(day.weekday, ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${day.day}T12:00:00Z`).getUTCDay()], day.day);
    assert.ok(commits.days.every((day) => day.known), "nothing's unknown when no repo had more");
  }
});

test("with two repos cut short, days are known only after the later of their oldest days, and a repo that wasn't cut short never moves it", () => {
  const commits = commitsOf([
    repo("alpha/one", [["aaaaaaa1111", "2026-11-30T10:00:00Z", "One"], ["bbbbbbb2222", "2026-11-25T10:00:00Z", "Two"]], true),
    repo("alpha/two", [["ccccccc3333", "2026-11-30T10:00:00Z", "Three"], ["ddddddd4444", "2026-11-27T10:00:00Z", "Four"]], true),
    repo("alpha/three", [["eeeeeee5555", "2026-11-29T10:00:00Z", "Five"]]),
  ], now);
  assert.ok("days" in commits);
  if (!("days" in commits)) return;
  assert.deepEqual(commits.days.filter((day) => day.known).map((day) => day.day), ["2026-11-28", "2026-11-29", "2026-11-30"]);
});

test("a long repo name is cut, so the commit's time still shows", () => {
  const commits = commitsOf([repo(`alpha/${"r".repeat(60)}`, [["aaaaaaa1111", "2026-11-30T10:00:00Z", "One"]]), { repo: `alpha/${"s".repeat(60)}`, failed: "no" }], now);
  assert.ok("latest" in commits);
  if (!("latest" in commits)) return;
  assert.deepEqual([commits.latest[0].repo.length, commits.latest[0].repo.endsWith("…"), commits.failed[0].length], [40, true, 40]);
});

test("a repo GitHub couldn't give is named, a long message is cut, and odd characters never reach the page", () => {
  const commits = commitsOf([repo("alpha/one", [["aaaaaaa1111", "2026-11-30T10:00:00Z", `abc\u202edef\u200bghi${"x".repeat(70)}\u0007end`]]), { repo: "alpha/two", failed: "GitHub refused the token (401)" }], now);
  assert.ok("latest" in commits);
  if (!("latest" in commits)) return;
  assert.equal(commits.latest[0].what.length, 60);
  assert.ok(commits.latest[0].what.endsWith("…"));
  assert.ok(commits.latest[0].what.startsWith("abc def ghi"), commits.latest[0].what);
  assert.ok(!/[\u202e\u200b\u0007]/.test(JSON.stringify(commits)));
  assert.deepEqual(commits.failed, ["two"]);
  assert.ok(!JSON.stringify(commits).includes("401"), "only the repo's name, never GitHub's reason, reaches the page");
  assert.deepEqual(commitsOf(null, now), { none: "catch-up-off" });
  assert.deepEqual(commitsOf([], now), { none: "no-repos" });
  assert.deepEqual(codePage({ none: "not-run" }, { none: "no-repos" }), { kind: "code", tests: { none: "not-run" }, commits: { none: "no-repos" } });
});
