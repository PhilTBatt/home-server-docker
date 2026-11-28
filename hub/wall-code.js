// @ts-check

export const codeSuiteIds = ["api", "mcp", "jarvis", "ears"];
export const weekdayIds = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const skylineBase = 544;
export const skylineTallest = 384;
export const skylineShortest = 38;

/**
 * @typedef {{ id: string, name: string, tests: number, pass: number, fail: number }} Suite
 * @typedef {{ at: string, ok: boolean, timedOut: boolean, suites: Suite[] } | { none: string }} Tests
 * @typedef {{ day: string, weekday: string, count: number, known: boolean }} HeatDay
 * @typedef {{ sha: string, what: string, at: string, repo: string }} LatestCommit
 * @typedef {{ days: HeatDay[], total: number, more: boolean, latest: LatestCommit[], repos: number, failed: string[] } | { none: string }} Commits
 * @typedef {{ kind: "code", tests: Tests, commits: Commits }} CodePage
 * @typedef {{ id: string, name: string, count: string, height: number, left: number, failing: boolean }} BarView
 * @typedef {{ col: number, row: number, level: number, today: boolean, unknown: boolean, title: string }} CellView
 * @typedef {{ sha: string, what: string, where: string }} CommitView
 * @typedef {{ testsTitle: string, testsEmpty: string, bars: BarView[], heatTitle: string, heatEmpty: string, cells: CellView[], cols: number, latest: CommitView[], latestEmpty: string, pills: { text: string, tone: string }[] }} CodeView
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 10_000_000;
}

/**
 * @param {unknown} value
 * @param {number} most
 * @returns {boolean}
 */
function isText(value, most) {
  return typeof value === "string" && value.length > 0 && value.length <= most;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/**
 * @param {unknown} tests
 * @returns {boolean}
 */
function isTests(tests) {
  if (!isObject(tests)) return false;
  if ("none" in tests) return tests.none === "chores-off" || tests.none === "not-run";
  return isTime(tests.at) && typeof tests.ok === "boolean" && typeof tests.timedOut === "boolean" && Array.isArray(tests.suites) && tests.suites.length <= codeSuiteIds.length && tests.suites.every((suite) => isObject(suite) && codeSuiteIds.includes(String(suite.id)) && isText(suite.name, 30) && isCount(suite.tests) && isCount(suite.pass) && isCount(suite.fail));
}

/**
 * @param {unknown} commits
 * @returns {boolean}
 */
function isCommits(commits) {
  if (!isObject(commits)) return false;
  if ("none" in commits) return commits.none === "catch-up-off" || commits.none === "no-repos";
  if (!Array.isArray(commits.days) || commits.days.length > 31 || !isCount(commits.total) || typeof commits.more !== "boolean" || !isCount(commits.repos) || !Array.isArray(commits.latest) || commits.latest.length > 5 || !Array.isArray(commits.failed) || commits.failed.length > 10) return false;
  const daysFit = commits.days.every((day) => isObject(day) && typeof day.day === "string" && /^\d{4}-\d\d-\d\d$/.test(day.day) && weekdayIds.includes(String(day.weekday)) && isCount(day.count) && typeof day.known === "boolean");
  const latestFit = commits.latest.every((commit) => isObject(commit) && typeof commit.sha === "string" && /^[0-9a-f]{7}$/.test(commit.sha) && isText(commit.what, 60) && isTime(commit.at) && isText(commit.repo, 100));
  return daysFit && latestFit && commits.failed.every((name) => isText(name, 100));
}

/**
 * @param {unknown} value
 * @returns {value is CodePage}
 */
export function isCodePage(value) {
  return isObject(value) && value.kind === "code" && isTests(value.tests) && isCommits(value.commits);
}

const dayWords = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
const clockWords = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const londonDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * @param {string} iso
 * @param {Date} now
 * @returns {string}
 */
export function whenWords(iso, now) {
  const at = new Date(iso);
  return londonDay.format(at) === londonDay.format(now) ? `today, ${clockWords.format(at)}` : `${dayWords.format(at)}, ${clockWords.format(at)}`;
}

/**
 * @param {number} count
 * @returns {number}
 */
export function levelOf(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/**
 * @param {CodePage} page
 * @param {Date} now
 * @returns {CodeView}
 */
export function codeView(page, now) {
  /** @type {{ text: string, tone: string }[]} */
  const pills = [];
  let testsTitle = "Tests, as a skyline";
  let testsEmpty = "";
  /** @type {BarView[]} */
  let bars = [];
  if ("none" in page.tests) {
    testsEmpty = page.tests.none === "chores-off" ? "The skyline comes from the run-tests chore, and dev chores are off (CHORES)." : "Ask for the run-tests chore, and the skyline fills from its results.";
  } else {
    const tests = page.tests;
    const tallest = Math.max(1, ...tests.suites.map((suite) => suite.tests));
    bars = tests.suites.map((suite, i) => ({ id: suite.id, name: suite.name, count: suite.pass.toLocaleString("en-GB"), height: Math.max(skylineShortest, Math.round(skylineTallest * Math.sqrt(suite.tests / tallest))), left: 72 + i * 150, failing: suite.fail > 0 }));
    const passing = tests.suites.reduce((sum, suite) => sum + suite.pass, 0);
    const failing = tests.suites.reduce((sum, suite) => sum + suite.fail, 0);
    testsTitle = `Tests, as a skyline · ran ${whenWords(tests.at, now)}`;
    if (tests.suites.length === 0) testsEmpty = tests.timedOut ? "The last run-tests chore ran out of time before any suite finished." : "The last run-tests chore didn't give any counts.";
    pills.push(failing > 0 || !tests.ok ? { text: failing > 0 ? `${failing.toLocaleString("en-GB")} failing` : tests.timedOut ? "Tests ran out of time" : "Tests didn't pass", tone: "warn" } : { text: `${passing.toLocaleString("en-GB")} passing`, tone: "good" });
  }
  let heatTitle = "Commits, the last four weeks";
  let heatEmpty = "";
  /** @type {CellView[]} */
  let cells = [];
  let cols = 0;
  /** @type {CommitView[]} */
  let latest = [];
  let latestEmpty = "";
  if ("none" in page.commits) {
    heatEmpty = page.commits.none === "catch-up-off" ? "Commits come from catch-up's repos on GitHub, and catch-up is off (CATCH_UP)." : "Catch-up has no repos to read (CATCH_UP_REPOS).";
    latestEmpty = heatEmpty;
  } else {
    const commits = page.commits;
    const offset = Math.max(0, weekdayIds.indexOf(commits.days[0]?.weekday ?? "mon"));
    cells = commits.days.map((day, i) => ({ col: Math.floor((i + offset) / 7), row: weekdayIds.indexOf(day.weekday), level: levelOf(day.count), today: i === commits.days.length - 1, unknown: !day.known, title: `${day.day}: ${day.known ? "" : "at least "}${day.count}` }));
    cols = cells.reduce((most, cell) => Math.max(most, cell.col + 1), 0);
    latest = commits.latest.map((commit) => ({ sha: commit.sha, what: commit.what, where: `${commit.repo} · ${whenWords(commit.at, now)}` }));
    if (latest.length === 0) latestEmpty = "No commits in the last four weeks.";
    pills.push({ text: `${commits.more ? "At least " : ""}${commits.total.toLocaleString("en-GB")} ${commits.total === 1 ? "commit" : "commits"} in four weeks`, tone: "plain" });
    if (commits.failed.length > 0) pills.push({ text: `GitHub didn't answer for ${commits.failed.join(", ")}`, tone: "warn" });
    if (commits.more) heatTitle = cells.some((cell) => cell.unknown) ? "Commits, four weeks · dashed: past GitHub's latest" : "Commits, the last four weeks · GitHub's latest only";
  }
  return { testsTitle, testsEmpty, bars, heatTitle, heatEmpty, cells, cols, latest, latestEmpty, pills };
}

export const codeNote = "Tests from the last run-tests chore; commits from catch-up's repos on GitHub, read at most every 10 minutes. The decision records, GitHub's checks and Dependabot aren't read by the hub.";
