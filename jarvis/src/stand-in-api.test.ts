import assert from "node:assert/strict";
import { test } from "node:test";
import { plainAnswer, readInsideWord, readOutsideWord, standInReply, startStandInApi } from "./stand-in-api.js";

const script = { insidePath: "/brain/index.md", outsidePath: "/elsewhere/secret.md" };

function events(stream: string): { type: string; [field: string]: unknown }[] {
  return stream
    .split("\n\n")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => JSON.parse(chunk.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "{}"));
}

test("a plain question gets the plain answer, ending the turn", () => {
  const sent = events(standInReply(script, 1, "Hello"));
  assert.deepEqual(
    sent.map((event) => event.type),
    ["message_start", "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop"],
  );
  assert.deepEqual(sent[2].delta, { type: "text_delta", text: plainAnswer });
  assert.equal((sent[4].delta as { stop_reason: string }).stop_reason, "end_turn");
});

test("the read words ask for a file inside or outside the brain, and stop to use the tool", () => {
  for (const [word, path] of [
    [readInsideWord, script.insidePath],
    [readOutsideWord, script.outsidePath],
  ]) {
    const sent = events(standInReply(script, 2, `Please ${word}`));
    const toolStart = sent.find((event) => event.type === "content_block_start" && (event.content_block as { type: string }).type === "tool_use");
    assert.equal((toolStart?.content_block as { name: string }).name, "Read");
    const json = sent.find((event) => (event.delta as { type?: string } | undefined)?.type === "input_json_delta");
    assert.deepEqual(JSON.parse((json?.delta as { partial_json: string }).partial_json), { file_path: path });
    assert.equal((sent.find((event) => event.type === "message_delta")?.delta as { stop_reason: string }).stop_reason, "tool_use");
  }
});

test("after a tool result, the answer repeats what the tool gave back", () => {
  const sent = events(standInReply(script, 3, `[tool result] 1  # Index\n2  the marker`));
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
      { path: "/v1/messages", streamed: true, model: "claude-haiku-5-5", system: '[{"type":"text","text":"You are Jarvis."}]', tools: ["Read"], lastUserText: "[tool result] file text", body: api.requests[0].body },
      { path: "/v1/messages", streamed: false, model: "m", system: "S", tools: [], lastUserText: "Hi", body: '{"model":"m","system":"S","messages":[{"role":"user","content":"Hi"}]}' },
      { path: "/api/hello", streamed: false, model: null, system: '""', tools: [], lastUserText: "", body: "" },
    ]);
    assert.match(api.requests[0].body, /"Earlier"/);
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
  } finally {
    await api.close();
  }
});

test("the question recorded is the latest user message, even if an assistant turn comes after it", async () => {
  const api = await startStandInApi(script);
  try {
    await fetch(`${api.url}/v1/messages`, { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "The question" }, { role: "assistant", content: "Started answer" }] }) });
    assert.equal(api.requests[0].lastUserText, "The question");
  } finally {
    await api.close();
  }
});
