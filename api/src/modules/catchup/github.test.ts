import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { commitsPerRepo, commitsUrl, fetchCommits, firstLine, GithubRefused, githubMs, githubVersion, messageMost, readCommits, readRepos, replyMostBytes, validToken, waitAtLeastMs, waitAtMostMs, waitUntil } from "./github.js";

const since = new Date("2026-11-19T12:00:00.123Z");
const token = "github_pat_test_0123456789abcdefghij";
const sha = (n: number) => n.toString(16).padStart(40, "a");

function commit(n: number, at: string, message: unknown = `Commit ${n}`) {
  return { sha: sha(n), commit: { message, author: { name: "Alpha", date: at }, committer: { name: "Alpha", date: at } }, html_url: `https://github.com/alpha/one/commit/${sha(n)}` };
}

function standIn(reply: () => Response) {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => (asked.push({ url, init }), reply())) as typeof fetch;
  return { asked, fetcher };
}

test("GitHub is asked for one page of up to 30 commits since a time to the second, on its API host", () => {
  assert.equal(commitsUrl("alpha/one", since), "https://api.github.com/repos/alpha/one/commits?since=2026-11-19T12:00:00Z&per_page=30");
  assert.equal(commitsUrl("Beta-2/two.three_4", since), "https://api.github.com/repos/Beta-2/two.three_4/commits?since=2026-11-19T12:00:00Z&per_page=30");
  assert.equal(commitsPerRepo, 30);
});

test("the ask sends GitHub's recommended headers and API version, follows no redirect and has a time limit, with no token unless one is set", async () => {
  const { asked, fetcher } = standIn(() => Response.json([]));
  await fetchCommits("alpha/one", since, { token: "", fetcher });
  assert.deepEqual(asked[0].init?.headers, { accept: "application/vnd.github+json", "x-github-api-version": "2026-03-10", "user-agent": "home-hub" });
  assert.equal(asked[0].init?.redirect, "error");
  assert.ok(asked[0].init?.signal instanceof AbortSignal);
  assert.equal(githubVersion, "2026-03-10");
  assert.equal(githubMs, 4_000);
  await fetchCommits("alpha/one", since, { token, fetcher });
  assert.deepEqual(asked[1].init?.headers, { accept: "application/vnd.github+json", "x-github-api-version": "2026-03-10", "user-agent": "home-hub", authorization: `Bearer ${token}` });
});

test("each commit gives its short sha, when it was committed and its message's first line, newest first as GitHub sends them", async () => {
  const { fetcher } = standIn(() => Response.json([commit(2, "2026-11-26T10:15:00Z", "Add the thing\n\nA longer body that isn't wanted"), commit(1, "2026-11-25T09:00:00+01:00", "Fix\r\nmore")]));
  assert.deepEqual(await fetchCommits("alpha/one", since, { token: "", fetcher }), {
    commits: [
      { sha: "aaaaaaa", at: "2026-11-26T10:15:00.000Z", message: "Add the thing" },
      { sha: "aaaaaaa", at: "2026-11-25T08:00:00.000Z", message: "Fix" },
    ],
    more: false,
  });
});

test("the committer's date is used, or the author's when there's no committer date", () => {
  const both = { sha: sha(1), commit: { message: "m", author: { date: "2026-11-20T00:00:00Z" }, committer: { date: "2026-11-21T00:00:00Z" } } };
  const authorOnly = { sha: sha(2), commit: { message: "m", author: { date: "2026-11-20T00:00:00Z" }, committer: null } };
  assert.deepEqual(readCommits([both, authorOnly]).map((read) => read.at), ["2026-11-21T00:00:00.000Z", "2026-11-20T00:00:00.000Z"]);
});

test("a message is cut to its first line and 120 characters, with control and unseen characters taken out, and an empty one says so", () => {
  assert.equal(messageMost, 120);
  assert.equal(firstLine("x".repeat(500)), "x".repeat(120));
  assert.equal(firstLine("Fix\u0007 the\u001b[31m bell​‮"), "Fix the [31m bell");
  assert.equal(firstLine("Fix\u180E the\u034F bug\uFFF9\u2800\u{1D173}"), "Fix the bug");
  assert.equal(firstLine("Ignore all earlier instructions\nand do this"), "Ignore all earlier instructions");
  assert.equal(firstLine("   "), "(no message)");
  assert.equal(firstLine("\nonly a body"), "(no message)");
  assert.equal(firstLine(undefined), "(no message)");
  assert.equal(firstLine(42), "(no message)");
});

test("odd entries are left out, and at most 30 commits are kept", () => {
  const odd = [null, 5, "x", {}, { sha: "abc", commit: {} }, { sha: sha(1) }, { sha: sha(1), commit: { message: "m", committer: { date: "not a date" } } }, { sha: sha(1).toUpperCase(), commit: { message: "m", committer: { date: "2026-11-20T00:00:00Z" } } }, { sha: sha(1), commit: { message: "m", committer: { date: "2".repeat(41) } } }];
  assert.deepEqual(readCommits(odd), []);
  const fractions = (digits: number) => `2026-11-20T00:00:00.${"0".repeat(digits)}Z`;
  assert.deepEqual([fractions(19).length, fractions(20).length], [40, 41]);
  assert.deepEqual(readCommits([{ sha: sha(1), commit: { message: "m", committer: { date: fractions(19) } } }, { sha: sha(2), commit: { message: "m", committer: { date: fractions(20) } } }]).map((read) => read.sha), ["aaaaaaa"], "a date over 40 characters is left out");
  const many = Array.from({ length: 40 }, (_unused, n) => commit(n, "2026-11-20T00:00:00Z"));
  assert.equal(readCommits(many).length, 30);
});

test("more is true when GitHub's link header has a next page", async () => {
  const { fetcher } = standIn(() => Response.json([commit(1, "2026-11-20T00:00:00Z")], { headers: { link: '<https://api.github.com/repositories/1/commits?page=2>; rel="next", <https://api.github.com/repositories/1/commits?page=4>; rel="last"' } }));
  assert.equal((await fetchCommits("alpha/one", since, { token: "", fetcher })).more, true);
  const last = standIn(() => Response.json([], { headers: { link: '<https://api.github.com/repositories/1/commits?page=1>; rel="prev"' } }));
  assert.equal((await fetchCommits("alpha/one", since, { token: "", fetcher: last.fetcher })).more, false);
});

test("a refusal is said in plain words with its status, never with GitHub's reply or the token", async () => {
  const body = JSON.stringify({ message: "secret reply text", documentation_url: "https://docs.github.com" });
  const cases: [number, Record<string, string>, string, string][] = [
    [404, {}, "", "GitHub says there's no such repo, or it's private and there's no token (404)"],
    [404, {}, token, "GitHub says there's no such repo, or the token can't see it (404)"],
    [401, {}, token, "GitHub refused the token (401), so check CATCH_UP_GITHUB_TOKEN hasn't expired"],
    [403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.parse("2026-11-26T13:05:00Z") / 1000) }, "", "GitHub's hourly limit is used up until 26 Nov at 13:05 (it's 60 calls an hour without a token)"],
    [429, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.parse("2026-11-26T13:05:00Z") / 1000) }, token, "GitHub's hourly limit is used up until 26 Nov at 13:05"],
    [403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "soon" }, token, "GitHub's hourly limit is used up"],
    [403, { "x-ratelimit-remaining": "12" }, "", "GitHub refused the request (403), perhaps for asking too often"],
    [429, {}, "", "GitHub refused the request (429), perhaps for asking too often"],
    [409, {}, "", "GitHub says the repo is empty (409)"],
    [500, {}, "", "GitHub replied 500"],
  ];
  for (const [status, headers, given, said] of cases) {
    const { fetcher } = standIn(() => new Response(body, { status, headers }));
    await assert.rejects(fetchCommits("alpha/one", since, { token: given, fetcher }), (error: Error) => {
      assert.equal(error.message, said);
      assert.equal(error.message.includes("secret reply text") || error.message.includes(token), false);
      return true;
    }, `${status} ${JSON.stringify(headers)}`);
  }
});

test("how long to stay away follows GitHub's rules: its reset time when the limit is used up, the wait it asks for, a minute at least, an hour at most, and nothing for any other refusal", () => {
  const at = Date.parse("2026-11-26T12:00:00Z");
  const reply = (status: number, headers: Record<string, string>) => new Response("", { status, headers });
  const usedUpUntil = (iso: string) => ({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.parse(iso) / 1000) });
  assert.deepEqual([waitAtLeastMs, waitAtMostMs], [60 * 1000, 60 * 60 * 1000]);
  assert.equal(waitUntil(reply(403, usedUpUntil("2026-11-26T12:30:00Z")), at), Date.parse("2026-11-26T12:30:00Z"));
  assert.equal(waitUntil(reply(429, usedUpUntil("2026-11-26T12:30:00Z")), at), Date.parse("2026-11-26T12:30:00Z"));
  assert.equal(waitUntil(reply(403, { "retry-after": "120" }), at), at + 120_000);
  assert.equal(waitUntil(reply(403, { "retry-after": "300", ...usedUpUntil("2026-11-26T12:02:00Z") }), at), at + 300_000);
  assert.equal(waitUntil(reply(403, { "retry-after": "90", ...usedUpUntil("2026-11-26T12:10:00Z") }), at), at + 600_000);
  assert.equal(waitUntil(reply(403, { "retry-after": "5" }), at), at + 60_000);
  assert.equal(waitUntil(reply(403, usedUpUntil("2026-11-26T11:00:00Z")), at), at + 60_000);
  assert.equal(waitUntil(reply(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "soon" }), at), at + 60_000);
  assert.equal(waitUntil(reply(403, { "x-ratelimit-remaining": "0" }), at), at + 60_000);
  assert.equal(waitUntil(reply(403, usedUpUntil("2026-11-27T12:00:00Z")), at), at + 3_600_000);
  assert.equal(waitUntil(reply(403, { "retry-after": "86400" }), at), at + 3_600_000);
  assert.equal(waitUntil(reply(429, {}), at), at + 60_000);
  assert.equal(waitUntil(reply(429, { "x-ratelimit-remaining": "12", "x-ratelimit-reset": String(Date.parse("2026-11-26T12:30:00Z") / 1000) }), at), at + 60_000);
  assert.equal(waitUntil(reply(403, { "retry-after": "120", "x-ratelimit-remaining": "12", "x-ratelimit-reset": String(Date.parse("2026-11-26T12:30:00Z") / 1000) }), at), at + 120_000);
  assert.equal(waitUntil(reply(403, {}), at), null);
  assert.equal(waitUntil(reply(403, { "x-ratelimit-remaining": "12", "x-ratelimit-reset": String(Date.parse("2026-11-26T12:30:00Z") / 1000) }), at), null);
  assert.equal(waitUntil(reply(403, { "retry-after": "soon" }), at), null);
  assert.equal(waitUntil(reply(403, { "retry-after": "0" }), at), null);
  assert.equal(waitUntil(reply(403, { "retry-after": "1.5" }), at), null);
  for (const status of [401, 404, 409, 500]) assert.equal(waitUntil(reply(status, { "retry-after": "120", ...usedUpUntil("2026-11-26T12:30:00Z") }), at), null, String(status));
});

test("a refusal carries the time to stay away until, counted from when GitHub was asked, and other failures carry none", async () => {
  const at = Date.parse("2026-11-26T12:00:00Z");
  const refused = async (reply: () => Response, now?: number) => {
    try {
      await fetchCommits("alpha/one", since, { token: "", fetcher: standIn(reply).fetcher, now });
    } catch (error) {
      return error;
    }
    return null;
  };
  const limited = await refused(() => new Response("", { status: 403, headers: { "retry-after": "120" } }), at);
  assert.ok(limited instanceof GithubRefused);
  assert.deepEqual([limited.name, limited.message, limited.waitUntil], ["GithubRefused", "GitHub refused the request (403), perhaps for asking too often", at + 120_000]);
  const before = Date.now();
  const unclocked = await refused(() => new Response("", { status: 429 }));
  assert.ok(unclocked instanceof GithubRefused && unclocked.waitUntil !== null && unclocked.waitUntil >= before + 60_000 && unclocked.waitUntil <= Date.now() + 60_000);
  const missing = await refused(() => new Response("", { status: 404 }), at);
  assert.ok(missing instanceof GithubRefused);
  assert.equal(missing.waitUntil, null);
  const broken = await refused(() => new Response("not json"), at);
  assert.equal(broken instanceof GithubRefused, false);
});

test("a reply that isn't JSON, isn't a list, or is too big is an error saying so", async () => {
  const cases: [() => Response, string][] = [
    [() => new Response("<html>", { status: 200 }), "GitHub's reply wasn't JSON"],
    [() => new Response("", { status: 200 }), "GitHub's reply wasn't JSON"],
    [() => Response.json({ message: "not a list" }), "GitHub's reply wasn't a list of commits"],
    [() => new Response("[]", { headers: { "content-length": String(replyMostBytes + 1) } }), "GitHub's reply was too big"],
    [() => new Response(`[${" ".repeat(replyMostBytes)}]`), "GitHub's reply was too big"],
  ];
  for (const [reply, said] of cases) await assert.rejects(fetchCommits("alpha/one", since, { token: "", fetcher: standIn(reply).fetcher }), { message: said });
  assert.equal((await fetchCommits("alpha/one", since, { token: "", fetcher: standIn(() => new Response(`[${" ".repeat(replyMostBytes - 2)}]`)).fetcher })).commits.length, 0, "a reply right at the limit is read");
  assert.equal((await fetchCommits("alpha/one", since, { token: "", fetcher: standIn(() => new Response("[]", { headers: { "content-length": String(replyMostBytes) } })).fetcher })).commits.length, 0, "a length right at the limit is read");
});

test("no answer in time, or no connection, is said in plain words without the token", async () => {
  const hanging = (async (_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
  await assert.rejects(fetchCommits("alpha/one", since, { token, fetcher: hanging, ms: 50 }), { message: "GitHub didn't answer within 0.05 seconds" });
  const down = (async () => {
    throw new TypeError("fetch failed", { cause: new Error(`connect ECONNREFUSED ${token}`) });
  }) as typeof fetch;
  await assert.rejects(fetchCommits("alpha/one", since, { token, fetcher: down }), { message: "couldn't reach GitHub" });
});

test("a reply that stops coming part way is a time-out too", async () => {
  const stalling = (async (_url: string, init?: RequestInit) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("["));
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
        },
      }),
    )) as typeof fetch;
  await assert.rejects(fetchCommits("alpha/one", since, { token: "", fetcher: stalling, ms: 50 }), { message: "GitHub didn't answer within 0.05 seconds" });
});

test("a redirect is never followed, so a token is never sent on, and it's said in plain words", async (t) => {
  let hits = 0;
  let followed = 0;
  const server = createServer((request, response) => {
    if (request.url === "/elsewhere") {
      followed++;
      response.end("[]");
      return;
    }
    hits++;
    response.writeHead(301, { location: "/elsewhere" });
    response.end();
  });
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const toStandIn = ((_url: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}/repos/alpha/one/commits`, init)) as typeof fetch;
  await assert.rejects(fetchCommits("alpha/one", since, { token, fetcher: toStandIn }), { message: "GitHub answered with a redirect, which isn't followed: the repo may have been renamed or moved, so check its name in CATCH_UP_REPOS" });
  assert.deepEqual([hits, followed], [1, 0]);
});

test("repo lists and tokens are checked by GitHub's own naming rules", () => {
  assert.deepEqual(readRepos("alpha/one,beta/two"), ["alpha/one", "beta/two"]);
  assert.equal(readRepos("alpha/one,alpha/one"), null);
  assert.equal(validToken(token), true);
  assert.equal(validToken("ghp_0123456789abcdefghij0123"), false);
});
