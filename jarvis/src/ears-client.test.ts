import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { earsCaller, earsQuickMs, earsStopMs, earsUrl, readEarsAnswer } from "./ears-client.js";

type Seen = { method: string; path: string; authorization: string | undefined };

async function standIn(answer: (request: IncomingMessage, response: ServerResponse) => void) {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    seen.push({ method: request.method ?? "", path: request.url ?? "", authorization: request.headers.authorization });
    answer(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function closed(server: Server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

const json = (status: number, body: unknown) => (_request: IncomingMessage, response: ServerResponse) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

test("ears is reached at its service's name on its own port, with 4 seconds for a quick answer and 70 for a stop, which waits for the text", () => {
  assert.equal(earsUrl, "http://ears:8090");
  assert.equal(earsQuickMs, 4_000);
  assert.equal(earsStopMs, 70_000);
});

test("a call sends the method, the path and the token, and reads ears's answer", async () => {
  const { server, seen, url } = await standIn(json(200, { seconds: 2.5, state: "idle", reason: null, microphone: "card", last: { seconds: 2.5, reason: "asked to stop", text: "Lights on.", textProblem: null } }));
  const answer = await earsCaller("ears-token", url)("POST", "/recording/stop", 1000);
  assert.deepEqual(seen, [{ method: "POST", path: "/recording/stop", authorization: "Bearer ears-token" }]);
  assert.deepEqual(answer, { status: 200, state: "idle", reason: null, error: null, seconds: 2.5, last: { seconds: 2.5, reason: "asked to stop", text: "Lights on.", textProblem: null } });
  await closed(server);
});

test("a refusal comes back as an answer with its status and error, not as a failure", async () => {
  const { server, url } = await standIn(json(409, { error: "ears is muted", state: "muted", reason: "ears starts muted", microphone: "card", last: null }));
  assert.deepEqual(await earsCaller("ears-token", url)("POST", "/recording/start", 1000), { status: 409, state: "muted", reason: "ears starts muted", error: "ears is muted", seconds: null, last: null });
  await closed(server);
});

test("answers that aren't the shape ears sends are read as nothing, rather than trusted", () => {
  assert.deepEqual(readEarsAnswer(200, null), { status: 200, state: null, reason: null, error: null, seconds: null, last: null });
  assert.deepEqual(readEarsAnswer(200, [1, 2]), { status: 200, state: null, reason: null, error: null, seconds: null, last: null });
  assert.deepEqual(readEarsAnswer(200, { state: 3, seconds: "2", last: { seconds: -1, reason: "x", text: null, textProblem: null } }).last, null);
  assert.equal(readEarsAnswer(200, { last: { seconds: 1, reason: "x", text: 5, textProblem: null } }).last, null);
  assert.equal(readEarsAnswer(200, { last: { seconds: 1, reason: "x", text: null, textProblem: 5 } }).last, null);
  assert.equal(readEarsAnswer(200, { last: { seconds: 1, text: null, textProblem: null } }).last, null);
  assert.equal(readEarsAnswer(200, { seconds: Number.NaN }).seconds, null);
});

test("ears's own words are tidied before they're shown, but the text is kept exactly as Whisper wrote it", () => {
  const answer = readEarsAnswer(409, { error: "ears\u001b[31m is\n\nmuted", reason: "a".repeat(300), state: "muted", last: { seconds: 1, reason: "asked\tto stop", text: "Lights\u0007 on.", textProblem: "it\u0000 was muted" } });
  assert.equal(answer.error, "ears [31m is muted");
  assert.equal(answer.reason, `${"a".repeat(199)}…`);
  assert.deepEqual(answer.last, { seconds: 1, reason: "asked to stop", text: "Lights\u0007 on.", textProblem: "it was muted" });
});

test("a wrong token says how Jarvis gets the right one, without the token", async () => {
  const { server, url } = await standIn(json(401, { error: "A valid token is needed" }));
  await assert.rejects(earsCaller("secret-ears-token", url)("GET", "/state", 1000), (error: Error) => error.message === "Ears turned down Jarvis's token. Start Jarvis with bash host/jarvis.sh, which passes in EARS_TOKEN from ears/.env" && !error.message.includes("secret"));
  await closed(server);
});

test("nothing listening says where ears was looked for, why, and how to start it", async () => {
  const { server, url } = await standIn(json(200, {}));
  await closed(server);
  await assert.rejects(earsCaller("t", url)("GET", "/state", 1000), { message: `Couldn't reach ears at ${url} (ECONNREFUSED). Start it on the server with bash host/ears.sh start` });
});

test("an ears that doesn't answer in time is given up on, saying how long it had", async () => {
  const { server, url } = await standIn(() => {});
  const began = performance.now();
  await assert.rejects(earsCaller("t", url)("POST", "/recording/stop", 200), { message: "Ears didn't answer within 0.2 seconds" });
  assert.ok(performance.now() - began < 1500);
  await closed(server);
});

test("an answer whose body stops arriving is given up on too", async () => {
  const { server, url } = await standIn((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"state":');
  });
  await assert.rejects(earsCaller("t", url)("GET", "/state", 200), { message: "Ears didn't answer within 0.2 seconds" });
  await closed(server);
});

test("a call called off comes back with the caller's reason at once", async () => {
  const { server, url } = await standIn(() => {});
  const control = new AbortController();
  const calling = earsCaller("t", url)("POST", "/recording/stop", 10_000, control.signal);
  setTimeout(() => control.abort(new Error("Chat closed")), 50);
  await assert.rejects(calling, { message: "Chat closed" });
  await closed(server);
});

test("an answer that isn't JSON says so, with its status", async () => {
  const { server, url } = await standIn((_request, response) => {
    response.writeHead(502);
    response.end("Bad gateway");
  });
  await assert.rejects(earsCaller("t", url)("GET", "/state", 1000), { message: "Ears answered 502 without its usual JSON" });
  await closed(server);
});

test("a redirect is refused, not followed", async () => {
  const target = await standIn(json(200, { state: "idle", last: null }));
  const { server, url } = await standIn((_request, response) => {
    response.writeHead(302, { location: `${target.url}/state` });
    response.end();
  });
  await assert.rejects(earsCaller("t", url)("GET", "/state", 1000), /^Error: Couldn't reach ears/);
  assert.equal(target.seen.length, 0);
  await closed(server);
  await closed(target.server);
});

test("a wait's answer brings the version, which run of ears it was, the last recording's number, the one under way and the wake word's state", () => {
  const read = readEarsAnswer(200, { state: "recording", reason: null, microphone: "card", last: null, version: 12, run: "0123456789abcdef", lastId: 3, current: { id: 4, by: "wake", claimed: false }, wake: { on: true, listening: false, held: true, problem: null } });
  assert.deepEqual([read.version, read.run, read.lastId, read.current, read.wake], [12, "0123456789abcdef", 3, { id: 4, by: "wake", claimed: false }, { on: true, listening: false, held: true, problem: null }]);
  const zero = readEarsAnswer(200, { version: 0, run: "a", lastId: null, current: null, wake: null });
  assert.deepEqual([zero.version, zero.run, zero.lastId, zero.current, zero.wake], [0, "a", null, null, null]);
  assert.equal("version" in readEarsAnswer(200, { state: "idle" }), false, "a plain state answer has none of them");
});

test("wake fields that aren't the shape ears sends are read as nothing, and a problem is tidied", () => {
  const bad = readEarsAnswer(200, { version: -1, run: "Not-Hex!", lastId: 0, current: { id: 1, by: "voice", claimed: false }, wake: { on: "yes", listening: false, held: false, problem: null } });
  assert.deepEqual([bad.version, bad.run, bad.lastId, bad.current, bad.wake], [null, null, null, null, null]);
  for (const current of [null, 5, { id: 0, by: "wake", claimed: false }, { id: 1.5, by: "wake", claimed: false }, { id: 1, by: "push", claimed: "no" }, { by: "wake", claimed: true }]) assert.equal(readEarsAnswer(200, { version: 1, current }).current, null, JSON.stringify(current));
  for (const wake of [{ on: true, listening: 1, held: false, problem: null }, { on: true, listening: false, held: false, problem: 7 }, { on: true, listening: false, problem: null }]) assert.equal(readEarsAnswer(200, { version: 1, wake }).wake, null, JSON.stringify(wake));
  for (const version of [1.5, "3", Number.MAX_SAFE_INTEGER + 2]) assert.equal(readEarsAnswer(200, { version }).version, null, String(version));
  assert.equal(readEarsAnswer(200, { version: 1, run: "a".repeat(33) }).run, null);
  const tidy = readEarsAnswer(200, { version: 1, wake: { on: true, listening: false, held: false, problem: "the wake-word server\u001b[31m can't\n be reached" } });
  assert.equal(tidy.wake?.problem, "the wake-word server [31m can't be reached");
});

test("an answer outside the wake word's wait keeps the recording's number and the last one's number when ears sends them", () => {
  assert.deepEqual(readEarsAnswer(200, { state: "recording", reason: null, last: null, id: 4, lastId: 3 }), { status: 200, state: "recording", reason: null, error: null, seconds: null, last: null, lastId: 3, id: 4 });
  assert.deepEqual(readEarsAnswer(200, { state: "idle", reason: null, last: null, lastId: null }), { status: 200, state: "idle", reason: null, error: null, seconds: null, last: null, lastId: null });
  assert.deepEqual(readEarsAnswer(200, { state: "idle", reason: null, last: null, id: 0, lastId: "2" }), { status: 200, state: "idle", reason: null, error: null, seconds: null, last: null, lastId: null, id: null });
  assert.deepEqual(readEarsAnswer(200, { state: "idle", reason: null, last: null }), { status: 200, state: "idle", reason: null, error: null, seconds: null, last: null });
  assert.deepEqual(readEarsAnswer(200, { state: "recording", reason: null, last: null, id: 1_795_000_000_124, lastId: 1_795_000_000_123 }), { status: 200, state: "recording", reason: null, error: null, seconds: null, last: null, lastId: 1_795_000_000_123, id: 1_795_000_000_124 });
});
