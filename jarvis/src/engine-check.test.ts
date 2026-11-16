import assert from "node:assert/strict";
import { test } from "node:test";
import { closedMessage, type AgentSession, type AnswerListener } from "./agent.js";
import { allowedTools, expectedRequests, formatCheck, runEngineCheck, type EngineCheckDeps } from "./engine-check.js";
import { plainAnswer, readInsideWord, readOutsideWord, type SeenRequest } from "./stand-in-api.js";
import type { Answer } from "./timing.js";

const insideMarker = "inside-123";
const outsideMarker = "outside-456";
const settingsMarker = "settings-789";
const system = "You are Jarvis, Phil's assistant.";

function request(lastUserText: string, overrides: Partial<SeenRequest> = {}): SeenRequest {
  return { path: "/v1/messages", streamed: true, model: "claude-haiku-5-5", system, tools: ["Read", "DeferredToolPlaceholder"], lastUserText, body: JSON.stringify({ system, last: lastUserText }), ...overrides };
}

function goodRequests(): SeenRequest[] {
  return [
    request("Hello"),
    request(`Please ${readInsideWord}`),
    request(`[tool result] 1 # Index ${insideMarker}`),
    request(`Please ${readOutsideWord}`),
    request("[tool result] Permission to use Read has been denied."),
  ];
}

type Behaviour = {
  plain?: () => Promise<Answer>;
  inside?: (listener: AnswerListener) => Promise<Answer>;
  outside?: () => Promise<Answer>;
};

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

const inOrder = "only Jarvis's own five requests, in order (no title or other extra requests)";

test("an engine that behaves passes all ten checks", async () => {
  const results = await runEngineCheck(deps());
  assert.equal(results.length, 10);
  assert.deepEqual(failed(results), []);
});

test("Jarvis's five requests are the question, the brain read and its result, the outside read and its result", () => {
  assert.equal(expectedRequests.length, 5);
  assert.deepEqual(
    goodRequests().map((seen, index) => expectedRequests[index].test(seen.lastUserText)),
    [true, true, true, true, true],
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
  assert.equal(notRefused[2].detail, "not refused: Here it is");
  assert.deepEqual(failed(await runEngineCheck(deps({ session: fakeSession({ outside: () => Promise.reject(new Error("Overloaded")) }).session }))), ["a file outside the brain is refused"]);
});

test("the outside file's words anywhere in any request fail, even if the read was refused", async () => {
  const requests = goodRequests();
  requests[1] = { ...requests[1], body: `{"messages":[{"content":"${outsideMarker}"},{"content":"Please ${readInsideWord}"}]}` };
  assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), ["nothing from outside the brain reached the API"]);
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
  assert.match(results[5].detail, /^6 requests: "Hello", /);
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: [...goodRequests(), request("Hello")] }))), [inOrder]);
});

test("a request without Jarvis's system prompt, like a title request, fails the order check", async () => {
  const requests = goodRequests();
  requests[2] = { ...requests[2], system: "Generate a short title" };
  assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), [inOrder]);
});

test("a missing request, or the right requests in the wrong order, fail the order check", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: goodRequests().slice(0, 4) }))), [inOrder]);
  const swapped = goodRequests();
  [swapped[1], swapped[3]] = [swapped[3], swapped[1]];
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

test("any tool beyond Read and the SDK's placeholder fails, and so does a request without Read", async () => {
  assert.deepEqual(allowedTools, ["Read", "DeferredToolPlaceholder"]);
  for (const tool of ["Bash", "Grep", "Glob", "Skill", "ToolSearch", "mcp__hub__get_status"]) {
    const requests = goodRequests();
    requests[3] = { ...requests[3], tools: ["Read", tool] };
    assert.deepEqual(failed(await runEngineCheck(deps({ requests }))), ["only Read is offered"], tool);
  }
  const requests = goodRequests();
  requests[0] = { ...requests[0], tools: [] };
  const results = await runEngineCheck(deps({ requests }));
  assert.deepEqual(failed(results), ["only Read is offered"]);
  assert.match(results[7].detail, /1 requests without Read$/);
});

test("a saved transcript fails, and so does not being able to look", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ countTranscripts: async () => 1 }))), ["no chat transcript is saved"]);
  const unreadable = await runEngineCheck(deps({ countTranscripts: () => Promise.reject(new Error("EACCES")) }));
  assert.deepEqual(failed(unreadable), ["no chat transcript is saved"]);
  assert.equal(unreadable[8].detail, "EACCES");
});

test("with no requests seen at all, the request checks fail rather than pass by default", async () => {
  assert.deepEqual(failed(await runEngineCheck(deps({ requests: [] }))), [inOrder, "every request uses claude-haiku-5-5", "only Read is offered"]);
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
  assert.equal(none[9].detail, "no environment was given to the engine");
  assert.deepEqual(failed(await runEngineCheck(deps({ engineEnv: () => ({ DISABLE_TELEMETRY: "0", DISABLE_ERROR_REPORTING: "true" }) }))), []);
});
