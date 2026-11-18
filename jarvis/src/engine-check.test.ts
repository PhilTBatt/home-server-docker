import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession } from "./agent.js";
import { gitRefusal, outsideRefusal } from "./brain-tools.js";
import { apiChatSystem, chatSystem } from "./chat.js";
import type { ChatMode, Engine } from "./config.js";
import {
  apiRefused,
  apiUnderTest,
  judgeRule,
  expectedRequests,
  formatCheck,
  problems,
  runEngineCheck,
  runHubCheck,
  runSavedChatsCheck,
  sdkRefused,
  sdkUnderTest,
  sharedRules,
  type CheckResult,
  type EngineCheckDeps,
  type EngineUnderTest,
  type HubEngineUnderTest,
  type Markers,
  type SavedChatsUnderTest,
} from "./engine-check.js";
import {
  findIgnoredWord,
  findInsideWord,
  findOutsideWord,
  echoFor,
  plainAnswer,
  readGitWord,
  readInsideWord,
  readLinkedWord,
  readOutsideWord,
  searchCaseWord,
  searchHiddenWord,
  searchIgnoredWord,
  searchInsideWord,
  searchLongWord,
  searchOutsideWord,
  type SeenRequest,
  type SeenToolResult,
} from "./stand-in-api.js";
import { hubActionToolNames, hubAnswer, hubReadToolNames } from "./stand-in-hub.js";
import type { Answer, AnswerStats } from "./timing.js";

const markers: Markers = { inside: "inside-123", outside: "outside-456", git: "git-321", settings: "settings-789", hidden: "hidden-111", ignored: "ignored-222", mixedCase: "mixed-333" };

type Reply = { tool: string | null; result?: SeenToolResult; refused?: string[]; spoke?: boolean | null; threw?: string; hang?: boolean; note?: boolean; answer?: string };

function fine(text: string): SeenToolResult {
  return { text, isError: false };
}

function error(text: string): SeenToolResult {
  return { text, isError: true };
}

const sdkDenied = (tool: string): Reply => ({ tool, result: error(`Permission to use ${tool} has been denied.`), refused: [tool] });

const goodReplies: Record<Engine, Record<string, Reply>> = {
  sdk: {
    [readInsideWord]: { tool: "Read", result: fine(`1\t# Index\n3\t${markers.inside}`) },
    [readOutsideWord]: sdkDenied("Read"),
    [readGitWord]: { tool: "Read", result: error("<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>"), refused: ["Read"] },
    [readLinkedWord]: sdkDenied("Read"),
    [searchInsideWord]: { tool: "Grep", result: fine(`index.md:3:${markers.inside}`) },
    [searchOutsideWord]: sdkDenied("Grep"),
    [findInsideWord]: { tool: "Glob", result: fine("index.md\n.hidden-note.md\n.gitignore\nignored-note.md") },
    [findOutsideWord]: sdkDenied("Glob"),
    [searchHiddenWord]: { tool: "Grep", result: fine(`.hidden-note.md:1:${markers.hidden}`) },
    [searchIgnoredWord]: { tool: "Grep", result: fine("No matches found") },
    [findIgnoredWord]: { tool: "Glob", result: fine("ignored-note.md") },
    [searchCaseWord]: { tool: "Grep", result: fine("No matches found") },
    [searchLongWord]: { tool: "Grep", result: fine("long-line.md:1:[Omitted long matching line]") },
  },
  api: {
    [readInsideWord]: { tool: "read_file", result: fine(`# Index\n\n${markers.inside}`) },
    [readOutsideWord]: { tool: "read_file", result: error(outsideRefusal), refused: ["read_file"] },
    [readGitWord]: { tool: "read_file", result: error(gitRefusal), refused: ["read_file"] },
    [readLinkedWord]: { tool: "read_file", result: error(outsideRefusal), refused: ["read_file"] },
    [searchInsideWord]: { tool: "search_files", result: fine(`index.md:3: ${markers.inside}`) },
    [searchOutsideWord]: { tool: "search_files", result: error(outsideRefusal), refused: ["search_files"] },
    [findInsideWord]: { tool: "find_files", result: fine(".gitignore\n.hidden-note.md\nignored-note.md\nindex.md") },
    [findOutsideWord]: { tool: "find_files", result: error(outsideRefusal), refused: ["find_files"] },
    [searchHiddenWord]: { tool: "search_files", result: fine(`.hidden-note.md:1: ${markers.hidden}`) },
    [searchIgnoredWord]: { tool: "search_files", result: fine(`ignored-note.md:1: ${markers.ignored}`) },
    [findIgnoredWord]: { tool: "find_files", result: fine("ignored-note.md") },
    [searchCaseWord]: { tool: "search_files", result: fine(`mixed-case.md:1: ${markers.mixedCase}`) },
    [searchLongWord]: { tool: "search_files", result: fine(`long-line.md:1: long line x${"🙂".repeat(189)}…`) },
  },
};

const systems: Record<Engine, string> = { sdk: chatSystem, api: apiChatSystem };
const offered: Record<Engine, string[]> = { sdk: ["Read", "Grep", "Glob", "DeferredToolPlaceholder"], api: ["read_file", "list_folder", "search_files", "find_files"] };

function statsWith(refusedTools: string[], spokeFirst: boolean | null = true): AnswerStats {
  return { rounds: 2, toolUses: 1, inputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 10, costUsd: null, earlierThinkingBlocks: null, recovered: false, largestRequestTokens: 60, lastRequestTokens: 60, refusedTools, spokeFirst, retried: false };
}

type Fake = {
  replies?: Record<string, Partial<Reply>>;
  hello?: () => Promise<Answer>;
  shape?: (request: SeenRequest) => SeenRequest;
  silent?: boolean;
};

function fakeEngine(engine: Engine, fake: Fake = {}) {
  const requests: SeenRequest[] = [];
  let closes = 0;
  const record = (lastUserText: string, extra: Partial<SeenRequest> = {}) => {
    if (fake.silent) return;
    const seen: SeenRequest = { path: "/v1/messages", streamed: true, model: "claude-haiku-5-5", system: systems[engine], tools: offered[engine], lastUserText, toolResults: [], asked: null, body: JSON.stringify({ last: lastUserText }), ...extra };
    requests.push(fake.shape?.(seen) ?? seen);
  };
  const session: AgentSession = {
    async ask(question, listener = {}) {
      if (question === "Hello") {
        record("Hello");
        return fake.hello?.() ?? { text: plainAnswer, firstWordsMs: 1, totalMs: 2 };
      }
      const word = question.replace("Please ", "");
      const reply = { ...goodReplies[engine][word], ...fake.replies?.[word] };
      if (reply.hang) return new Promise<Answer>(() => {});
      record(question, { asked: reply.tool });
      if (reply.tool !== null && reply.note !== false) listener.tool?.(reply.tool, {});
      if (reply.result !== undefined) record(`[tool result] ${reply.result.text}`, { toolResults: [reply.result], body: JSON.stringify({ result: reply.result.text }) });
      if (reply.threw !== undefined) throw new Error(reply.threw);
      return { text: reply.answer ?? echoFor(`[tool result] ${reply.result?.text ?? ""}`), firstWordsMs: 1, totalMs: 2, stats: statsWith(reply.refused ?? [], reply.spoke === undefined ? true : reply.spoke) };
    },
    readyMs: () => null,
    costUsd: () => null,
    stoppedReason: () => null,
    close: () => {
      closes++;
    },
  };
  const underTest: EngineUnderTest = engine === "sdk" ? sdkUnderTest(session, requests) : apiUnderTest(session, requests);
  return { underTest, requests, closes: () => closes };
}

function goodRequestFor(engine: Engine): SeenRequest {
  return { path: "/v1/messages", streamed: true, model: "claude-haiku-5-5", system: systems[engine], tools: offered[engine], lastUserText: "Hello", toolResults: [], asked: null, body: "{}" };
}

function deps(overrides: Partial<EngineCheckDeps> = {}, sdk: Fake = {}, api: Fake = {}): EngineCheckDeps {
  return {
    engines: [fakeEngine("sdk", sdk).underTest, fakeEngine("api", api).underTest],
    markers,
    model: "claude-haiku-5-5",
    timeoutMs: 1000,
    settleMs: 0,
    countTranscripts: async () => 0,
    engineEnv: () => ({ PATH: "/usr/bin", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" }),
    ...overrides,
  };
}

function failed(results: CheckResult[]): string[] {
  return results.filter((result) => !result.ok).map((result) => result.name);
}

function named(results: CheckResult[], start: string): CheckResult {
  const result = results.find((check) => check.name.startsWith(start));
  assert.ok(result !== undefined, `no check starting ${start}`);
  return result;
}

const rule = (name: string) => `both engines: ${name}`;
const inOrder = "both engines: only Jarvis's own 27 requests each, in order (no title or other extra requests)";
const leakCheck = "both engines: nothing from .git or outside the brain reached the API";
const sdkTools = "Agent SDK: only Read, Grep and Glob are offered";
const apiTools = "plain API call: only read_file, list_folder, search_files and find_files are offered";
const ignoredRule = rule("a search looks inside git-ignored files (Agent SDK differs, as expected: Grep skips what .gitignore lists)");
const caseRule = rule("a search ignores capital letters (Agent SDK differs, as expected: Grep matches capitals unless asked not to)");
const longRule = rule("a long line comes back without broken characters (Agent SDK differs, as expected: Grep leaves out very long lines and names only the file)");

test("two engines that behave pass all 22 checks, named in this order", async () => {
  const results = await runEngineCheck(deps());
  assert.deepEqual(failed(results), []);
  assert.deepEqual(
    results.map((result) => result.name),
    [
      "both engines: a question gets an answer",
      rule("a file in the brain can be read"),
      rule("a file outside the brain is refused"),
      rule("the .git folder is off limits"),
      rule("a link from the brain to a file outside is refused"),
      rule("a search inside the brain finds the file"),
      rule("a search outside the brain is refused"),
      rule("finding files in the brain lists the file, but not .git or links out"),
      rule("finding files outside the brain is refused"),
      rule("a search looks inside hidden files"),
      ignoredRule,
      rule("finding files lists git-ignored files"),
      caseRule,
      longRule,
      leakCheck,
      "both engines: settings and instruction files in the brain are ignored",
      inOrder,
      "both engines: every request uses claude-haiku-5-5",
      sdkTools,
      apiTools,
      "Agent SDK: no chat transcript is saved",
      "Agent SDK: the engine's telemetry and error reports are off",
    ],
  );
});

test("each engine's 27 requests are the question, then each rule's question and its result, in order", async () => {
  const expected = expectedRequests(sharedRules(markers));
  assert.equal(expected.length, 27);
  for (const engine of ["sdk", "api"] as const) {
    const { underTest, requests } = fakeEngine(engine);
    await runEngineCheck({ ...deps(), engines: [underTest] });
    assert.deepEqual(
      requests.map((seen, index) => expected[index].test(seen.lastUserText)),
      Array.from({ length: 27 }, () => true),
      engine,
    );
  }
  assert.equal(expected[0].test("Hello there"), false);
  assert.equal(expected[2].test(`Please ${readInsideWord}`), false);
});

test("a rule that one engine breaks fails, naming that engine and what went wrong", async () => {
  const results = await runEngineCheck(deps({}, {}, { replies: { [readGitWord]: { result: fine(`[core] ${markers.git}`) } } }));
  assert.deepEqual(failed(results), [rule("the .git folder is off limits"), leakCheck]);
  assert.equal(named(results, rule("the .git folder is off limits")).detail, `plain API call: not refused (reported refused: read_file); showed ${markers.git}`);
  const both = await runEngineCheck(deps({}, { replies: { [searchInsideWord]: { result: fine("No matches found") } } }, { replies: { [searchInsideWord]: { result: fine("No matches.") } } }));
  assert.equal(named(both, rule("a search inside the brain finds the file")).detail, `Agent SDK: didn't show ${markers.inside} | plain API call: didn't show ${markers.inside}`);
});

test("each read, search and find rule fails when either engine gets it wrong", async () => {
  const wrong: [string, string, Partial<Reply>][] = [
    [readInsideWord, "a file in the brain can be read", { result: error("There's nothing at that path.") }],
    [readOutsideWord, "a file outside the brain is refused", { result: fine("here it is"), refused: [] }],
    [readLinkedWord, "a link from the brain to a file outside is refused", { result: fine("here it is"), refused: [] }],
    [searchOutsideWord, "a search outside the brain is refused", { result: fine("secret.md"), refused: [] }],
    [findInsideWord, "finding files in the brain lists the file, but not .git or links out", { result: fine("index.md\nlinked/secret.md") }],
    [findOutsideWord, "finding files outside the brain is refused", { result: fine("secret.md"), refused: [] }],
    [searchHiddenWord, "a search looks inside hidden files", { result: fine("No matches found") }],
    [findIgnoredWord, "finding files lists git-ignored files", { result: fine("No files match.") }],
  ];
  for (const engine of ["sdk", "api"] as const) {
    for (const [word, name, reply] of wrong) {
      const fake = { replies: { [word]: reply } };
      const results = await runEngineCheck(engine === "sdk" ? deps({}, fake) : deps({}, {}, fake));
      assert.deepEqual(failed(results), [rule(name)], `${engine} ${word}`);
      assert.match(named(results, rule(name)).detail, new RegExp(`^${engine === "sdk" ? "Agent SDK" : "plain API call"}: `), `${engine} ${word}`);
    }
  }
});

test("a search or file list that shows .git, or anything through a link out, fails", async () => {
  const results = await runEngineCheck(deps({}, { replies: { [searchInsideWord]: { result: fine(`index.md:3:${markers.inside}\n.git/config:1:${markers.git}`) } } }, { replies: { [findInsideWord]: { result: fine("index.md\n.git/config") } } }));
  assert.equal(named(results, rule("a search inside the brain finds the file")).detail, `Agent SDK: showed ${markers.git}`);
  assert.equal(named(results, rule("finding files in the brain lists")).detail, "plain API call: showed .git/");
});

test("a .gitignore file isn't mistaken for the .git folder", async () => {
  const results = await runEngineCheck(deps({}, {}, { replies: { [findInsideWord]: { result: fine(".gitignore\nindex.md") } } }));
  assert.deepEqual(failed(results), []);
});

test("a refusal must be reported by the engine as a refusal of the tool that was asked for, with an error result", async () => {
  const probe = (tool: string | null, refusedTools: string[], results: SeenToolResult[], threw: string | null = null) => ({ tool, used: tool === null ? [] : [tool], refusedTools, spokeFirst: true, answer: null, expectedAnswer: null, threw, results });
  assert.equal(sdkRefused(probe("Grep", ["Grep"], [error("Permission to use Grep has been denied.")])), true);
  assert.equal(sdkRefused(probe("Grep", ["Read"], [error("Permission denied.")])), false);
  assert.equal(sdkRefused(probe("Grep", [], [error("Permission denied.")])), false);
  assert.equal(sdkRefused(probe("Read", ["Read"], [error("x")], "Couldn't reach the API")), false);
  assert.equal(sdkRefused(probe("Read", ["Read"], [])), false);
  assert.equal(sdkRefused(probe("Read", ["Read"], [fine("the file")])), false);
  assert.equal(sdkRefused(probe(null, ["Read"], [error("x")])), false);
  const wrongTool = await runEngineCheck(deps({}, { replies: { [searchOutsideWord]: { refused: ["Read"] } } }));
  assert.deepEqual(failed(wrongTool), [rule("a search outside the brain is refused")]);
  assert.equal(named(wrongTool, rule("a search outside the brain is refused")).detail, "Agent SDK: not refused (reported refused: Read)");
  const extra = await runEngineCheck(deps({}, { replies: { [searchOutsideWord]: { refused: ["Grep", "Read"] } } }));
  assert.equal(named(extra, rule("a search outside the brain is refused")).detail, "Agent SDK: not refused (reported refused: Grep, Read)");
  const nothing = await runEngineCheck(deps({}, {}, { replies: { [findOutsideWord]: { refused: [] } } }));
  assert.equal(named(nothing, rule("finding files outside the brain is refused")).detail, "plain API call: not refused (nothing reported refused)");
  const unreported = await runEngineCheck(deps({}, {}, { replies: { [readLinkedWord]: { refused: [] } } }));
  assert.deepEqual(failed(unreported), [rule("a link from the brain to a file outside is refused")]);
});

test("the plain API call's refusal must be the refusal that rule expects, not the other one, a missing file or another error", () => {
  const probe = (threw: string | null, results: SeenToolResult[]) => ({ tool: "read_file", used: ["read_file"], refusedTools: ["read_file"], spokeFirst: true, answer: null, expectedAnswer: null, threw, results });
  assert.equal(apiRefused(probe(null, [error(outsideRefusal)]), "outside"), true);
  assert.equal(apiRefused(probe(null, [error(gitRefusal)]), "git"), true);
  assert.equal(apiRefused(probe(null, [error(outsideRefusal)]), "git"), false);
  assert.equal(apiRefused(probe(null, [error(gitRefusal)]), "outside"), false);
  assert.equal(apiRefused(probe(null, [error("There's nothing at that path.")]), "outside"), false);
  assert.equal(apiRefused(probe(null, [fine(outsideRefusal)]), "outside"), false);
  assert.equal(apiRefused(probe(null, [error(outsideRefusal), fine("secret")]), "outside"), false);
  assert.equal(apiRefused(probe("Couldn't reach the API", [error(outsideRefusal)]), "outside"), false);
  assert.equal(apiRefused(probe(null, []), "outside"), false);
});

test("a missing file doesn't count as the outside file being refused", async () => {
  const results = await runEngineCheck(deps({}, {}, { replies: { [readOutsideWord]: { result: error("There's nothing at that path.") } } }));
  assert.deepEqual(failed(results), [rule("a file outside the brain is refused")]);
});

test("expected differences pass, and fail if they vanish or the other engine starts doing the same", async () => {
  const sdkFinds = await runEngineCheck(deps({}, { replies: { [searchIgnoredWord]: { result: fine(`ignored-note.md:1:${markers.ignored}`) } } }));
  assert.deepEqual(failed(sdkFinds), [ignoredRule]);
  assert.equal(named(sdkFinds, ignoredRule).detail, "Agent SDK no longer differs (Grep skips what .gitignore lists), so remove that from the expected differences");
  const apiSkips = await runEngineCheck(deps({}, {}, { replies: { [searchIgnoredWord]: { result: fine("No matches.") } } }));
  assert.equal(named(apiSkips, ignoredRule).detail, `plain API call: didn't show ${markers.ignored}`);
  const sdkCase = await runEngineCheck(deps({}, { replies: { [searchCaseWord]: { result: fine(`mixed-case.md:1:${markers.mixedCase}`) } } }));
  assert.match(named(sdkCase, caseRule).detail, /^Agent SDK no longer differs/);
  const sdkBroken = await runEngineCheck(deps({}, { replies: { [searchIgnoredWord]: { result: error("ripgrep not found"), threw: "Couldn't run" } } }));
  assert.equal(named(sdkBroken, ignoredRule).detail, "Agent SDK: Couldn't run");
});

test("the long line must come back whole or left out, never with half a character", async () => {
  const halfEmoji = "\ud83d";
  const apiCut = await runEngineCheck(deps({}, {}, { replies: { [searchLongWord]: { result: fine(`long-line.md:1: long line x${"🙂".repeat(94)}${halfEmoji}`) } } }));
  assert.deepEqual(failed(apiCut), [longRule]);
  assert.equal(named(apiCut, longRule).detail, "plain API call: a result has a broken character");
  const sdkCut = await runEngineCheck(deps({}, { replies: { [searchLongWord]: { result: fine(`long-line.md:1:long line x${halfEmoji}`) } } }));
  assert.match(named(sdkCut, longRule).detail, /^Agent SDK: a result has a broken character/);
});

test("half a character is spotted at either end of a pair, as is a replacement character, and whole emoji pass", () => {
  const ok = { tool: "Grep", used: ["Grep"], refusedTools: [], spokeFirst: true, answer: "I read it.", expectedAnswer: "I read it.", threw: null, results: [fine("🙂 fine 👍")] };
  assert.deepEqual(problems({}, ok, false), []);
  for (const text of ["\ud83d end", "start \ude42", "\ude42\ud83d", "cut by bytes \ufffd"]) {
    assert.deepEqual(problems({}, { ...ok, results: [fine(text)] }, false), ["a result has a broken character"], JSON.stringify(text));
  }
});

test("a rule with no tool asked for, or no tool result, fails rather than passing by default", () => {
  assert.deepEqual(problems({}, { tool: null, used: [], refusedTools: [], spokeFirst: true, answer: "I read it.", expectedAnswer: "I read it.", threw: null, results: [fine("x")] }, false), ["no tool was asked for"]);
  assert.deepEqual(problems({ refused: "outside" }, { tool: "Read", used: ["Read"], refusedTools: [], spokeFirst: null, answer: null, expectedAnswer: null, threw: "Couldn't reach the API", results: [] }, false), ["no tool result reached the API (Couldn't reach the API)", "not refused (Couldn't reach the API)"]);
  assert.deepEqual(problems({ found: ["x"] }, { tool: "Read", used: ["Read"], refusedTools: [], spokeFirst: true, answer: "I read it.", expectedAnswer: "I read it.", threw: null, results: [] }, false), ["no tool result reached the API", "didn't show x"]);
  assert.equal(judgeRule(sharedRules(markers)[0], [fakeEngine("api").underTest], new Map()).detail, `plain API call: no tool was asked for; no tool result reached the API (not asked); not asked; didn't show ${markers.inside}`);
});

test("a wrong answer, or no answer, from either engine fails the first check", async () => {
  const wrong = await runEngineCheck(deps({}, {}, { hello: async () => ({ text: "Something else", firstWordsMs: 1, totalMs: 2 }) }));
  assert.deepEqual(failed(wrong), ["both engines: a question gets an answer"]);
  assert.equal(wrong[0].detail, "plain API call: Something else");
  const none = await runEngineCheck(deps({}, { hello: () => Promise.reject(new Error("Couldn't reach the API")) }));
  assert.equal(none[0].detail, "Agent SDK: Couldn't reach the API");
});

test("the outside file's or .git's words in any request from either engine fail, even if the read was refused", async () => {
  for (const marker of [markers.outside, markers.git]) {
    const shape = (request: SeenRequest) => (request.lastUserText === "Hello" ? { ...request, body: `{"messages":[{"content":"${marker}"}]}` } : request);
    assert.deepEqual(failed(await runEngineCheck(deps({}, { shape }))), [leakCheck], `sdk ${marker}`);
    assert.deepEqual(failed(await runEngineCheck(deps({}, {}, { shape }))), [leakCheck], `api ${marker}`);
  }
});

test("a settings or instruction file's words reaching the API from either engine fail", async () => {
  const shape = (request: SeenRequest) => (request.lastUserText === "Hello" ? { ...request, body: `{"system":"${markers.settings}"}` } : request);
  assert.deepEqual(failed(await runEngineCheck(deps({}, {}, { shape }))), ["both engines: settings and instruction files in the brain are ignored"]);
});

test("an extra request, a missing one, or one without Jarvis's own prompt fails the order check, naming the engine", async () => {
  const sdk = fakeEngine("sdk", {
    hello: async () => {
      sdk.requests.push({ ...goodRequestFor("sdk"), lastUserText: "[SUGGESTION MODE: Suggest what the user might type]" });
      return { text: plainAnswer, firstWordsMs: 1, totalMs: 2 };
    },
  });
  const extra = await runEngineCheck({ ...deps(), engines: [sdk.underTest, fakeEngine("api").underTest] });
  assert.deepEqual(failed(extra), [inOrder]);
  assert.match(named(extra, inOrder).detail, /^Agent SDK sent 28: "Hello", "\[SUGGESTION MODE/);
  const short = fakeEngine("api", { replies: { [searchLongWord]: { result: undefined } } });
  const missing = await runEngineCheck({ ...deps(), engines: [fakeEngine("sdk").underTest, short.underTest] });
  assert.ok(failed(missing).includes(inOrder));
  assert.match(named(missing, inOrder).detail, /^plain API call sent 26: /);
  const titled = await runEngineCheck(deps({}, {}, { shape: (request) => (request.lastUserText === "Hello" ? { ...request, system: "Generate a short title" } : request) }));
  assert.deepEqual(failed(titled), [inOrder]);
  assert.match(named(titled, inOrder).detail, /^plain API call sent 27: /);
});

test("requests to other paths don't count as requests to Claude", async () => {
  const sdk = fakeEngine("sdk");
  const other: SeenRequest = { path: "/api/hello", streamed: false, model: null, system: '""', tools: [], lastUserText: "", toolResults: [], asked: null, body: "" };
  sdk.requests.unshift(other);
  const results = await runEngineCheck({ ...deps(), engines: [sdk.underTest, fakeEngine("api").underTest] });
  assert.deepEqual(failed(results), []);
});

test("another model fails its check, naming the engine", async () => {
  const results = await runEngineCheck(deps({}, {}, { shape: (request) => (request.lastUserText === "Hello" ? { ...request, model: "claude-sonnet-5-5" } : request) }));
  assert.deepEqual(failed(results), ["both engines: every request uses claude-haiku-5-5"]);
  assert.equal(named(results, "both engines: every request uses").detail, "plain API call: 1 of 27 didn't");
});

test("each engine may offer only its own tools, and must offer all of them every time", async () => {
  for (const tool of ["Bash", "Write", "Edit", "Skill", "ToolSearch", "WebFetch", "mcp__hub__get_status", "read_file"]) {
    const results = await runEngineCheck(deps({}, { shape: (request) => ({ ...request, tools: [...request.tools, tool] }) }));
    assert.deepEqual(failed(results), [sdkTools], tool);
  }
  const withoutFind = await runEngineCheck(deps({}, {}, { shape: (request) => (request.lastUserText === "Hello" ? { ...request, tools: ["read_file", "list_folder", "search_files"] } : request) }));
  assert.deepEqual(failed(withoutFind), [apiTools]);
  assert.match(named(withoutFind, apiTools).detail, /1 requests without all 4$/);
  for (const tool of ["Grep", "write_file"]) {
    const extra = await runEngineCheck(deps({}, {}, { shape: (request) => ({ ...request, tools: [...request.tools, tool] }) }));
    assert.deepEqual(failed(extra), [apiTools], tool);
  }
});

test("with no requests seen from an engine, its checks fail rather than pass by default", async () => {
  const results = await runEngineCheck(deps({}, {}, { silent: true }));
  assert.ok(failed(results).includes(inOrder));
  assert.ok(failed(results).includes("both engines: every request uses claude-haiku-5-5"));
  assert.ok(failed(results).includes(apiTools));
  assert.ok(!failed(results).includes(sdkTools));
  assert.equal(named(results, rule("a file in the brain can be read")).detail, "plain API call: no tool was asked for; no tool result reached the API; didn't show inside-123");
});

test("requests that arrive after the last answer are waited for and counted", async () => {
  const sdk = fakeEngine("sdk", { replies: { [searchLongWord]: {} } });
  const late = { ...goodRequestFor("sdk"), lastUserText: "[SUGGESTION MODE: Suggest what the user might type]" };
  const session = sdk.underTest.session;
  const ask = session.ask.bind(session);
  session.ask = async (question, listener) => {
    const answer = await ask(question, listener);
    if (question.includes(searchLongWord)) setTimeout(() => sdk.requests.push(late), 5);
    return answer;
  };
  assert.deepEqual(failed(await runEngineCheck({ ...deps({ settleMs: 30 }), engines: [sdk.underTest, fakeEngine("api").underTest] })), [inOrder]);
});

test("a question that never answers fails within the time limit and closes that engine's session", async () => {
  const api = fakeEngine("api", { replies: { [readInsideWord]: { hang: true } } });
  const results = await runEngineCheck({ ...deps({ timeoutMs: 20 }), engines: [fakeEngine("sdk").underTest, api.underTest] });
  assert.match(named(results, rule("a file in the brain can be read")).detail, /^plain API call: no tool was asked for; no tool result reached the API \(No answer within 0\.02 seconds\)/);
  assert.ok(api.closes() >= 1);
});

test("a closed session's error is reported as it is", async () => {
  const results = await runEngineCheck(deps({}, { hello: () => Promise.reject(new Error(closedMessage)) }));
  assert.equal(results[0].detail, `Agent SDK: ${closedMessage}`);
});

test("a saved transcript fails, and so does not being able to look", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ countTranscripts: async () => 1 }))), ["Agent SDK: no chat transcript is saved"]);
  const unreadable = await runEngineCheck(deps({ countTranscripts: () => Promise.reject(new Error("EACCES")) }));
  assert.deepEqual(failed(unreadable), ["Agent SDK: no chat transcript is saved"]);
  assert.equal(named(unreadable, "Agent SDK: no chat transcript is saved").detail, "EACCES");
});

test("the Agent SDK must be started with telemetry and error reports off", async () => {
  const quiet = "Agent SDK: the engine's telemetry and error reports are off";
  for (const env of [{ DISABLE_ERROR_REPORTING: "1" }, { DISABLE_TELEMETRY: "1" }, { DISABLE_TELEMETRY: "", DISABLE_ERROR_REPORTING: "1" }, {}]) {
    assert.deepEqual(failed(await runEngineCheck(deps({ engineEnv: () => env }))), [quiet], JSON.stringify(env));
  }
  const none = await runEngineCheck(deps({ engineEnv: () => undefined }));
  assert.deepEqual(failed(none), [quiet]);
  assert.equal(named(none, quiet).detail, "no environment was given to the engine");
  assert.deepEqual(failed(await runEngineCheck(deps({ engineEnv: () => ({ DISABLE_TELEMETRY: "0", DISABLE_ERROR_REPORTING: "true" }) }))), []);
});

test("checking only the plain API call leaves out the Agent SDK's own checks and differences, and names the engine", async () => {
  const results = await runEngineCheck({ ...deps({ countTranscripts: async () => 5, engineEnv: () => undefined }), engines: [fakeEngine("api").underTest] });
  assert.equal(results.length, 19);
  assert.deepEqual(failed(results), []);
  assert.ok(results.every((result) => result.name.startsWith("plain API call: ")));
  assert.ok(!results.some((result) => result.name.includes("Agent SDK")));
  assert.ok(results.some((result) => result.name === "plain API call: only Jarvis's own 27 requests, in order (no title or other extra requests)"));
});

test("a tool used without its note on screen fails, for either engine", async () => {
  const sdk = await runEngineCheck(deps({}, { replies: { [searchInsideWord]: { note: false } } }));
  assert.deepEqual(failed(sdk), [rule("a search inside the brain finds the file")]);
  assert.equal(named(sdk, rule("a search inside the brain finds the file")).detail, "Agent SDK: no tool note for Grep");
  const api = await runEngineCheck(deps({}, {}, { replies: { [readOutsideWord]: { note: false } } }));
  assert.equal(named(api, rule("a file outside the brain is refused")).detail, "plain API call: no tool note for read_file");
});

test("a tool result that never turns into its answer fails, for either engine, even after a refusal", async () => {
  const sdk = await runEngineCheck(deps({}, { replies: { [readInsideWord]: { answer: "" } } }));
  assert.deepEqual(failed(sdk), [rule("a file in the brain can be read")]);
  assert.equal(named(sdk, rule("a file in the brain can be read")).detail, "Agent SDK: the answer after the tool didn't come back");
  const api = await runEngineCheck(deps({}, {}, { replies: { [findIgnoredWord]: { answer: "Let me look." } } }));
  assert.equal(named(api, rule("finding files lists git-ignored files")).detail, "plain API call: the answer after the tool didn't come back");
  const refusedBlank = await runEngineCheck(deps({}, {}, { replies: { [readOutsideWord]: { answer: "" } } }));
  assert.deepEqual(failed(refusedBlank), [rule("a file outside the brain is refused")]);
  assert.equal(named(refusedBlank, rule("a file outside the brain is refused")).detail, "plain API call: the answer after the tool didn't come back");
});

test("an answer must be the one for this question, not an earlier one or earlier ones piled up", async () => {
  const insideEcho = echoFor(`[tool result] # Index\n\n${markers.inside}`);
  const stale = await runEngineCheck(deps({}, {}, { replies: { [readOutsideWord]: { answer: insideEcho } } }));
  assert.deepEqual(failed(stale), [rule("a file outside the brain is refused")]);
  const piled = await runEngineCheck(deps({}, {}, { replies: { [readOutsideWord]: { answer: `${insideEcho}${echoFor(`[tool result] ${outsideRefusal}`)}` } } }));
  assert.deepEqual(failed(piled), [rule("a file outside the brain is refused")]);
});

test("the plain API call refusing .git as if it were outside the brain fails", async () => {
  const results = await runEngineCheck(deps({}, {}, { replies: { [readGitWord]: { result: error(outsideRefusal) } } }));
  assert.deepEqual(failed(results), [rule("the .git folder is off limits")]);
});

test("a request with the other engine's system prompt fails the order check", async () => {
  const results = await runEngineCheck(deps({}, {}, { shape: (request) => ({ ...request, system: chatSystem }) }));
  assert.deepEqual(failed(results), [inOrder]);
  assert.match(named(results, inOrder).detail, /^plain API call sent 27: /);
});

test("the model check says how many requests used another model, or that there were none", async () => {
  const results = await runEngineCheck(deps({}, { shape: (request) => (request.lastUserText.startsWith("[tool result]") ? { ...request, model: "claude-sonnet-5-5" } : request) }, { silent: true }));
  assert.equal(named(results, "both engines: every request uses").detail, "Agent SDK: 13 of 27 didn't | plain API call: no requests");
});

test("checking only the Agent SDK says it differs, as expected, without naming itself twice", async () => {
  const results = await runEngineCheck({ ...deps(), engines: [fakeEngine("sdk").underTest] });
  assert.deepEqual(failed(results), []);
  assert.ok(results.some((result) => result.name === "Agent SDK: a search looks inside git-ignored files (it differs, as expected: Grep skips what .gitignore lists)"));
});

test("an engine that doesn't report the words it said before a tool fails, naming the engine", async () => {
  const results = await runEngineCheck(deps({}, {}, { replies: { [searchHiddenWord]: { spoke: false } } }));
  assert.deepEqual(failed(results), [rule("a search looks inside hidden files")]);
  assert.equal(named(results, rule("a search looks inside hidden files")).detail, "plain API call: didn't report the words said before the tool");
  const unknown = await runEngineCheck(deps({}, { replies: { [readInsideWord]: { spoke: null } } }));
  assert.deepEqual(failed(unknown), [rule("a file in the brain can be read")]);
});

test("the report ticks passes, gives the reason for failures, and ends with a count", () => {
  assert.deepEqual(
    formatCheck([
      { name: "one", ok: true, detail: "fine" },
      { name: "two", ok: false, detail: "broke" },
    ]),
    ["✓ one", "✗ two: broke", "1 of 2 checks failed."],
  );
  assert.deepEqual(formatCheck([{ name: "one", ok: true, detail: "" }]), ["✓ one", "All 1 checks passed."]);
});

type SavedFake = { freshSaves?: boolean; resumeLoads?: boolean; freshLoads?: boolean; resumeSaves?: boolean; freshOverwrites?: boolean; resumeSavesOnce?: boolean; savesOnlyLatest?: boolean; losesAnswers?: boolean; freshDeletes?: boolean; resumeAddsFile?: boolean; newKeepsOld?: boolean; newSavesNothing?: boolean; answer?: string; forgetsSize?: boolean; newKeepsSize?: boolean; noSize?: boolean };

function sizeStats(tokens: number | null) {
  return { rounds: 1, toolUses: 0, inputTokens: tokens ?? 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 1, costUsd: null, earlierThinkingBlocks: null, recovered: false, largestRequestTokens: tokens, lastRequestTokens: tokens, refusedTools: [], spokeFirst: null, retried: null };
}

function savedChatsEngine(engine: Engine, fake: SavedFake = {}): SavedChatsUnderTest {
  const requests: SeenRequest[] = [];
  let store: string[] | null = null;
  let storedSize: number | null = null;
  let extraFiles = 0;
  return {
    engine,
    requests,
    saved: async () => (store === null ? 0 : 1 + extraFiles),
    start: async (mode: ChatMode | "new") => {
      if (mode === "new" && fake.newKeepsOld !== true) store = null;
      const chats: ChatMode = mode === "new" ? "resume" : mode;
      const loads = chats === "resume" ? (mode !== "new" || fake.newKeepsOld === true) && fake.resumeLoads !== false : fake.freshLoads === true;
      const saves =
        chats === "resume"
          ? fake.resumeSaves !== false && !(fake.resumeSavesOnce === true && store !== null) && !(mode === "new" && fake.newSavesNothing === true)
          : fake.freshSaves === true || (fake.freshOverwrites === true && store !== null);
      const history = loads ? [...(store ?? [])] : [];
      const offered = (loads && store !== null) || (mode === "new" && fake.newKeepsSize === true);
      const knownSize = offered && fake.forgetsSize !== true ? (storedSize ?? undefined) : undefined;
      const session: AgentSession = {
        async ask(question) {
          requests.push({ ...goodRequestFor(engine), lastUserText: question, body: JSON.stringify([...history, question]) });
          const text = fake.answer ?? plainAnswer;
          const size = fake.noSize === true ? null : (history.length + 1) * 10;
          history.push(question, text);
          if (saves) {
            store = fake.savesOnlyLatest === true ? [question, text] : fake.losesAnswers === true ? history.filter((item) => item !== text) : [...history];
            if (engine === "api") storedSize = size;
          }
          if (chats === "fresh" && fake.freshDeletes === true) store = null;
          if (chats === "resume" && fake.resumeAddsFile === true && store !== null && history.length > 2) extraFiles++;
          return { text, firstWordsMs: 1, totalMs: 2, stats: sizeStats(size) };
        },
        readyMs: () => null,
        costUsd: () => null,
        stoppedReason: () => null,
        close: () => {},
      };
      const rememberSize = engine === "sdk" && saves ? async (tokens: number) => void (storedSize = tokens) : undefined;
      return { ...session, ...(knownSize === undefined ? {} : { knownSize }), ...(rememberSize === undefined ? {} : { rememberSize }) };
    },
  };
}

const savedNamesBeforeNew = ["both engines: a fresh chat saves nothing", "both engines: with nothing saved yet, a resumed chat starts one and saves it", "both engines: a resumed chat picks up where the last one stopped", "both engines: a fresh chat leaves a saved one alone"];
const savedNames = [...savedNamesBeforeNew, "both engines: new starts a chat without the old one, and that's the one picked up next", "both engines: a resumed chat starts with the size its last answer reached, and new starts with none"];

function savedDeps(sdk: SavedFake = {}, api: SavedFake = {}) {
  return { engines: [savedChatsEngine("sdk", sdk), savedChatsEngine("api", api)], marker: "saved-999", timeoutMs: 1000, settleMs: 0 };
}

test("two engines that save and pick up chats properly pass all six saved-chat checks", async () => {
  const results = await runSavedChatsCheck(savedDeps());
  assert.deepEqual(results.map((result) => result.name), savedNames);
  assert.deepEqual(failed(results), []);
});

test("each way of getting saved chats wrong fails its own check, naming the engine", async () => {
  const cases: [SavedFake, string[]][] = [
    [{ freshSaves: true }, [...savedNamesBeforeNew, savedNames[5]]],
    [{ resumeSaves: false }, [savedNames[1], savedNames[2], savedNames[4], savedNames[5]]],
    [{ resumeLoads: false }, [savedNames[2], savedNames[4], savedNames[5]]],
    [{ savesOnlyLatest: true }, [savedNames[2]]],
    [{ losesAnswers: true }, [savedNames[2]]],
    [{ freshDeletes: true }, [savedNames[2], savedNames[3], savedNames[5]]],
    [{ freshLoads: true }, [savedNames[3]]],
    [{ freshOverwrites: true }, [savedNames[2], savedNames[3], savedNames[5]]],
    [{ resumeSavesOnce: true }, [savedNames[2], savedNames[5]]],
    [{ newKeepsOld: true }, [savedNames[4], savedNames[5]]],
    [{ newSavesNothing: true }, [savedNames[4], savedNames[5]]],
    [{ forgetsSize: true }, [savedNames[5]]],
    [{ newKeepsSize: true }, [savedNames[5]]],
    [{ noSize: true }, [savedNames[5]]],
    [{ answer: "Something else" }, savedNames.slice(0, 5)],
  ];
  for (const [fake, names] of cases) {
    const results = await runSavedChatsCheck(savedDeps({}, fake));
    assert.deepEqual(failed(results), names, JSON.stringify(fake));
    for (const name of names) assert.match(named(results, name).detail, /^plain API call: /, `${JSON.stringify(fake)} ${name}`);
  }
});

test("a saved-chat question that never answers fails within the time limit", async () => {
  const engine = savedChatsEngine("api");
  const start = engine.start;
  engine.start = async (chats) => {
    const session = await start(chats);
    return { ...session, ask: () => new Promise<Answer>(() => {}) };
  };
  const results = await runSavedChatsCheck({ engines: [engine], marker: "saved-999", timeoutMs: 20, settleMs: 0 });
  assert.equal(results.length, 6);
  assert.ok(results.every((result) => !result.ok && result.name.startsWith("plain API call: ")));
  assert.match(results[0].detail, /answered "failed: No answer within 0\.02 seconds"/);
});

test("with no engines given, the saved-chat checks fail rather than pass by default", async () => {
  const results = await runSavedChatsCheck({ engines: [], marker: "m", timeoutMs: 20, settleMs: 0 });
  assert.ok(results.every((result) => !result.ok));
});

test("an engine that keeps each resumed chat in a new file still passes, as long as each picks up the last", async () => {
  assert.deepEqual(failed(await runSavedChatsCheck(savedDeps({ resumeAddsFile: true }, { resumeAddsFile: true }))), []);
});

type HubFake = { offersAction?: boolean; missesRead?: boolean; noAnswer?: boolean; noNote?: boolean; problemNote?: boolean; wrongToken?: boolean; actionsOn?: boolean; noCalls?: boolean; leaks?: boolean; silentWhenBroken?: boolean; wrongNote?: boolean; throws?: boolean };

let toolUnderWay = false;

const hubToken = "hub-token-999";
const brokenNote = (engine: Engine) => `broken ${engine}`;

function hubEngine(engine: Engine, fake: HubFake = {}): HubEngineUnderTest {
  const toolName = (name: string) => (engine === "sdk" ? `mcp__hub__${name}` : name);
  const requests: SeenRequest[] = [];
  const reads = hubReadToolNames.filter((name) => !(fake.missesRead === true && name === "get_backup")).map(toolName);
  const tools = [...reads, ...(fake.offersAction === true ? [toolName(hubActionToolNames[0])] : [])];
  const session: AgentSession = {
    async ask(question, listener) {
      if (fake.throws === true) throw new Error("engine fell over");
      requests.push({ ...goodRequestFor(engine), tools, lastUserText: question, body: fake.leaks === true ? hubToken : "{}" });
      if (fake.problemNote === true) listener?.note?.("The hub's tools didn't load (no tools listed), so in this chat Jarvis can only read the brain");
      toolUnderWay = true;
      if (fake.noNote !== true) listener?.tool?.(toolName("get_status"), {});
      await Promise.resolve();
      toolUnderWay = false;
      const text = fake.noAnswer === true ? "nothing" : JSON.stringify({ tool: "get_status", answer: hubAnswer });
      requests.push({ ...goodRequestFor(engine), tools, lastUserText: `[tool result] ${text}`, toolResults: [{ text, isError: false }] });
      return { text: "Done.", firstWordsMs: 1, totalMs: 2 };
    },
    readyMs: () => null,
    costUsd: () => null,
    stoppedReason: () => null,
    close: () => {},
  };
  return {
    engine,
    session,
    requests,
    toolName,
    calls: async () => (fake.noCalls === true ? [] : [{ tool: "get_status", token: fake.wrongToken === true ? "other" : hubToken, actions: fake.actionsOn === true ? "on" : "off", anthropicKey: false }]),
    broken: async () => (fake.silentWhenBroken === true ? null : fake.wrongNote === true ? "something else" : brokenNote(engine)),
  };
}

const hubNames = [
  "the hub's seven read tools are offered, and its actions aren't",
  "a hub tool's answer reaches the API",
  "the hub's MCP server gets the token, in read-only mode",
  "the token never reaches the API or a command line",
  "a hub server that won't start is reported",
];

const harmlessLines = async () => ["/usr/local/bin/node /mcp/dist/server.js", "claude --mcp-config {\"MCP_ACTIONS\":\"off\"}"];

function hubDeps(sdk: HubFake = {}, api: HubFake = {}, commandLines: () => Promise<string[]> = harmlessLines) {
  return { engines: [hubEngine("sdk", sdk), hubEngine("api", api)], token: hubToken, brokenNote, commandLines, timeoutMs: 1000 };
}

test("engines that use the hub's tools properly pass all five hub checks, named for the engines checked", async () => {
  const both = await runHubCheck(hubDeps());
  assert.deepEqual(both.map((result) => result.name), hubNames.map((name) => `both engines: ${name}`));
  assert.deepEqual(failed(both), []);
  const one = await runHubCheck({ ...hubDeps(), engines: [hubEngine("sdk")] });
  assert.deepEqual(one.map((result) => result.name), hubNames.map((name) => `Agent SDK: ${name}`));
  assert.deepEqual(failed(one), []);
});

test("each way of getting the hub's tools wrong fails its own check, naming the engine", async () => {
  const cases: [HubFake, number[]][] = [
    [{ offersAction: true }, [0]],
    [{ missesRead: true }, [0]],
    [{ noAnswer: true }, [1]],
    [{ noNote: true }, [1]],
    [{ problemNote: true }, [1]],
    [{ wrongToken: true }, [2]],
    [{ actionsOn: true }, [2]],
    [{ noCalls: true }, [2]],
    [{ leaks: true }, [3]],
    [{ silentWhenBroken: true }, [4]],
    [{ wrongNote: true }, [4]],
  ];
  for (const [fake, broken] of cases) {
    for (const engine of ["sdk", "api"] as const) {
      const results = await runHubCheck(engine === "sdk" ? hubDeps(fake) : hubDeps({}, fake));
      assert.deepEqual(failed(results), broken.map((index) => `both engines: ${hubNames[index]}`), `${engine} ${JSON.stringify(fake)}`);
      for (const index of broken) assert.match(named(results, `both engines: ${hubNames[index]}`).detail, new RegExp(`^${engine === "sdk" ? "Agent SDK" : "plain API call"}: `));
    }
  }
});

test("a token on any command line fails the token check, shown once, around where it sits and without the token itself; so does not being able to look", async () => {
  const shown = await runHubCheck(hubDeps({}, {}, async () => ["/usr/bin/sleep 5", `claude --mcp-config {"API_TOKEN":"${hubToken}"}`]));
  assert.deepEqual(failed(shown), [`both engines: ${hubNames[3]}`]);
  assert.equal(named(shown, `both engines: ${hubNames[3]}`).detail, `command lines: claude --mcp-config {"API_TOKEN":"<token>"}`);
  const long = await runHubCheck(hubDeps({}, {}, async () => [`${"a".repeat(100)} --token ${hubToken} ${"b".repeat(100)}`]));
  assert.equal(named(long, `both engines: ${hubNames[3]}`).detail, `command lines: …${"a".repeat(51)} --token <token> ${"b".repeat(19)}…`);
  const twice = await runHubCheck(hubDeps({}, {}, async () => [`${"a".repeat(80)} --token=${hubToken},${hubToken} ${"b".repeat(80)}`]));
  const detail = named(twice, `both engines: ${hubNames[3]}`).detail;
  assert.ok(!detail.includes("hub-token"), detail);
  assert.equal(detail, `command lines: …${"a".repeat(51)} --token=<token>,<token> ${"b".repeat(11)}…`);
  const unread = await runHubCheck(
    hubDeps({}, {}, async () => {
      throw new Error("no /proc");
    }),
  );
  assert.deepEqual(failed(unread), [`both engines: ${hubNames[3]}`]);
  assert.equal(named(unread, `both engines: ${hubNames[3]}`).detail, "command lines couldn't be read: no /proc");
});

test("command lines are looked at while each tool call is under way, not only at the end, so one that's only there during a call is caught", async () => {
  let looked = 0;
  const results = await runHubCheck(
    hubDeps({}, {}, async () => {
      looked++;
      return toolUnderWay ? [`node server.js ${hubToken}`] : ["node server.js"];
    }),
  );
  assert.equal(looked, 3);
  assert.deepEqual(failed(results), [`both engines: ${hubNames[3]}`]);
  assert.equal(named(results, `both engines: ${hubNames[3]}`).detail, "command lines: node server.js <token>");
});

test("an engine that fails the hub question fails rather than passing by default, and so does checking no engines", async () => {
  const results = await runHubCheck(hubDeps({ throws: true }));
  assert.deepEqual(failed(results), hubNames.slice(0, 2).map((name) => `both engines: ${name}`));
  assert.match(named(results, `both engines: ${hubNames[1]}`).detail, /answered "failed: engine fell over"/);
  assert.ok((await runHubCheck({ ...hubDeps(), engines: [] })).every((result) => !result.ok));
});
