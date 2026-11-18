import assert from "node:assert/strict";
import { test } from "node:test";
import {
  caseText,
  echoFor,
  findIgnoredWord,
  findInsideWord,
  findOutsideWord,
  hiddenText,
  ignoredText,
  longText,
  outsideText,
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
  standInReply,
  startStandInApi,
  toolCallFor,
} from "./stand-in-api.js";

const script = { insidePath: "/brain/index.md", outsidePath: "/elsewhere/secret.md", gitPath: "/brain/.git/config", linkedPath: "/brain/linked/secret.md" };

function events(stream: string): { type: string; [field: string]: unknown }[] {
  return stream
    .split("\n\n")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => JSON.parse(chunk.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "{}"));
}

function toolAskedFor(stream: string): { name: string; input: unknown; stop: string } {
  const sent = events(stream);
  const toolStart = sent.find((event) => event.type === "content_block_start" && (event.content_block as { type: string }).type === "tool_use");
  const json = sent.find((event) => (event.delta as { type?: string } | undefined)?.type === "input_json_delta");
  return {
    name: (toolStart?.content_block as { name: string }).name,
    input: JSON.parse((json?.delta as { partial_json: string }).partial_json),
    stop: (sent.find((event) => event.type === "message_delta")?.delta as { stop_reason: string }).stop_reason,
  };
}

test("a plain question gets the plain answer, ending the turn, for either engine", () => {
  for (const engine of ["sdk", "api"] as const) {
    const sent = events(standInReply(script, engine, 1, "Hello"));
    assert.deepEqual(
      sent.map((event) => event.type),
      ["message_start", "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"],
    );
    assert.deepEqual(sent[2].delta, { type: "text_delta", text: plainAnswer });
    assert.equal((sent[4].delta as { stop_reason: string }).stop_reason, "end_turn");
  }
});

test("each word asks the Agent SDK for its own tool, inside or outside the brain", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    [readInsideWord, "Read", { file_path: "/brain/index.md" }],
    [readOutsideWord, "Read", { file_path: "/elsewhere/secret.md" }],
    [readGitWord, "Read", { file_path: "/brain/.git/config" }],
    [readLinkedWord, "Read", { file_path: "/brain/linked/secret.md" }],
    [searchInsideWord, "Grep", { pattern: "brain", path: "/brain", output_mode: "content" }],
    [searchOutsideWord, "Grep", { pattern: outsideText, path: "/elsewhere", output_mode: "files_with_matches" }],
    [findInsideWord, "Glob", { pattern: "**/*", path: "/brain" }],
    [findOutsideWord, "Glob", { pattern: "**/*", path: "/elsewhere" }],
    [searchHiddenWord, "Grep", { pattern: hiddenText, path: "/brain", output_mode: "content" }],
    [searchIgnoredWord, "Grep", { pattern: ignoredText, path: "/brain", output_mode: "content" }],
    [findIgnoredWord, "Glob", { pattern: "**/*ignored*", path: "/brain" }],
    [searchCaseWord, "Grep", { pattern: caseText.toUpperCase(), path: "/brain", output_mode: "content" }],
    [searchLongWord, "Grep", { pattern: longText, path: "/brain", output_mode: "content" }],
  ];
  for (const [word, name, input] of cases) {
    assert.deepEqual(toolAskedFor(standInReply(script, "sdk", 4, `Please ${word}`)), { name, input, stop: "tool_use" }, word);
  }
});

test("each word asks the plain API call for the matching brain tool, with paths from the brain's top folder as its tools expect", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    [readInsideWord, "read_file", { path: "index.md" }],
    [readOutsideWord, "read_file", { path: "../elsewhere/secret.md" }],
    [readGitWord, "read_file", { path: ".git/config" }],
    [readLinkedWord, "read_file", { path: "linked/secret.md" }],
    [searchInsideWord, "search_files", { text: "brain", path: "." }],
    [searchOutsideWord, "search_files", { text: outsideText, path: "../elsewhere" }],
    [findInsideWord, "find_files", { name: ".", path: "." }],
    [findOutsideWord, "find_files", { name: ".", path: "../elsewhere" }],
    [searchHiddenWord, "search_files", { text: hiddenText, path: "." }],
    [searchIgnoredWord, "search_files", { text: ignoredText, path: "." }],
    [findIgnoredWord, "find_files", { name: "ignored", path: "." }],
    [searchCaseWord, "search_files", { text: caseText.toUpperCase(), path: "." }],
    [searchLongWord, "search_files", { text: longText, path: "." }],
  ];
  for (const [word, name, input] of cases) {
    assert.deepEqual(toolAskedFor(standInReply(script, "api", 4, `Please ${word}`)), { name, input, stop: "tool_use" }, word);
  }
});

test("a question without a word asks for no tool", () => {
  assert.equal(toolCallFor(script, "sdk", "Hello"), null);
  assert.equal(toolCallFor(script, "api", "What's in my brain?"), null);
});

test("after a tool result, the answer repeats what the tool gave back", () => {
  const sent = events(standInReply(script, "api", 3, `[tool result] 1  # Index\n2  the marker`));
  const text = sent.find((event) => (event.delta as { type?: string } | undefined)?.type === "text_delta");
  assert.match((text?.delta as { text: string }).text, /^I read it\. \[tool result\] 1 # Index 2 the marker$/);
});

test("the stand-in streams answers, answers plain requests, refuses other paths, and records them all", async () => {
  const api = await startStandInApi(script);
  try {
    const streamed = await fetch(`${api.url}/v1/messages?beta=true`, {
      method: "POST",
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        stream: true,
        system: [{ type: "text", text: "You are Jarvis." }],
        tools: [{ name: "Read" }],
        messages: [
          { role: "user", content: "Earlier" },
          { role: "assistant", content: "Reply" },
          { role: "user", content: [{ type: "tool_result", content: [{ type: "text", text: "file text" }] }] },
        ],
      }),
    });
    assert.equal(streamed.headers.get("content-type"), "text/event-stream");
    assert.equal(events(await streamed.text()).at(-1)?.type, "message_stop");
    const plain = await fetch(`${api.url}/v1/messages`, { method: "POST", body: JSON.stringify({ model: "m", system: "S", messages: [{ role: "user", content: "Hi" }] }) });
    assert.equal((await plain.json()).content[0].text, plainAnswer);
    const other = await fetch(`${api.url}/api/hello`);
    assert.equal(other.status, 404);
    assert.deepEqual(api.requests, [
      { path: "/v1/messages", streamed: true, model: "claude-haiku-5-5", system: '[{"type":"text","text":"You are Jarvis."}]', systemText: "You are Jarvis.", tools: ["Read"], lastUserText: "[tool result] file text", toolResults: [{ text: "file text", isError: false }], asked: null, body: api.requests[0].body },
      { path: "/v1/messages", streamed: false, model: "m", system: "S", systemText: "S", tools: [], lastUserText: "Hi", toolResults: [], asked: null, body: '{"model":"m","system":"S","messages":[{"role":"user","content":"Hi"}]}' },
      { path: "/api/hello", streamed: false, model: null, system: '""', systemText: "", tools: [], lastUserText: "", toolResults: [], asked: null, body: "" },
    ]);
    assert.match(api.requests[0].body, /"Earlier"/);
  } finally {
    await api.close();
  }
});

test("the answer repeats at most 200 characters of the result, never cutting an emoji in half", () => {
  const echo = echoFor(`[tool result] ${"🙂".repeat(300)}`);
  assert.equal(echo, `I read it. ${Array.from(`[tool result] ${"🙂".repeat(300)}`).slice(0, 200).join("")}`);
  assert.doesNotMatch(echo, /[\ud800-\udbff](?![\udc00-\udfff])/);
  assert.equal(echoFor("[tool result] a\n\n b"), "I read it. [tool result] a b");
});

test("a stand-in for the plain API call asks for its tools, and records which tool it asked for, but only when it streams", async () => {
  const api = await startStandInApi(script, "api");
  try {
    const response = await fetch(`${api.url}/v1/messages`, { method: "POST", body: JSON.stringify({ stream: true, messages: [{ role: "user", content: `Please ${searchInsideWord}` }] }) });
    assert.deepEqual(toolAskedFor(await response.text()), { name: "search_files", input: { text: "brain", path: "." }, stop: "tool_use" });
    assert.equal(api.requests[0].asked, "search_files");
    await fetch(`${api.url}/v1/messages`, { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: `Please ${searchInsideWord}` }] }) });
    assert.equal(api.requests[1].asked, null);
  } finally {
    await api.close();
  }
});

test("tool results are recorded with their words and whether they were errors, in plain text or blocks", async () => {
  const api = await startStandInApi(script, "api");
  try {
    await fetch(`${api.url}/v1/messages`, {
      method: "POST",
      body: JSON.stringify({
        stream: true,
        messages: [
          { role: "user", content: `Please ${readOutsideWord}` },
          { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "read_file", input: {} }] },
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "That's outside the brain, so it can't be read.", is_error: true },
              { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "one" }, { type: "image" }, { type: "text", text: "two" }] },
            ],
          },
        ],
      }),
    });
    assert.deepEqual(api.requests[0].toolResults, [
      { text: "That's outside the brain, so it can't be read.", isError: true },
      { text: "one\ntwo", isError: false },
    ]);
    assert.equal(api.requests[0].asked, null);
  } finally {
    await api.close();
  }
});

test("a body that isn't JSON is still recorded and answered", async () => {
  const api = await startStandInApi(script);
  try {
    const response = await fetch(`${api.url}/v1/messages`, { method: "POST", body: "not json" });
    assert.equal(response.status, 200);
    assert.equal(api.requests[0].model, null);
    assert.deepEqual(api.requests[0].toolResults, []);
  } finally {
    await api.close();
  }
});

test("the question recorded is the latest user message, even if an assistant or system message comes after it", async () => {
  const api = await startStandInApi(script);
  try {
    await fetch(`${api.url}/v1/messages`, {
      method: "POST",
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: `Please ${readInsideWord}` }, { role: "assistant", content: "Started answer" }, { role: "system", content: "A reminder" }] }),
    });
    assert.equal(api.requests[0].lastUserText, `Please ${readInsideWord}`);
    assert.equal(api.requests[0].asked, "Read");
  } finally {
    await api.close();
  }
});
