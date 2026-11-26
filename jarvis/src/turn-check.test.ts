import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { messagesUrl } from "./direct.js";
import { readTurnVerdict, turnCheck, turnCheckMost, turnCheckMs, turnCheckSystem } from "./turn-check.js";

type Seen = { method: string | undefined; url: string | undefined; headers: IncomingMessage["headers"]; body: string };

async function standIn(reply: (response: ServerResponse, seen: Seen) => void): Promise<{ url: string; seen: Seen[]; server: Server }> {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const one = { method: request.method, url: request.url, headers: request.headers, body };
      seen.push(one);
      reply(response, one);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/messages`, seen, server };
}

const closed = (server: Server) => new Promise((resolve) => (server.closeAllConnections(), server.close(resolve)));
const says = (text: string) => (response: ServerResponse) => response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", content: [{ type: "text", text }], stop_reason: "end_turn" }));

test("the quick check waits 1.2 seconds at most, sends 500 characters at most, and its instructions have no double quotes", () => {
  assert.deepEqual([turnCheckMs, turnCheckMost], [1_200, 500]);
  assert.equal(turnCheckSystem.includes('"'), false);
  assert.match(turnCheckSystem, /exactly one word: done .* or more /);
});

test("the answer counts only when its first part is the one word done or more, whatever its case or full stop", () => {
  const body = (text: unknown, type: unknown = "text") => ({ content: [{ type, text }] });
  assert.deepEqual([readTurnVerdict(body("done")), readTurnVerdict(body("more")), readTurnVerdict(body(" Done.\n")), readTurnVerdict(body("MORE!"))], ["done", "more", "done", "more"]);
  for (const bad of [body("done more"), body("yes"), body(""), body("not done"), body("done", "thinking"), body(4), { content: [] }, { content: "done" }, {}, null, "done", 7]) assert.equal(readTurnVerdict(bad), null, JSON.stringify(bad));
  assert.equal(readTurnVerdict({ content: [{ type: "text", text: "more" }, { type: "text", text: "done" }] }), "more");
});

test("the quick check is one small request to the Messages API with the key, the model and what was said, and gives back done or more", async () => {
  const api = await standIn(says("more"));
  const check = turnCheck({ apiKey: "key-for-tests", model: "a-model", url: api.url });
  assert.equal(await check("turn the lights off and", new AbortController().signal), "more");
  assert.equal(api.seen.length, 1);
  const seen = api.seen[0];
  assert.deepEqual([seen.method, seen.url, seen.headers["x-api-key"], seen.headers["anthropic-version"], seen.headers["content-type"]], ["POST", "/v1/messages", "key-for-tests", "2023-06-01", "application/json"]);
  assert.deepEqual(JSON.parse(seen.body), { model: "a-model", max_tokens: 4, system: turnCheckSystem, messages: [{ role: "user", content: "turn the lights off and" }] });
  await check("x".repeat(turnCheckMost + 40), new AbortController().signal);
  assert.equal(JSON.parse(api.seen[1].body).messages[0].content, "x".repeat(turnCheckMost));
  await closed(api.server);
  assert.equal(messagesUrl, "https://api.anthropic.com/v1/messages");
});

test("an answer that isn't done or more, a refusal from the API, an answer that isn't JSON, or a redirect gives nothing, and never throws", async () => {
  for (const reply of [says("I think they have finished"), (response: ServerResponse) => response.writeHead(529, { "content-type": "application/json" }).end('{"type":"error"}'), (response: ServerResponse) => response.writeHead(200).end("<html>")]) {
    const api = await standIn(reply);
    assert.equal(await turnCheck({ apiKey: "k", model: "m", url: api.url })("what's the time", new AbortController().signal), null);
    await closed(api.server);
  }
  assert.equal(await turnCheck({ apiKey: "k", model: "m", url: "http://127.0.0.1:1/v1/messages" })("what's the time", new AbortController().signal), null, "nothing is listening there");
  const refused = await standIn((response) => response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ content: [{ type: "text", text: "done" }] })));
  assert.equal(await turnCheck({ apiKey: "k", model: "m", url: refused.url })("what's the time", new AbortController().signal), null, "an error isn't read for an answer, whatever its body says");
  await closed(refused.server);
  const elsewhere = await standIn(says("done"));
  const moved = await standIn((response) => response.writeHead(307, { location: elsewhere.url }).end());
  assert.equal(await turnCheck({ apiKey: "k", model: "m", url: moved.url })("what's the time", new AbortController().signal), null, "a redirect isn't followed");
  assert.equal(elsewhere.seen.length, 0, "so the key never goes anywhere but the address it was given");
  await closed(moved.server);
  await closed(elsewhere.server);
});

test("an answer that takes too long, or a check called off, gives nothing", { timeout: 5_000 }, async () => {
  const api = await standIn(() => {});
  const began = performance.now();
  assert.equal(await turnCheck({ apiKey: "k", model: "m", url: api.url, ms: 60 })("what's the time", new AbortController().signal), null);
  assert.ok(performance.now() - began < 1_000);
  const off = new AbortController();
  const waiting = turnCheck({ apiKey: "k", model: "m", url: api.url })("what's the time", off.signal);
  setTimeout(() => off.abort(), 20);
  assert.equal(await waiting, null);
  assert.ok(performance.now() - began < 1_100);
  await closed(api.server);
});
