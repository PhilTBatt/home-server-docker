import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExpiryStatus } from "../expiry/checker.js";
import type { WatcherView } from "../watchers/watchers.js";
import { byDay, londonDaysStart, catchUpDoctorMs, createCatchUp, hubWaitMs, keepCommitsMs, retryCommitsMs, summaryOf, type CatchUpReport, type HubSources } from "./catchup.js";

const now = new Date("2026-11-26T12:00:00Z");
const sha = (n: number) => String(n).repeat(40);

function commit(n: number, at: string, message = `Commit ${n}`) {
  return { sha: sha(n), commit: { message, committer: { date: at } } };
}

function github(replies: Record<string, () => Response>) {
  const asked: string[] = [];
  const headers: unknown[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    asked.push(url);
    headers.push(init?.headers);
    const repo = /\/repos\/([^/]+\/[^/]+)\/commits/.exec(url)?.[1] ?? "";
    return (replies[repo] ?? (() => new Response("", { status: 404 })))();
  }) as typeof fetch;
  return { asked, headers, fetcher };
}

function item(name: string, daysLeft: number): ExpiryStatus {
  return { name, date: "2026-12-01", note: null, daysLeft, overdue: daysLeft < 0 };
}

function watcher(what: string): WatcherView {
  return { kind: "service-answering", service: "jellyfin", id: "0a1b2c3d", what, hours: 24, createdAt: now.toISOString(), expiresAt: now.toISOString(), lastCheck: null, waitingToSend: false };
}

function hub(more: Partial<HubSources> = {}): HubSources {
  return {
    server: async () => ({ state: "ok", summary: "Everything's OK: 9 checks fine, 4 switched off." }),
    problems: async () => [],
    backup: async () => ({ lastRun: { time: "2026-11-26T02:00:00Z", problem: null }, lastSuccess: "2026-11-26T02:00:00Z" }),
    inbox: async () => 0,
    expiries: async () => [],
    watchers: () => [],
    ...more,
  };
}

test("each repo's commits come per day in London, newest first, with a count, the latest time and whether GitHub has more", async () => {
  const stand = github({
    "alpha/one": () => Response.json([commit(3, "2026-11-26T09:00:00Z", "Third"), commit(2, "2026-11-25T23:30:00Z", "Second"), commit(1, "2026-11-25T08:00:00Z", "First")], { headers: { link: '<https://api.github.com/x?page=2>; rel="next"' } }),
    "beta/two": () => Response.json([]),
  });
  const report = await createCatchUp({ repos: ["alpha/one", "beta/two"], token: "", hub: hub(), fetcher: stand.fetcher }).read(7, now);
  assert.deepEqual(report.repos, [
    {
      repo: "alpha/one",
      count: 3,
      more: true,
      latestAt: "2026-11-26T09:00:00.000Z",
      days: [
        { day: "2026-11-26", commits: [{ sha: "3333333", at: "2026-11-26T09:00:00.000Z", message: "Third" }] },
        { day: "2026-11-25", commits: [{ sha: "2222222", at: "2026-11-25T23:30:00.000Z", message: "Second" }, { sha: "1111111", at: "2026-11-25T08:00:00.000Z", message: "First" }] },
      ],
    },
    { repo: "beta/two", count: 0, more: false, latestAt: null, days: [] },
  ]);
  assert.deepEqual([report.days, report.since, report.checkedAt, report.commitsAskedAt], [7, "2026-11-20T00:00:00.000Z", "2026-11-26T12:00:00.000Z", "2026-11-26T12:00:00.000Z"]);
  assert.deepEqual(stand.asked, ["https://api.github.com/repos/alpha/one/commits?since=2026-11-20T00:00:00Z&per_page=30", "https://api.github.com/repos/beta/two/commits?since=2026-11-20T00:00:00Z&per_page=30"]);
});

test("the days asked for are whole London days counting today, from midnight there in winter and in summer", () => {
  assert.equal(londonDaysStart(new Date("2026-11-26T12:00:00Z"), 7).toISOString(), "2026-11-20T00:00:00.000Z");
  assert.equal(londonDaysStart(new Date("2026-11-26T00:30:00Z"), 1).toISOString(), "2026-11-26T00:00:00.000Z");
  assert.equal(londonDaysStart(new Date("2026-07-10T12:00:00Z"), 1).toISOString(), "2026-07-09T23:00:00.000Z");
  assert.equal(londonDaysStart(new Date("2026-07-09T23:30:00Z"), 2).toISOString(), "2026-07-08T23:00:00.000Z");
  assert.equal(londonDaysStart(new Date("2026-03-30T12:00:00Z"), 3).toISOString(), "2026-03-28T00:00:00.000Z", "back across the clocks going forward");
  assert.equal(londonDaysStart(new Date("2026-10-26T12:00:00Z"), 2).toISOString(), "2026-10-24T23:00:00.000Z", "back across the clocks going back");
  assert.equal(londonDaysStart(new Date("2027-01-01T09:00:00Z"), 3).toISOString(), "2026-12-30T00:00:00.000Z", "across a new year");
});

test("days are London days, so in summer a commit just after midnight there counts for the next day", () => {
  const days = byDay([{ sha: "a", at: "2026-07-01T22:30:00.000Z", message: "late" }, { sha: "b", at: "2026-07-01T23:30:00.000Z", message: "after midnight" }]);
  assert.deepEqual(days.map((day) => [day.day, day.commits.map((one) => one.sha)]), [["2026-07-02", ["b"]], ["2026-07-01", ["a"]]]);
});

test("a repo that fails still lets the others answer, and says why in plain words", async () => {
  const stand = github({ "alpha/one": () => Response.json([commit(1, "2026-11-26T09:00:00Z")]), "beta/two": () => new Response("{\"message\":\"Bad credentials\"}", { status: 401 }) });
  const report = await createCatchUp({ repos: ["alpha/one", "beta/two", "gamma/three"], token: "github_pat_test_0123456789abcdefghij", hub: hub(), fetcher: stand.fetcher }).read(7, now);
  assert.deepEqual(report.repos.map((repo) => ("failed" in repo ? [repo.repo, repo.failed] : [repo.repo, repo.count])), [
    ["alpha/one", 1],
    ["beta/two", "GitHub refused the token (401), so check CATCH_UP_GITHUB_TOKEN hasn't expired"],
    ["gamma/three", "GitHub says there's no such repo, or the token can't see it (404)"],
  ]);
  assert.match(report.summary, /^1 commit in the last 7 days, in 1 of 3 repos; the latest was in alpha\/one, 26 Nov at 09:00\. Couldn't read beta\/two and gamma\/three\./);
  assert.equal(JSON.stringify(report).includes("github_pat_"), false);
  assert.equal(JSON.stringify(report).includes("Bad credentials"), false);
});

test("the token goes to GitHub in its header only when one is set", async () => {
  const stand = github({ "alpha/one": () => Response.json([]) });
  await createCatchUp({ repos: ["alpha/one"], token: "github_pat_test_0123456789abcdefghij", hub: hub(), fetcher: stand.fetcher }).read(7, now);
  await createCatchUp({ repos: ["alpha/one"], token: "", hub: hub(), fetcher: stand.fetcher }).read(7, now);
  assert.deepEqual(stand.headers.map((sent) => (sent as Record<string, string>).authorization ?? null), ["Bearer github_pat_test_0123456789abcdefghij", null]);
});

test("with no repos listed, GitHub is never asked and the rest still answers", async () => {
  const stand = github({});
  const report = await createCatchUp({ repos: [], token: "", hub: hub(), fetcher: stand.fetcher }).read(7, now);
  assert.deepEqual([stand.asked, report.repos, report.commitsAskedAt], [[], [], null]);
  assert.equal(report.summary, "No repos are listed in CATCH_UP_REPOS. Server: Everything's OK: 9 checks fine, 4 switched off.");
});

test("what's waiting comes from the hub's own reads: inbox notes, things expiring within 7 days or overdue, watchers, problems, the last backup and the doctor's line", async () => {
  const report = await createCatchUp({
    repos: [],
    token: "",
    fetcher: github({}).fetcher,
    hub: hub({
      inbox: async () => 3,
      expiries: async () => [item("Overdue", -2), item("Today", 0), item("Week", 7), item("Later", 8)],
      watchers: () => [watcher("Jellyfin to answer"), watcher("free disk space to fall below 10%")],
      problems: async () => [{ code: "disk-low", message: "Disk space is low: 5 GB free." }],
      server: async () => ({ state: "problem", summary: "1 problem: Disk." }),
    }),
  }).read(7, now);
  assert.deepEqual(report.waiting, {
    inbox: { notes: 3 },
    expiring: { within: 7, items: [item("Overdue", -2), item("Today", 0), item("Week", 7)] },
    watchers: { watching: ["Jellyfin to answer", "free disk space to fall below 10%"] },
    problems: { messages: ["Disk space is low: 5 GB free."] },
  });
  assert.deepEqual(report.backup, { lastRun: { time: "2026-11-26T02:00:00Z", problem: null }, lastSuccess: "2026-11-26T02:00:00Z" });
  assert.deepEqual(report.server, { state: "problem", summary: "1 problem: Disk." });
  assert.equal(report.summary, "No repos are listed in CATCH_UP_REPOS. Waiting: 3 notes in the brain inbox, 3 things expiring within 7 days or overdue, 2 watchers still waiting and 1 problem in the alerts. Server: 1 problem: Disk.");
});

test("a part whose feature is off says which setting, and one that fails or is slow says why, never failing the whole answer", async () => {
  const off = await createCatchUp({ repos: [], token: "", hub: hub({ inbox: undefined, expiries: undefined, watchers: undefined }) }).read(7, now);
  assert.deepEqual(off.waiting, { inbox: { off: "MEMORY_INBOX" }, expiring: { off: "EXPIRY_ALERTS" }, watchers: { off: "WATCHERS" }, problems: { messages: [] } });
  const failing = await createCatchUp({
    repos: [],
    token: "",
    waitMs: 50,
    hub: hub({
      inbox: async () => {
        throw new Error("Couldn't read the brain inbox");
      },
      expiries: async () => {
        throw new Error("the list isn't valid JSON");
      },
      problems: () => new Promise(() => undefined),
      backup: async () => {
        throw new Error("EACCES");
      },
      server: () => new Promise(() => undefined),
    }),
  }).read(7, now);
  assert.deepEqual([failing.waiting.inbox, failing.waiting.expiring, failing.waiting.problems, failing.backup, failing.server], [{ failed: "Couldn't read the brain inbox" }, { failed: "the list isn't valid JSON" }, { failed: "no answer within 0.05 seconds" }, { failed: "EACCES" }, { failed: "no answer within 0.05 seconds" }]);
  assert.equal(failing.summary, "No repos are listed in CATCH_UP_REPOS. Couldn't ask the server doctor.");
  assert.deepEqual([hubWaitMs, catchUpDoctorMs], [5_000, 4_000]);
});

test("GitHub's answer is kept for 10 minutes for the same number of days, and asked again after", async () => {
  const stand = github({ "alpha/one": () => Response.json([]) });
  const catchUp = createCatchUp({ repos: ["alpha/one"], token: "", hub: hub(), fetcher: stand.fetcher });
  await catchUp.read(7, now);
  const kept = await catchUp.read(7, new Date(now.getTime() + keepCommitsMs - 1));
  assert.equal(stand.asked.length, 1);
  assert.equal(kept.commitsAskedAt, "2026-11-26T12:00:00.000Z");
  assert.equal(kept.checkedAt, "2026-11-26T12:09:59.999Z");
  await catchUp.read(3, now);
  assert.equal(stand.asked.length, 2, "another number of days is its own ask");
  await catchUp.read(7, new Date(now.getTime() + keepCommitsMs));
  assert.equal(stand.asked.length, 3);
  assert.equal(keepCommitsMs, 10 * 60 * 1000);
});

test("a repo that failed is asked again after a minute, on its own, while a repo that answered is kept for its 10 minutes", async () => {
  const stand = github({ "alpha/one": () => Response.json([]) });
  const catchUp = createCatchUp({ repos: ["alpha/one", "beta/two"], token: "", hub: hub(), fetcher: stand.fetcher });
  const repoOf = (url: string) => /\/repos\/([^/]+\/[^/]+)\/commits/.exec(url)?.[1];
  await catchUp.read(7, now);
  await catchUp.read(7, new Date(now.getTime() + retryCommitsMs - 1));
  assert.equal(stand.asked.length, 2);
  const again = await catchUp.read(7, new Date(now.getTime() + retryCommitsMs));
  assert.deepEqual(stand.asked.slice(2).map(repoOf), ["beta/two"]);
  assert.equal(again.commitsAskedAt, "2026-11-26T12:00:00.000Z", "the oldest ask is the one given");
  await catchUp.read(7, new Date(now.getTime() + keepCommitsMs));
  assert.deepEqual(stand.asked.slice(3).map(repoOf).sort(), ["alpha/one", "beta/two"]);
  assert.equal(retryCommitsMs, 60 * 1000);
});

test("once GitHub says its limit is used up, no repo is asked again before the time it gave, answers already kept are still given, and the rest say they weren't asked", async () => {
  const reset = Date.parse("2026-11-26T12:30:00Z");
  const notAsked = "not asked: GitHub said to wait until 26 Nov at 12:30";
  let limited = true;
  const stand = github({
    "alpha/one": () => Response.json([commit(1, "2026-11-26T09:00:00Z")]),
    "beta/two": () => (limited ? new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset / 1000) } }) : Response.json([])),
  });
  const catchUp = createCatchUp({ repos: ["alpha/one", "beta/two"], token: "", hub: hub(), fetcher: stand.fetcher });
  const shown = (report: CatchUpReport) => report.repos.map((repo) => ("failed" in repo ? repo.failed : repo.count));
  assert.deepEqual(shown(await catchUp.read(7, now)), [1, "GitHub's hourly limit is used up until 26 Nov at 12:30 (it's 60 calls an hour without a token)"]);
  const later = new Date(now.getTime() + 5 * 60 * 1000);
  const other = await catchUp.read(3, later);
  assert.deepEqual([shown(other), other.commitsAskedAt], [[notAsked, notAsked], null]);
  assert.match(other.summary, /^Couldn't read alpha\/one and beta\/two\./);
  const kept = await catchUp.read(7, later);
  assert.deepEqual([shown(kept), kept.commitsAskedAt], [[1, notAsked], "2026-11-26T12:00:00.000Z"]);
  assert.deepEqual(shown(await catchUp.read(7, new Date(reset - 1))), [notAsked, notAsked]);
  assert.equal(stand.asked.length, 2);
  limited = false;
  assert.deepEqual(shown(await catchUp.read(7, new Date(reset))), [1, 0]);
  assert.equal(stand.asked.length, 4);
});

test("when two refusals give different waits, the longer one holds", async () => {
  const stand = github({
    "alpha/one": () => new Response("", { status: 403, headers: { "retry-after": "600" } }),
    "beta/two": () => new Response("", { status: 429 }),
  });
  const catchUp = createCatchUp({ repos: ["alpha/one", "beta/two"], token: "", hub: hub(), fetcher: stand.fetcher });
  await catchUp.read(7, now);
  await catchUp.read(7, new Date(now.getTime() + 10 * 60 * 1000 - 1));
  assert.equal(stand.asked.length, 2);
  await catchUp.read(7, new Date(now.getTime() + 10 * 60 * 1000));
  assert.equal(stand.asked.length, 4);
});

test("two reads at once share one ask of GitHub", async () => {
  const stand = github({ "alpha/one": () => Response.json([commit(1, "2026-11-26T09:00:00Z")]) });
  const catchUp = createCatchUp({ repos: ["alpha/one"], token: "", hub: hub(), fetcher: stand.fetcher });
  const [first, second] = await Promise.all([catchUp.read(7, now), catchUp.read(7, now)]);
  assert.equal(stand.asked.length, 1);
  assert.deepEqual(first.repos, second.repos);
});

function report(more: Partial<CatchUpReport>): Omit<CatchUpReport, "summary"> {
  return {
    days: 7,
    since: "",
    checkedAt: "",
    commitsAskedAt: null,
    repos: [],
    waiting: { inbox: { notes: 0 }, expiring: { within: 7, items: [] }, watchers: { watching: [] }, problems: { messages: [] } },
    backup: { lastRun: null, lastSuccess: null },
    server: { state: "ok", summary: "Fine." },
    ...more,
  };
}

test("the summary says in plain words how many commits, where the latest was, and says no commits, one day and at least when it should", () => {
  const busy = (repo: string, count: number, latestAt: string, more = false) => ({ repo, count, more, latestAt, days: [] });
  const quiet = (repo: string) => ({ repo, count: 0, more: false, latestAt: null, days: [] });
  assert.equal(summaryOf(report({ repos: [busy("alpha/one", 2, "2026-11-24T10:00:00.000Z"), busy("beta/two", 1, "2026-11-25T10:00:00.000Z"), quiet("gamma/three")] })), "3 commits in the last 7 days, in 2 of 3 repos; the latest was in beta/two, 25 Nov at 10:00. Server: Fine.");
  assert.equal(summaryOf(report({ repos: [busy("alpha/one", 30, "2026-11-25T10:00:00.000Z", true)] })), "At least 30 commits in the last 7 days, in 1 of 1 repo; the latest was in alpha/one, 25 Nov at 10:00. Server: Fine.");
  assert.equal(summaryOf(report({ repos: [busy("alpha/one", 30, "2026-11-25T10:00:00.000Z", true), busy("beta/two", 2, "2026-11-20T10:00:00.000Z")] })), "At least 32 commits in the last 7 days, in 2 of 2 repos; the latest was in alpha/one, 25 Nov at 10:00. Server: Fine.");
  assert.equal(summaryOf(report({ days: 1, repos: [quiet("alpha/one")] })), "No commits in the last day. Server: Fine.");
  assert.equal(summaryOf(report({ repos: [quiet("alpha/one"), { repo: "beta/two", failed: "x" }] })), "No commits in the last 7 days in the repos that could be read. Couldn't read beta/two. Server: Fine.");
  assert.equal(summaryOf(report({ repos: [{ repo: "beta/two", failed: "x" }] })), "Couldn't read beta/two. Server: Fine.");
  assert.equal(summaryOf(report({ waiting: { inbox: { notes: 1 }, expiring: { off: "EXPIRY_ALERTS" }, watchers: { failed: "x" }, problems: { messages: [] } } })), "No repos are listed in CATCH_UP_REPOS. Waiting: 1 note in the brain inbox. Server: Fine.");
});
