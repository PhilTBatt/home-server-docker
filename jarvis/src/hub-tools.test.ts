import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mock, test } from "node:test";
import { actionQuestion, actionsEnv, allowedHubTools, checkHubServer, describeAction, describeWithHub, fullHash, hubActionTools, hubApiUrl, hubNotBuilt, hubReadTools, hubServerEnv, hubServerFile, hubServerFor, hubToolPrefix, isHubAction, lookUpDownload, lookupMs, nameLimit, noTorrentError, notDoneNote, shownName, withHubToken, type Lookup } from "./hub-tools.js";

test("the hub's MCP server is the built one mounted from mcp/, run with this Node, and its tools are named mcp__hub__ on the Agent SDK", () => {
  assert.equal(hubServerFile, "/mcp/dist/server.js");
  assert.equal(hubToolPrefix, "mcp__hub__");
  assert.deepEqual(hubServerFor("hub-token"), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token", actions: false });
  assert.deepEqual(hubServerFor("hub-token", true), { command: process.execPath, args: ["/mcp/dist/server.js"], token: "hub-token", actions: true });
  assert.deepEqual(hubServerFor("hub-token", false, "/elsewhere/server.js").args, ["/elsewhere/server.js"]);
});

test("the MCP server's actions are on only when asked for, and it's told nothing else", () => {
  assert.deepEqual(actionsEnv(hubServerFor("hub-token")), { MCP_ACTIONS: "off" });
  assert.deepEqual(actionsEnv({ command: "node", args: [], token: "hub-token" }), { MCP_ACTIONS: "off" });
  assert.deepEqual(actionsEnv(hubServerFor("hub-token", true)), { MCP_ACTIONS: "on" });
});

test("an MCP server started by Jarvis himself gets the token and the actions setting", () => {
  assert.deepEqual(hubServerEnv(hubServerFor("hub-token")), { API_TOKEN: "hub-token", MCP_ACTIONS: "off" });
  assert.deepEqual(hubServerEnv(hubServerFor("hub-token", true)), { API_TOKEN: "hub-token", MCP_ACTIONS: "on" });
});

test("Jarvis knows the hub's seven read tools and three actions by name, and accepts the actions only when they're on", () => {
  assert.deepEqual(hubReadTools, ["get_status", "get_alerts", "get_features", "get_downloads", "get_library", "get_wifi_reconnects", "get_backup"]);
  assert.deepEqual(hubActionTools, ["scan_library", "stop_download", "start_download"]);
  assert.deepEqual(allowedHubTools(hubServerFor("t")), hubReadTools);
  assert.deepEqual(allowedHubTools(hubServerFor("t", true)), [...hubReadTools, ...hubActionTools]);
  assert.deepEqual(hubActionTools.map(isHubAction), [true, true, true]);
  assert.deepEqual(["get_status", "read_file", "mcp__hub__scan_library", "Scan_library", ""].map(isHubAction), [false, false, false, false, false]);
});

test("each action is put to Phil in plain words, with a download's hash cut short", () => {
  const hash = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(actionQuestion("scan_library", {}), "Jarvis wants to scan the library. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("stop_download", { hash }), "Jarvis wants to stop the download whose hash starts 01234567. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("start_download", { hash }), "Jarvis wants to start the download whose hash starts 01234567 again. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("start_download", { hash: "abc" }), "Jarvis wants to start the download abc again. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("stop_download", { hash: "ABCDEF0123" }), "Jarvis wants to stop the download whose hash starts ABCDEF01. Type yes to let him, or anything else to stop it");
  for (const input of [{}, null, "x", { hash: 5 }, { hash: "" }, { hash: "\u202eabc" }, { hash: "abc def" }, { hash: "gg" }]) assert.equal(actionQuestion("stop_download", input), "Jarvis wants to stop a download. Type yes to let him, or anything else to stop it");
  assert.equal(actionQuestion("reboot_server", {}), "Jarvis wants to use reboot_server. Type yes to let him, or anything else to stop it");
  assert.equal(notDoneNote, "Phil didn't say yes, so it wasn't done");
});

test("an environment gets the hub's token only with the hub's tools, and never a token it already had", () => {
  const env = { PATH: "/usr/bin", API_TOKEN: "old-token", ANTHROPIC_API_KEY: "key" };
  assert.deepEqual(withHubToken(env, hubServerFor("hub-token")), { PATH: "/usr/bin", ANTHROPIC_API_KEY: "key", API_TOKEN: "hub-token" });
  assert.deepEqual(withHubToken(env, undefined), { PATH: "/usr/bin", ANTHROPIC_API_KEY: "key" });
  assert.deepEqual(withHubToken({ PATH: "/usr/bin" }, undefined), { PATH: "/usr/bin" });
});

test("an unbuilt MCP server stops Jarvis with how to build it; a built one passes", () => {
  assert.throws(() => checkHubServer("/mcp/dist/server.js", () => false), { message: hubNotBuilt("/mcp/dist/server.js") });
  assert.doesNotThrow(() => checkHubServer("/mcp/dist/server.js", (path) => path === "/mcp/dist/server.js"));
  assert.equal(hubNotBuilt("/mcp/dist/server.js"), "JARVIS_HUB_TOOLS is on, but the MCP server isn't built: there's no /mcp/dist/server.js. Build it with npm ci and npm test in mcp/, as the README says");
});

const fullOne = "0123456789abcdef0123456789abcdef01234567";
const typeYes = "Type yes to let him, or anything else to stop it";

test("only a full, lower-case 40-character hash is looked up, as the hub's own rule requires", () => {
  assert.equal(fullHash({ hash: fullOne }), fullOne);
  for (const input of [{ hash: fullOne.toUpperCase() }, { hash: fullOne.slice(1) }, { hash: `${fullOne}0` }, { hash: `${fullOne.slice(1)}g` }, { hash: 5 }, {}, null, fullOne]) assert.equal(fullHash(input), null);
});

test("a download's name is shown on one line, without hidden characters or double quotes, and cut at 80 characters", () => {
  assert.equal(shownName("Some.Film.2024.1080p"), "Some.Film.2024.1080p");
  assert.equal(shownName(" two\nlines\tand  spaces "), "two lines and spaces");
  assert.equal(shownName('a"b\u202ec\u200bd\u001be'), "a'bcd\ufffde");
  assert.equal(shownName("\u201cA\u201d \u201eB\u201f \u2033C\u2036 \uff02D\uff02 \u301dE\u301e\u301f"), "'A' 'B' 'C' 'D' 'E''");
  assert.equal(nameLimit, 80);
  const long = shownName("x".repeat(100));
  assert.deepEqual([[...long].length, long.endsWith("x…")], [80, true]);
  assert.equal(shownName("x".repeat(80)), "x".repeat(80));
  const emoji = shownName("😀".repeat(90));
  assert.equal(emoji, `${"😀".repeat(79)}…`);
  assert.equal(shownName(`${"y".repeat(78)} z${"w".repeat(10)}`), `${"y".repeat(78)}…`);
});

test("a lookup that answers quickly leaves no timer running", async () => {
  const timers = () => process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
  const before = timers();
  await describeAction("stop_download", { hash: fullOne }, async () => ({ name: "Film", percent: 1 }), new AbortController().signal, 30_000);
  await describeAction("stop_download", { hash: fullOne }, async () => null, undefined, 30_000);
  assert.equal(timers(), before);
});

test("stopping or starting asks the hub for the download's name and shows it, with how far it got and the hash's start", async () => {
  const asked: string[] = [];
  const lookup: Lookup = async (hash) => {
    asked.push(hash);
    return { name: "Some.Film.2024.1080p", percent: 62 };
  };
  assert.equal(await describeAction("stop_download", { hash: fullOne }, lookup), `Jarvis wants to stop the download whose hash starts 01234567 (62% done), named "Some.Film.2024.1080p". ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne }, lookup), `Jarvis wants to start the download whose hash starts 01234567 again (62% done), named "Some.Film.2024.1080p". ${typeYes}`);
  assert.deepEqual(asked, [fullOne, fullOne]);
  const quoted: Lookup = async () => ({ name: 'Bad" (hash starts 99999999) named \u201cOther', percent: 1 });
  assert.equal(await describeAction("stop_download", { hash: fullOne }, quoted), `Jarvis wants to stop the download whose hash starts 01234567 (1% done), named "Bad' (hash starts 99999999) named 'Other". ${typeYes}`);
});

test("a hash the hub doesn't have, or a lookup that fails, is said plainly, and the question is still asked", async () => {
  assert.equal(await describeAction("stop_download", { hash: fullOne }, async () => null), `Jarvis wants to stop a download the hub doesn't have (hash starts 01234567). ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne }, async () => null), `Jarvis wants to start a download the hub doesn't have (hash starts 01234567). ${typeYes}`);
  const failing: Lookup = async () => {
    throw new Error("The hub replied 500");
  };
  assert.equal(await describeAction("stop_download", { hash: fullOne }, failing), `Jarvis wants to stop the download whose hash starts 01234567 (couldn't look up its name). ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne }, failing), `Jarvis wants to start the download whose hash starts 01234567 again (couldn't look up its name). ${typeYes}`);
});

test("scanning, or a hash that isn't a full one, isn't looked up; a hash that isn't full is said so", async () => {
  let calls = 0;
  const lookup: Lookup = async () => {
    calls++;
    return { name: "x", percent: 0 };
  };
  for (const [name, input] of [["scan_library", {}], ["get_status", { hash: fullOne }]] as const) {
    assert.equal(await describeAction(name, input, lookup), actionQuestion(name, input));
  }
  assert.equal(await describeAction("stop_download", { hash: "abc" }, lookup), `Jarvis wants to stop the download abc (not a full hash, so it can't be looked up). ${typeYes}`);
  assert.equal(await describeAction("start_download", { hash: fullOne.toUpperCase() }, lookup), `Jarvis wants to start the download whose hash starts 01234567 again (not a full hash, so it can't be looked up). ${typeYes}`);
  assert.equal(await describeAction("stop_download", {}, lookup), `Jarvis wants to stop a download (not a full hash, so it can't be looked up). ${typeYes}`);
  assert.equal(calls, 0);
});

test("a lookup gives up after 5 seconds, or at once when the question is called off, and says it couldn't", async () => {
  assert.equal(lookupMs, 5_000);
  const signals: AbortSignal[] = [];
  const hanging: Lookup = (_hash, signal) =>
    new Promise((_resolve, reject) => {
      signals.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  const started = Date.now();
  assert.equal(await describeAction("stop_download", { hash: fullOne }, hanging, undefined, 50), `Jarvis wants to stop the download whose hash starts 01234567 (couldn't look up its name). ${typeYes}`);
  assert.ok(Date.now() - started < 1000);
  const calledOff = new AbortController();
  const asking = describeAction("stop_download", { hash: fullOne }, hanging, calledOff.signal, 30_000);
  calledOff.abort();
  assert.match(await asking, /couldn't look up its name/);
  assert.match(await describeAction("stop_download", { hash: fullOne }, hanging, new AbortController().signal, 50), /couldn't look up its name/);
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.ok(Date.now() - started < 1000);
});

test("a lookup that ignores being called off still can't hold the question up", { timeout: 5000 }, async () => {
  const deaf: Lookup = () => new Promise(() => {});
  const started = Date.now();
  assert.match(await describeAction("stop_download", { hash: fullOne }, deaf, new AbortController().signal, 50), /couldn't look up its name/);
  const calledOff = new AbortController();
  const asking = describeAction("stop_download", { hash: fullOne }, deaf, calledOff.signal, 30_000);
  calledOff.abort();
  assert.match(await asking, /couldn't look up its name/);
  const already = new AbortController();
  already.abort();
  assert.match(await describeAction("stop_download", { hash: fullOne }, deaf, already.signal, 30_000), /couldn't look up its name/);
  assert.ok(Date.now() - started < 1000);
});

test("the lookup's time limit is 5 seconds unless told otherwise", async () => {
  const delays: number[] = [];
  const realSetTimeout = globalThis.setTimeout;
  mock.method(globalThis, "setTimeout", ((run: () => void, ms: number) => {
    delays.push(ms);
    return realSetTimeout(run, ms);
  }) as typeof setTimeout);
  try {
    await describeAction("stop_download", { hash: fullOne }, async () => null, new AbortController().signal);
  } finally {
    mock.restoreAll();
  }
  assert.deepEqual(delays, [5_000]);
});

test("with the hub's token, a stop or start question asks http://api:3000 for that download, follows no redirects, and shows it", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ name: "Film", percent: 42, speedKBps: 0, etaSeconds: null, state: "stoppedDL", hash: fullOne }));
  try {
    const describe = describeWithHub("hub-token");
    const calledOff = new AbortController();
    assert.equal(await describe("start_download", { hash: fullOne }, calledOff.signal), `Jarvis wants to start the download whose hash starts 01234567 again (42% done), named "Film". ${typeYes}`);
    assert.equal(await describe("scan_library", {}, calledOff.signal), actionQuestion("scan_library", {}));
    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, options] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, `http://api:3000/media/downloads/${fullOne}`);
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer hub-token");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.signal?.aborted, false);
    calledOff.abort();
    assert.equal(options?.signal?.aborted, true);
  } finally {
    mock.restoreAll();
  }
});

async function fakeHub(reply: (request: IncomingMessage) => { status: number; body: string }) {
  const seen: { url: string | undefined; authorization: string | undefined; method: string | undefined }[] = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, authorization: request.headers.authorization, method: request.method });
    const { status, body } = reply(request);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("the lookup asks the hub's API for that one download with the token, and takes its name and progress", async () => {
  assert.equal(hubApiUrl, "http://api:3000");
  const hub = await fakeHub(() => ({ status: 200, body: JSON.stringify({ name: "Film", percent: 42, speedKBps: 1, etaSeconds: null, state: "stoppedDL", hash: fullOne }) }));
  try {
    assert.deepEqual(await lookUpDownload(fullOne, "hub-token", new AbortController().signal, hub.url), { name: "Film", percent: 42 });
    assert.deepEqual(hub.seen, [{ url: `/media/downloads/${fullOne}`, authorization: "Bearer hub-token", method: "GET" }]);
    await assert.rejects(lookUpDownload("fedcba9876543210fedcba9876543210fedcba98", "hub-token", new AbortController().signal, hub.url));
  } finally {
    await hub.close();
  }
});

test("only the hub's own 'no torrent' answer means it doesn't have it; any other reply is a failed lookup", async () => {
  assert.equal(noTorrentError, "No torrent with that hash");
  const replies = [
    { status: 404, body: JSON.stringify({ error: noTorrentError }), expected: null },
    { status: 404, body: JSON.stringify({ message: `Route GET:/media/downloads/${fullOne} not found`, error: "Not Found", statusCode: 404 }), expected: "failed" },
    { status: 500, body: JSON.stringify({ error: noTorrentError }), expected: "failed" },
    { status: 500, body: JSON.stringify({ name: "Film", percent: 42, hash: fullOne }), expected: "failed" },
    { status: 401, body: JSON.stringify({ error: "Unauthorized" }), expected: "failed" },
    { status: 200, body: "not json", expected: "failed" },
    { status: 200, body: JSON.stringify({ name: 5, percent: 1 }), expected: "failed" },
    { status: 200, body: JSON.stringify({ name: "Film", hash: fullOne }), expected: "failed" },
    { status: 200, body: JSON.stringify({ name: "Film", percent: 42 }), expected: "failed" },
    { status: 200, body: JSON.stringify(null), expected: "failed" },
  ];
  for (const { status, body, expected } of replies) {
    const hub = await fakeHub(() => ({ status, body }));
    try {
      const result = await lookUpDownload(fullOne, "hub-token", new AbortController().signal, hub.url).catch(() => "failed");
      assert.deepEqual(result, expected, `${status} ${body}`);
    } finally {
      await hub.close();
    }
  }
});

test("a lookup that's redirected fails rather than following it, even to a server with the right answer", async () => {
  const elsewhere = await fakeHub(() => ({ status: 200, body: JSON.stringify({ name: "Film", percent: 42, hash: fullOne }) }));
  const redirecting = createServer((_request, response) => {
    response.writeHead(302, { location: `${elsewhere.url}/media/downloads/${fullOne}` });
    response.end();
  });
  await new Promise<void>((resolve) => redirecting.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(redirecting.address() as AddressInfo).port}`;
    await assert.rejects(lookUpDownload(fullOne, "hub-token", new AbortController().signal, url));
    assert.deepEqual(elsewhere.seen, []);
  } finally {
    await new Promise((resolve) => redirecting.close(resolve));
    await elsewhere.close();
  }
});

test("a lookup that's called off stops waiting for the hub", async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const started = Date.now();
    await assert.rejects(lookUpDownload(fullOne, "hub-token", AbortSignal.timeout(50), url));
    assert.ok(Date.now() - started < 1000);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
