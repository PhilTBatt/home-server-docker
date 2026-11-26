import assert from "node:assert/strict";
import { test } from "node:test";
import { helperSystem, noNumbers, type Helped, type Helper } from "./look-up.js";
import { hangWord, optionQuestion, privatePage, privatePageWord, publicPage, publicPageWord, startStandInWeb, webAnswer, type WebSeen } from "./stand-in-web.js";
import { aloneCheck, answersCheck, guardCheck, optionCheck, quietCheck, runWebCheck, stopsCheck, toolsCheck, webCheckNames, yesCheck } from "./web-check.js";
import { bareNumber } from "./web-guard-rules.js";

const good: Helped = { answer: webAnswer, error: null, numbers: { ...noNumbers, searches: 1, steps: 2, helperMs: 900, version: "2.1.327" }, found: ["example.org", "example.com"], opened: [], refused: [] };
const loop = (overrides: Partial<WebSeen> = {}): WebSeen => ({ path: "/v1/messages", tools: ["WebFetch", "DeferredToolPlaceholder", "WebSearch"], serverTools: [], system: JSON.stringify([{ type: "text", text: helperSystem }]), body: "Primary working directory: /tmp/jarvis-web-abc123", toolErrors: [], ...overrides });
const searchRequest = (overrides: Partial<WebSeen> = {}): WebSeen => ({ path: "/v1/messages", tools: [], serverTools: ["web_search_20250305"], system: "You run a web search", body: "Perform a web search", toolErrors: [], ...overrides });

test("the answer check passes for the stand-in's answer and names each thing that's off", () => {
  assert.deepEqual(answersCheck(good, null), { name: webCheckNames.answers, ok: true, detail: "as expected" });
  assert.match(answersCheck(null, "spawn failed").detail, /it threw: spawn failed/);
  assert.match(answersCheck(null, null).detail, /gave nothing back/);
  assert.match(answersCheck({ ...good, error: "exit 1" }, null).detail, /reported an error: exit 1/);
  assert.match(answersCheck({ ...good, answer: "something else" }, null).detail, /not the stand-in's/);
  assert.match(answersCheck({ ...good, numbers: { ...good.numbers, searches: 0 } }, null).detail, /0 searches, not 1/);
  assert.match(answersCheck({ ...good, numbers: { ...good.numbers, opened: 1 } }, null).detail, /1 pages opened and 0 refused/);
  assert.match(answersCheck({ ...good, numbers: { ...good.numbers, refused: 1 } }, null).detail, /0 pages opened and 1 refused/);
  assert.match(answersCheck({ ...good, found: ["example.org"] }, null).detail, /sites it found/);
  for (const missing of ["steps", "helperMs", "version"] as const) assert.match(answersCheck({ ...good, numbers: { ...good.numbers, [missing]: null } }, null).detail, /steps, time and version/, missing);
  assert.equal(answersCheck({ ...good, answer: "x", error: "y" }, null).ok, false);
});

test("the tools check passes only when every request with web tools has exactly the two, and searches carry only the search tool", () => {
  assert.equal(toolsCheck([loop(), searchRequest(), loop()]).ok, true);
  assert.match(toolsCheck([searchRequest()]).detail, /no request with the web tools/);
  assert.match(toolsCheck([loop()]).detail, /no search request/);
  for (const extra of ["Read", "Bash", "mcp__hub__get_status", "Grep"]) assert.match(toolsCheck([loop({ tools: ["WebFetch", "WebSearch", extra] }), searchRequest()]).detail, /a request offered/, extra);
  assert.match(toolsCheck([loop({ serverTools: ["code_execution_20250522"] }), searchRequest()]).detail, /also carried/);
  assert.match(toolsCheck([loop(), searchRequest({ serverTools: ["web_search_20250305", "web_fetch_20250910"] })]).detail, /a search request carried/);
  assert.match(toolsCheck([loop(), searchRequest({ tools: ["Read"] })]).detail, /a search request carried/);
  assert.equal(toolsCheck([loop({ path: "/v1/other", tools: ["WebSearch", "Bash"] }), loop(), searchRequest()]).ok, true, "only requests to the messages path count");
});

test("the alone check wants the helper's instructions and folder on every request, and none of Jarvis's secrets anywhere", () => {
  assert.equal(aloneCheck([loop(), searchRequest()], ["sk-ant-jarvis-1", "hub-1"]).ok, true);
  assert.equal(aloneCheck([loop({ system: helperSystem })], []).ok, true);
  assert.match(aloneCheck([searchRequest()], []).detail, /no request with the web tools/);
  assert.match(aloneCheck([loop({ system: "You are Claude Code" })], []).detail, /didn't carry the helper's instructions/);
  assert.match(aloneCheck([loop({ body: "Primary working directory: /brain" })], []).detail, /didn't come from the helper's own folder/);
  assert.match(aloneCheck([loop({ body: "jarvis-web-x and hub-1" })], ["sk-ant-jarvis-1", "hub-1"]).detail, /carried something of Jarvis's/);
  assert.match(aloneCheck([loop(), searchRequest({ body: "sk-ant-jarvis-1" })], ["sk-ant-jarvis-1"]).detail, /carried something of Jarvis's/);
  assert.match(aloneCheck([loop({ system: `${helperSystem} hub-1` })], ["hub-1"]).detail, /carried something of Jarvis's/);
  const twice = aloneCheck([loop({ body: "jarvis-web-x hub-1" }), loop({ body: "jarvis-web-y hub-1" })], ["hub-1"]).detail;
  assert.equal(twice.split("carried something").length - 1, 1, "the same problem is said once");
});

test("the guard check wants one refusal, of the private page, with Claude told why", () => {
  const refused: Helped = { ...good, numbers: { ...good.numbers, refused: 1 }, refused: ["192.168.0.1"] };
  const told = [loop({ toolErrors: [`PreToolUse:WebFetch hook error: [x]: ${bareNumber}`] })];
  assert.equal(guardCheck(refused, null, told).ok, true);
  assert.match(guardCheck(null, "boom", told).detail, /it threw: boom/);
  assert.match(guardCheck(null, null, told).detail, /gave nothing back/);
  assert.match(guardCheck({ ...refused, numbers: { ...refused.numbers, refused: 0, opened: 1 } }, null, told).detail, /0 refused and 1 opened/);
  assert.match(guardCheck({ ...refused, numbers: { ...refused.numbers, opened: 1 } }, null, told).detail, /1 refused and 1 opened/);
  assert.match(guardCheck({ ...refused, refused: [] }, null, told).detail, /sites it refused/);
  assert.match(guardCheck({ ...refused, answer: null }, null, told).detail, /not the stand-in's/);
  assert.match(guardCheck(refused, null, [loop({ toolErrors: ["Hostname/IP does not match certificate's altnames"] })]).detail, /wasn't told the guard's reason/);
  assert.match(guardCheck(refused, null, [loop()]).detail, /wasn't told the guard's reason/);
  assert.equal(privatePage, "https://192.168.0.1/admin");
});

test("the quiet-guard check wants the page refused and not opened, and the yes-guard check wants it opened and not refused", () => {
  const refused: Helped = { ...good, numbers: { ...good.numbers, refused: 1 }, refused: ["look-up-check.invalid"] };
  const opened: Helped = { ...good, numbers: { ...good.numbers, opened: 1 }, opened: ["look-up-check.invalid"] };
  assert.equal(publicPage, "https://look-up-check.invalid/page");
  assert.deepEqual(quietCheck(refused, null), { name: webCheckNames.quiet, ok: true, detail: "as expected" });
  assert.match(quietCheck(opened, null).detail, /0 refused and 1 opened, not 1 and 0.*sites it refused were \[\].*sites it opened were/);
  assert.match(quietCheck(good, null).detail, /0 refused and 0 opened/);
  assert.match(quietCheck({ ...refused, refused: ["example.org"] }, null).detail, /sites it refused/);
  assert.match(quietCheck(null, "boom").detail, /it threw: boom/);
  assert.match(quietCheck(null, null).detail, /gave nothing back/);
  assert.deepEqual(yesCheck(opened, null), { name: webCheckNames.yes, ok: true, detail: "as expected" });
  assert.match(yesCheck(refused, null).detail, /0 opened and 1 refused, not 1 and 0.*sites it opened were \[\]/);
  assert.match(yesCheck(good, null).detail, /0 opened and 0 refused/);
  assert.match(yesCheck({ ...opened, opened: ["example.org"] }, null).detail, /sites it opened/);
  assert.match(yesCheck(null, "boom").detail, /it threw: boom/);
  assert.match(yesCheck(null, null).detail, /gave nothing back/);
});

test("the option check wants an ordinary answer, only the two tools on offer, and the question in the request as text", () => {
  const asked = loop({ body: `jarvis-web-x {"type":"text","text":"${optionQuestion}"}` });
  assert.equal(optionQuestion, "--model");
  assert.deepEqual(optionCheck(good, null, [asked, searchRequest()]), { name: webCheckNames.option, ok: true, detail: "as expected" });
  assert.match(optionCheck(good, null, [loop(), searchRequest()]).detail, /didn't arrive as the question/);
  assert.match(optionCheck(good, null, [searchRequest({ body: optionQuestion })]).detail, /no request with the web tools/);
  assert.match(optionCheck(good, null, [{ ...asked, tools: ["Bash", "Read", "WebFetch", "WebSearch", "Write"] }]).detail, /a request offered \["Bash","Read","WebFetch","WebSearch","Write"\]/);
  assert.match(optionCheck({ ...good, answer: null, error: "Claude Code ended without a result. It exited with 1." }, null, [asked]).detail, /reported an error.*not the stand-in's/);
  assert.match(optionCheck(null, "boom", [asked]).detail, /it threw: boom/);
  assert.match(optionCheck(null, null, [asked]).detail, /gave nothing back/);
});

test("the stop check wants the helper to end as stopped, with no answer, soon after it's told to", () => {
  const stopped: Helped = { ...good, answer: null, error: "stopped" };
  assert.equal(stopsCheck(stopped, null, 300, 5_000).ok, true);
  assert.match(stopsCheck(stopped, null, 5_001, 5_000).detail, /took 5001 ms to stop/);
  assert.match(stopsCheck(good, null, 300, 5_000).detail, /not stopped/);
  assert.match(stopsCheck({ ...stopped, answer: "late" }, null, 300, 5_000).detail, /not stopped/);
  assert.match(stopsCheck(null, "boom", 0, 5_000).detail, /it threw: boom/);
  assert.match(stopsCheck(null, null, 0, 5_000).detail, /gave nothing back/);
});

test("the whole check asks six look-ups in order, and helpers that do everything right pass all eight", async () => {
  const requests: WebSeen[] = [];
  const asked: string[] = [];
  const helper: Helper = async (question, signal) => {
    asked.push(question);
    if (question.includes(hangWord)) {
      await new Promise((resolve) => signal.addEventListener("abort", resolve));
      return { ...good, answer: null, error: "stopped" };
    }
    if (question.includes(privatePageWord)) {
      requests.push(loop({ toolErrors: [bareNumber] }));
      return { ...good, numbers: { ...good.numbers, refused: 1 }, refused: ["192.168.0.1"] };
    }
    requests.push(loop(question === optionQuestion ? { body: `jarvis-web-x ${question}` } : {}), searchRequest());
    return good;
  };
  const quietGuard: Helper = async (question) => (asked.push(`quiet ${question}`), { ...good, numbers: { ...good.numbers, refused: 1 }, refused: ["look-up-check.invalid"] });
  const yesGuard: Helper = async (question) => (asked.push(`yes ${question}`), { ...good, numbers: { ...good.numbers, opened: 1 }, opened: ["look-up-check.invalid"] });
  const results = await runWebCheck({ helper, quietGuard, yesGuard, requests, markers: ["secret-marker"], stopAfterMs: 20, stopWithinMs: 2_000 });
  assert.deepEqual(results.map((result) => [result.name, result.ok]), [webCheckNames.answers, webCheckNames.tools, webCheckNames.alone, webCheckNames.guard, webCheckNames.quiet, webCheckNames.yes, webCheckNames.option, webCheckNames.stops].map((name) => [name, true]));
  assert.equal(Object.keys(webCheckNames).length, 8);
  assert.equal(asked.length, 6);
  assert.equal(asked[4], optionQuestion);
  assert.ok(!asked[0].includes(privatePageWord) && asked[1].includes(privatePageWord) && asked[2].startsWith("quiet ") && asked[2].includes(publicPageWord) && asked[3].startsWith("yes ") && asked[3].includes(publicPageWord) && asked[5].includes(hangWord));
});

test("the whole check fails the right checks for a helper that throws, and doesn't count the first look-up's errors as the guard's", async () => {
  const requests: WebSeen[] = [];
  const helper: Helper = async (question) => {
    if (!question.includes(privatePageWord) && !question.includes(hangWord)) requests.push(loop({ toolErrors: [bareNumber] }), searchRequest());
    if (question.includes(privatePageWord)) return { ...good, numbers: { ...good.numbers, refused: 1 }, refused: ["192.168.0.1"] };
    if (question.includes(hangWord)) throw new Error("no program");
    return good;
  };
  const results = await runWebCheck({ helper, quietGuard: async () => good, yesGuard: async () => good, requests, markers: [], stopAfterMs: 5, stopWithinMs: 2_000 });
  assert.deepEqual(results.map((result) => result.ok), [true, true, true, false, false, false, false, false]);
  assert.match(results[3].detail, /wasn't told the guard's reason/);
  assert.match(results[4].detail, /0 refused and 0 opened/);
  assert.match(results[5].detail, /0 opened and 0 refused/);
  assert.match(results[6].detail, /didn't arrive as the question/);
  assert.match(results[7].detail, /it threw: no program/);
});

test("the stand-in answers a search request with results, a first question with a search, a private-page question with a fetch, and then the answer", async () => {
  const api = await startStandInWeb();
  try {
    const post = async (body: unknown) => (await fetch(`${api.url}/v1/messages?beta=true`, { method: "POST", body: JSON.stringify(body) })).text();
    const tools = [{ name: "WebFetch" }, { name: "WebSearch" }];
    assert.match(await post({ tools, messages: [{ role: "user", content: "hello" }] }), /"name":"WebSearch"/);
    assert.match(await post({ tools: [{ type: "web_search_20250305", name: "web_search" }], messages: [{ role: "user", content: "Perform a web search" }] }), /web_search_tool_result/);
    const afterSearch = [{ role: "user", content: `${privatePageWord} hello` }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Links: []" }] }];
    assert.match(await post({ tools, messages: afterSearch }), /"name":"WebFetch".*192\.168\.0\.1/s);
    assert.match(await post({ tools, messages: [{ role: "user", content: `${publicPageWord} hello` }, afterSearch[1]] }), /"name":"WebFetch".*look-up-check\.invalid/s);
    assert.match(await post({ tools, messages: [{ role: "user", content: "hello" }, afterSearch[1]] }), new RegExp(webAnswer));
    assert.match(await post({ tools, messages: [...afterSearch, { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "refused", is_error: true }] }] }), new RegExp(webAnswer));
    assert.match(await post({ messages: [{ role: "user", content: "side question" }] }), /Stand-in side answer/);
    assert.equal(await (await fetch(`${api.url}/api/hello`, { method: "HEAD" })).status, 200);
    assert.deepEqual(api.requests.map((seen) => [seen.tools.length, seen.serverTools.length, seen.toolErrors.length]), [[2, 0, 0], [0, 1, 0], [2, 0, 0], [2, 0, 0], [2, 0, 0], [2, 0, 1], [0, 0, 0], [0, 0, 0]]);
  } finally {
    await api.close();
  }
});
