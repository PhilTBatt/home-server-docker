import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { allowedTools, expectedRequests, formatCheck, requiredTools, runEngineCheck, type CheckResult, type EngineCheckDeps } from "./engine-check.js";
import { findInsideWord, findOutsideWord, plainAnswer, readGitWord, readInsideWord, readLinkedWord, readOutsideWord, searchInsideWord, searchOutsideWord, type SeenRequest } from "./stand-in-api.js";
import type { Answer } from "./timing.js";

const insideMarker = "inside-123";
const outsideMarker = "outside-456";
const gitMarker = "git-321";
const settingsMarker = "settings-789";
const system = "You are Jarvis, Phil's assistant.";

function request(lastUserText: string, overrides: Partial<SeenRequest> = {}): SeenRequest {
  return { path: "/v1/messages", streamed: true, model: "claude-haiku-5-5", system, tools: ["Read", "Grep", "Glob", "DeferredToolPlaceholder"], lastUserText, body: JSON.stringify({ system, last: lastUserText }), ...overrides };
}

function goodRequests(): SeenRequest[] {
  return [
    request("Hello"),
    request(`Please ${readInsideWord}`),
    request(`[tool result] 1 # Index ${insideMarker}`),
    request(`Please ${readOutsideWord}`),
    request("[tool result] Permission to use Read has been denied."),
    request(`Please ${readGitWord}`),
    request("[tool result] Permission to use Read has been denied."),
    request(`Please ${readLinkedWord}`),
    request("[tool result] Permission to use Read has been denied."),
    request(`Please ${searchInsideWord}`),
    request("[tool result] Found 1 file index.md"),
    request(`Please ${searchOutsideWord}`),
    request("[tool result] Permission to use Grep has been denied."),
    request(`Please ${findInsideWord}`),
    request("[tool result] index.md"),
    request(`Please ${findOutsideWord}`),
    request("[tool result] Permission to use Glob has been denied."),
  ];
}

function named(results: CheckResult[], name: string): CheckResult {
  const result = results.find((check) => check.name === name);
  assert.ok(result !== undefined, `no check called ${name}`);
  return result;
}

type Behaviour = {
  plain?: () => Promise<Answer>;
  inside?: (listener: AnswerListener) => Promise<Answer>;
  outside?: () => Promise<Answer>;
  git?: () => Promise<Answer>;
  linked?: () => Promise<Answer>;
  search?: (listener: AnswerListener) => Promise<Answer>;
  searchOutside?: () => Promise<Answer>;
  find?: (listener: AnswerListener) => Promise<Answer>;
  findOutside?: () => Promise<Answer>;
};

function answered(text: string): Answer {
  return { text, firstWordsMs: 1, totalMs: 2 };
}

function fakeSession(behaviour: Behaviour = {}) {
  let closes = 0;
  const session: AgentSession = {
    ask(question, listener = {}) {
      if (question === "Hello") return behaviour.plain?.() ?? Promise.resolve({ text: plainAnswer, firstWordsMs: 1, totalMs: 2 });
      if (question.includes(readInsideWord)) {
        if (behaviour.inside !== undefined) return behaviour.inside(listener);
        listener.tool?.("Read", { file_path: "/brain/index.md" });
        return Promise.resolve({ text: `I read it. ${insideMarker}`, firstWordsMs: 1, totalMs: 2 });
      }
      if (question.includes(readOutsideWord)) return behaviour.outside?.() ?? Promise.reject(new Error("Refused: Read"));
      if (question.includes(readGitWord)) return behaviour.git?.() ?? Promise.reject(new Error("Refused: Read"));
      if (question.includes(readLinkedWord)) return behaviour.linked?.() ?? Promise.reject(new Error("Refused: Read"));
      if (question.includes(searchInsideWord)) {
        if (behaviour.search !== undefined) return behaviour.search(listener);
        listener.tool?.("Grep", { pattern: "stand-in brain" });
        return Promise.resolve(answered("I read it. [tool result] Found 1 file index.md"));
      }
      if (question.includes(searchOutsideWord)) return behaviour.searchOutside?.() ?? Promise.reject(new Error("Refused: Grep"));
      if (question.includes(findInsideWord)) {
        if (behaviour.find !== undefined) return behaviour.find(listener);
        listener.tool?.("Glob", { pattern: "**/*.md" });
        return Promise.resolve(answered("I read it. [tool result] index.md"));
      }
      if (question.includes(findOutsideWord)) return behaviour.findOutside?.() ?? Promise.reject(new Error("Refused: Glob"));
      return Promise.reject(new Error(`unexpected question ${question}`));
    },
    readyMs: () => null,
    costUsd: () => null,
    stoppedReason: () => null,
    close: () => {
      closes++;
    },
  };
  return { session, closes: () => closes };
}

function deps(overrides: Partial<EngineCheckDeps> = {}): EngineCheckDeps {
  return {
    session: fakeSession().session,
    requests: goodRequests(),
    insideMarker,
    outsideMarker,
    gitMarker,
    settingsMarker,
    systemMarker: "You are Jarvis",
    model: "claude-haiku-5-5",
    timeoutMs: 1000,
    settleMs: 0,
    countTranscripts: async () => 0,
    engineEnv: () => ({ PATH: "/usr/bin", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" }),
    ...overrides,
  };
}

function failed(results: { name: string; ok: boolean }[]): string[] {
  return results.filter((result) => !result.ok).map((result) => result.name);
}

const inOrder = "only Jarvis's own 17 requests, in order (no title or other extra requests)";
const findInside = "finding files in the brain lists the file, but not .git or links out";
const leakCheck = "nothing from .git or outside the brain reached the API";
const onlyTools = "only Read, Grep and Glob are offered";

test("an engine that behaves passes all sixteen checks", async () => {
  const results = await runEngineCheck(deps());
  assert.equal(results.length, 16);
  assert.deepEqual(failed(results), []);
});

test("Jarvis's 17 requests are the question, then each tool question and its result, in order", () => {
  assert.equal(expectedRequests.length, 17);
  assert.deepEqual(
    goodRequests().map((seen, index) => expectedRequests[index].test(seen.lastUserText)),
    Array.from({ length: 17 }, () => true),
  );
  assert.equal(expectedRequests[0].test("Hello there"), false);
  assert.equal(expectedRequests[2].test(`Please ${readInsideWord}`), false);
});

test("a wrong answer, or no answer, fails the first check", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ session: fakeSession({ plain: async () => ({ text: "Something else", firstWordsMs: 1, totalMs: 2 }) }).session }))), ["a question gets an answer"]);
  assert.deepEqual(failed(await runEngineCheck(deps({ session: fakeSession({ plain: () => Promise.reject(new Error("Couldn't reach the API")) }).session }))), ["a question gets an answer"]);
});

test("reading inside the brain must use Read and come back with the file's words", async () => {
  const noTool = fakeSession({ inside: async () => ({ text: `I read it. ${insideMarker}`, firstWordsMs: 1, totalMs: 2 }) }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: noTool }))), ["a file in the brain can be read"]);
  const wrongWords = fakeSession({
    inside: async (listener) => {
      listener.tool?.("Read", {});
      return { text: "I read it. nothing", firstWordsMs: 1, totalMs: 2 };
    },
  }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: wrongWords }))), ["a file in the brain can be read"]);
});

test("an outside read that isn't refused, or fails some other way, fails the check", async () => {
  const notRefused = await runEngineCheck(deps({ session: fakeSession({ outside: async () => ({ text: "Here it is", firstWordsMs: 1, totalMs: 2 }) }).session }));
  assert.deepEqual(failed(notRefused), ["a file outside the brain is refused"]);
  assert.equal(named(notRefused, "a file outside the brain is refused").detail, "not refused: Here it is");
  assert.deepEqual(failed(await runEngineCheck(deps({ session: fakeSession({ outside: () => Promise.reject(new Error("Overloaded")) }).session }))), ["a file outside the brain is refused"]);
});

test("the outside file's or .git's words anywhere in any request fail, even if the read was refused", async () => {
  for (const marker of [outsideMarker, gitMarker]) {
    const requests = goodRequests();
    requests[1] = { ...requests[1], body: `{"messages":[{"content":"${marker}"},{"content":"Please ${readInsideWord}"}]}` };
    assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), [leakCheck], marker);
  }
});

test("reading .git, or a link out of the brain, must be refused, and refused as a Read", async () => {
  const reading = fakeSession({ git: async () => answered("[core]"), linked: async () => answered("secret") }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: reading }))), ["the .git folder is off limits", "a link from the brain to a file outside is refused"]);
  const wrongReason = fakeSession({ git: () => Promise.reject(new Error("Refused: Bash")), linked: () => Promise.reject(new Error("Couldn't reach the API")) }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: wrongReason }))), ["the .git folder is off limits", "a link from the brain to a file outside is refused"]);
});

test("a settings or instruction file's words reaching the API fail", async () => {
  const requests = goodRequests();
  requests[0] = { ...requests[0], body: `{"system":"${settingsMarker}"}` };
  assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), ["settings and instruction files in the brain are ignored"]);
});

test("an extra request fails the order check, even one carrying Jarvis's own system prompt", async () => {
  const withSuggestion = [...goodRequests().slice(0, 3), request("[SUGGESTION MODE: Suggest what the user might type]"), ...goodRequests().slice(3)];
  const results = await runEngineCheck(deps({ requests: withSuggestion }));
  assert.deepEqual(failed(results), [inOrder]);
  assert.match(named(results, inOrder).detail, /^18 requests: "Hello", /);
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: [...goodRequests(), request("Hello")] }))), [inOrder]);
});

test("a request without Jarvis's system prompt, like a title request, fails the order check", async () => {
  const requests = goodRequests();
  requests[2] = { ...requests[2], system: "Generate a short title" };
  assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), [inOrder]);
});

test("a missing request, or the right requests in the wrong order, fail the order check", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: goodRequests().slice(0, 16) }))), [inOrder]);
  const swapped = goodRequests();
  [swapped[5], swapped[7]] = [swapped[7], swapped[5]];
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: swapped }))), [inOrder]);
});

test("requests to other paths don't count as requests to Claude", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: [...goodRequests(), request("", { path: "/api/hello", system: '""', tools: [], model: null })] }))), []);
});

test("another model fails its check", async () => {
  const requests = goodRequests();
  requests[4] = { ...requests[4], model: "claude-sonnet-5-5" };
  assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), ["every request uses claude-haiku-5-5"]);
});

test("any tool beyond Read, Grep, Glob and the SDK's placeholder fails, and so does a request missing one of the three", async () => {
  assert.deepEqual(requiredTools, ["Read", "Grep", "Glob"]);
  assert.deepEqual(allowedTools, ["Read", "Grep", "Glob", "DeferredToolPlaceholder"]);
  for (const tool of ["Bash", "Write", "Edit", "Skill", "ToolSearch", "WebFetch", "mcp__hub__get_status"]) {
    const requests = goodRequests();
    requests[3] = { ...requests[3], tools: [...requiredTools, tool] };
    assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), [onlyTools], tool);
  }
  for (const without of requiredTools) {
    const requests = goodRequests();
    requests[0] = { ...requests[0], tools: requiredTools.filter((tool) => tool !== without) };
    const results = await runEngineCheck(deps({ requests }));
    assert.deepEqual(failed(results), [onlyTools], without);
    assert.match(named(results, onlyTools).detail, /1 requests without all three$/);
  }
});

test("searching and finding inside the brain must use Grep and Glob and come back with the file", async () => {
  const search = "a search inside the brain finds the file";
  const find = findInside;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: fakeSession({ search: async () => answered("I read it. index.md") }).session }))), [search]);
  const noFile = fakeSession({
    search: async (listener) => {
      listener.tool?.("Grep", {});
      return answered("I read it. [tool result] Error: ripgrep not found");
    },
  }).session;
  const results = await runEngineCheck(deps({ session: noFile }));
  assert.deepEqual(failed(results), [search]);
  assert.equal(named(results, search).detail, "Grep; answer: I read it. [tool result] Error: ripgrep not found");
  assert.deepEqual(failed(await runEngineCheck(deps({ session: fakeSession({ find: async () => answered("index.md") }).session }))), [find]);
});

test("a search or file list inside the brain that shows .git or a link out fails", async () => {
  const search = "a search inside the brain finds the file";
  const showsGit = fakeSession({
    search: async (listener) => {
      listener.tool?.("Grep", {});
      return answered("index.md:3:stand-in brain\n.git/config:1:git brain");
    },
    find: async (listener) => {
      listener.tool?.("Glob", {});
      return answered("index.md\nlinked/secret.md");
    },
  }).session;
  const results = await runEngineCheck(deps({ session: showsGit }));
  assert.deepEqual(failed(results), [search, findInside]);
  assert.match(named(results, search).detail, /^Grep; showed \.git; /);
  assert.match(named(results, findInside).detail, /^Glob; showed linked; /);
});

test("searching or finding outside the brain must be refused, and refused by the tool that tried", async () => {
  const wrongTool = fakeSession({ searchOutside: () => Promise.reject(new Error("Refused: Read")) }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: wrongTool }))), ["a search outside the brain is refused"]);
});

test("searching or finding outside the brain must be refused", async () => {
  const notRefused = fakeSession({ searchOutside: async () => answered("secret.md"), findOutside: async () => answered("secret.md") }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session: notRefused }))), ["a search outside the brain is refused", "finding files outside the brain is refused"]);
});

test("a saved transcript fails, and so does not being able to look", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ countTranscripts: async () => 1 }))), ["no chat transcript is saved"]);
  const unreadable = await runEngineCheck(deps({ countTranscripts: () => Promise.reject(new Error("EACCES")) }));
  assert.deepEqual(failed(unreadable), ["no chat transcript is saved"]);
  assert.equal(named(unreadable, "no chat transcript is saved").detail, "EACCES");
});

test("with no requests seen at all, the request checks fail rather than pass by default", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: [] }))), [inOrder, "every request uses claude-haiku-5-5", onlyTools]);
});

test("requests that arrive after the last answer are waited for and counted", async () => {
  const requests = goodRequests();
  const late = request("[SUGGESTION MODE: Suggest what the user might type]");
  const session = fakeSession({
    outside: () => {
      setTimeout(() => requests.push(late), 5);
      return Promise.reject(new Error("Refused: Read"));
    },
  }).session;
  assert.deepEqual(failed(await runEngineCheck(deps({ session, requests, settleMs: 30 }))), [inOrder]);
});

test("a question that never answers fails within the time limit and closes the session", async () => {
  const { session, closes } = fakeSession({ plain: () => new Promise<Answer>(() => {}) });
  const results = await runEngineCheck(deps({ session, timeoutMs: 20 }));
  assert.equal(results[0].ok, false);
  assert.equal(results[0].detail, "No answer within 0.02 seconds");
  assert.ok(closes() >= 1);
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

test("a closed session's error is reported as it is", async () => {
  const results = await runEngineCheck(deps({ session: fakeSession({ plain: () => Promise.reject(new Error(closedMessage)) }).session }));
  assert.equal(results[0].detail, closedMessage);
});


test("the engine must be started with telemetry and error reports off", async () => {
  const quiet = "the engine's telemetry and error reports are off";
  for (const env of [{ DISABLE_ERROR_REPORTING: "1" }, { DISABLE_TELEMETRY: "1" }, { DISABLE_TELEMETRY: "", DISABLE_ERROR_REPORTING: "1" }, {}]) {
    assert.deepEqual(failed(await runEngineCheck(deps({ engineEnv: () => env }))), [quiet], JSON.stringify(env));
  }
  const none = await runEngineCheck(deps({ engineEnv: () => undefined }));
  assert.deepEqual(failed(none), [quiet]);
  assert.equal(named(none, "the engine's telemetry and error reports are off").detail, "no environment was given to the engine");
  assert.deepEqual(failed(await runEngineCheck(deps({ engineEnv: () => ({ DISABLE_TELEMETRY: "0", DISABLE_ERROR_REPORTING: "true" }) }))), []);
});
