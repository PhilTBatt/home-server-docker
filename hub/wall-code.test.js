// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { codeView, isCodePage, levelOf, skylineShortest, skylineTallest, whenWords } from "./wall-code.js";

const now = new Date("2026-11-30T12:00:00.000Z");

/** @returns {import("./wall-code.js").CodePage} */
function page() {
  return {
    kind: "code",
    tests: { at: "2026-11-30T09:05:00Z", ok: true, timedOut: false, suites: [{ id: "api", name: "The API", tests: 1814, pass: 1814, fail: 0 }, { id: "mcp", name: "The hub's tools", tests: 186, pass: 186, fail: 0 }, { id: "jarvis", name: "Jarvis", tests: 1941, pass: 1941, fail: 0 }, { id: "ears", name: "Ears", tests: 487, pass: 485, fail: 0 }] },
    commits: {
      days: Array.from({ length: 28 }, (_, i) => {
        const at = new Date(now.getTime() - (27 - i) * 86_400_000);
        return { day: at.toISOString().slice(0, 10), weekday: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][at.getUTCDay()], count: i === 27 ? 12 : i % 3, known: true };
      }),
      total: 30,
      more: false,
      latest: [{ sha: "abcdef1", what: "Add the code page", at: "2026-11-30T10:00:00Z", repo: "home-server-docker" }],
      repos: 2,
      failed: [],
    },
  };
}

test("the hub's code page is checked before it's drawn", () => {
  assert.equal(isCodePage(page()), true);
  const good = page();
  const tests = good.tests;
  const commits = good.commits;
  if ("none" in tests || "none" in commits) return;
  for (const bad of [
    null,
    { ...good, kind: "server" },
    { ...good, tests: { none: "maybe" } },
    { ...good, tests: { ...tests, at: "soon" } },
    { ...good, tests: { ...tests, suites: [{ ...tests.suites[0], id: "other" }] } },
    { ...good, tests: { ...tests, suites: [{ ...tests.suites[0], tests: -1 }] } },
    { ...good, commits: { none: "nope" } },
    { ...good, commits: { ...commits, latest: [{ ...commits.latest[0], sha: "ABCDEF1" }] } },
    { ...good, commits: { ...commits, latest: [{ ...commits.latest[0], what: "x".repeat(61) }] } },
    { ...good, commits: { ...commits, days: [{ day: "30 Nov", weekday: "mon", count: 1, known: true }] } },
    { ...good, commits: { ...commits, days: [{ day: "2026-11-30", weekday: "monday", count: 1, known: true }] } },
    { ...good, commits: { ...commits, days: [{ day: "2026-11-30", weekday: "mon", count: 1 }] } },
    { ...good, commits: { ...commits, days: [{ day: "2026-11-30", weekday: "mon", count: 1, known: "yes" }] } },
    { ...good, commits: { ...commits, latest: Array.from({ length: 6 }, () => commits.latest[0]) } },
  ]) assert.equal(isCodePage(bad), false, JSON.stringify(bad)?.slice(0, 100));
  assert.equal(isCodePage({ kind: "code", tests: { none: "chores-off" }, commits: { none: "catch-up-off" } }), true);
});

test("the skyline has a bar per suite, its height by the square root of its tests, labelled with how many passed", () => {
  const view = codeView(page(), now);
  assert.deepEqual(view.bars.map((bar) => [bar.id, bar.count, bar.failing]), [["api", "1,814", false], ["mcp", "186", false], ["jarvis", "1,941", false], ["ears", "485", false]]);
  assert.equal(view.bars[2].height, skylineTallest);
  assert.equal(view.bars[0].height, Math.round(skylineTallest * Math.sqrt(1814 / 1941)));
  assert.ok(view.bars.every((bar) => bar.height >= skylineShortest));
  assert.equal(view.testsTitle, "Tests, as a skyline · ran today, 09:05");
  assert.deepEqual(view.pills[0], { text: "4,426 passing", tone: "good" });
});

test("failing, timed-out or missing tests say so instead of passing", () => {
  const base = page();
  if ("none" in base.tests) return;
  const failing = codeView({ ...base, tests: { ...base.tests, ok: false, suites: base.tests.suites.map((suite) => (suite.id === "jarvis" ? { ...suite, pass: 1939, fail: 2 } : suite)) } }, now);
  assert.deepEqual([failing.pills[0], failing.bars[2].failing], [{ text: "2 failing", tone: "warn" }, true]);
  assert.deepEqual(codeView({ ...base, tests: { ...base.tests, ok: false, timedOut: true, suites: [] } }, now).pills[0], { text: "Tests ran out of time", tone: "warn" });
  assert.equal(codeView({ ...base, tests: { ...base.tests, ok: false, timedOut: true, suites: [] } }, now).testsEmpty, "The last run-tests chore ran out of time before any suite finished.");
  assert.match(codeView({ ...base, tests: { none: "chores-off" } }, now).testsEmpty, /dev chores are off \(CHORES\)/);
  assert.match(codeView({ ...base, tests: { none: "not-run" } }, now).testsEmpty, /^Ask for the run-tests chore/);
});

test("the commits grid puts each day under its weekday, a column a week, with today marked", () => {
  const view = codeView(page(), now);
  assert.equal(view.cells.length, 28);
  assert.deepEqual(view.cells.at(-1), { col: view.cols - 1, row: 0, level: 4, today: true, unknown: false, title: "2026-11-30: 12" });
  assert.ok(view.cells.every((cell, i) => i === 0 || cell.col * 7 + cell.row === view.cells[i - 1].col * 7 + view.cells[i - 1].row + 1), "one day after another");
  assert.equal(view.cols, 5, "four weeks that don't start on a Monday spread over five columns");
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10, 40].map(levelOf), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(view.latest, [{ sha: "abcdef1", what: "Add the code page", where: "home-server-docker · today, 10:00" }]);
  assert.deepEqual(view.pills[1], { text: "30 commits in four weeks", tone: "plain" });
});

test("commits that were more than GitHub gave, a repo that didn't answer, or catch-up being off each say so", () => {
  const base = page();
  if ("none" in base.commits) return;
  const more = codeView({ ...base, commits: { ...base.commits, more: true, failed: ["hub-memory"] } }, now);
  assert.equal(more.pills[1].text, "At least 30 commits in four weeks");
  assert.deepEqual(more.pills[2], { text: "GitHub didn't answer for hub-memory", tone: "warn" });
  assert.equal(more.heatTitle, "Commits, the last four weeks · GitHub's latest only");
  const reached = codeView({ ...base, commits: { ...base.commits, more: true, days: base.commits.days.map((day, i) => ({ ...day, known: i >= 20 })) } }, now);
  assert.deepEqual(reached.cells.map((cell) => cell.unknown), base.commits.days.map((_, i) => i < 20), "days GitHub's latest didn't reach are drawn as unknown, not as none");
  assert.equal(reached.cells[1].title, `${base.commits.days[1].day}: at least 1`);
  assert.equal(reached.heatTitle, "Commits, four weeks · dashed: past GitHub's latest");
  const off = codeView({ ...base, commits: { none: "catch-up-off" } }, now);
  assert.match(off.heatEmpty, /catch-up is off \(CATCH_UP\)/);
  assert.deepEqual([off.cells, off.latest], [[], []]);
  assert.match(codeView({ ...base, commits: { none: "no-repos" } }, now).heatEmpty, /CATCH_UP_REPOS/);
  assert.equal(codeView({ ...base, commits: { ...base.commits, latest: [] } }, now).latestEmpty, "No commits in the last four weeks.");
});

test("times read as today with the clock, or the day and date, in London", () => {
  assert.equal(whenWords("2026-11-30T10:00:00Z", now), "today, 10:00");
  assert.equal(whenWords("2026-11-29T23:30:00Z", now), "Sun 29 Nov, 23:30");
  assert.equal(whenWords("2026-06-30T23:30:00Z", new Date("2026-07-01T10:00:00Z")), "today, 00:30", "in summer, London is an hour ahead");
});
