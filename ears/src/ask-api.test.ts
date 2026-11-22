import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { alreadyLine, ask, askCommand, askUsage, listeningLine, questions } from "./ask-api.js";
import { createEars } from "./ears.js";
import { startEarsServer } from "./server.js";
import { textLimitMs } from "./whisper.js";

const token = "t".repeat(64);

const stillOpen = new Set<() => unknown>();

afterEach(async () => {
  const closing = [...stillOpen];
  stillOpen.clear();
  for (const close of closing) await Promise.resolve().then(close).catch(() => {});
});

async function closed(server: Server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

test("ask knows five questions: the state, start, stop, health and talk, and waits 4 seconds for an answer, or 70 for a stop or a talk, which can wait for the text", () => {
  assert.deepEqual(Object.keys(questions), ["state", "start", "stop", "health", "talk"]);
  assert.deepEqual(Object.values(questions).map((question) => question.waitMs), [4_000, 4_000, 70_000, 4_000, 70_000]);
  assert.ok(questions.stop.waitMs > textLimitMs + 5_000);
  assert.deepEqual(questions.health, { method: "GET", path: "/state", waitMs: 4_000 });
  assert.deepEqual(questions.talk, { method: "POST", path: "/wake/talk", waitMs: 70_000 });
  assert.equal(askUsage, "Usage: node dist/ask.js state|start|stop|health|talk");
});

test("health prints only the status and the state's one word, never the last recording's text, since Docker keeps what a health check prints", async () => {
  const ears = createEars({ microphone: "pretend", record: () => ({ pid: 1, ended: Promise.resolve({ reason: "x", failed: false, bytes: 2, ms: 1000, sound: Uint8Array.of(1, 2) }), stop: () => new Promise(() => {}) }), log: () => {}, toText: async () => "Turn the lights on." });
  const server = await startEarsServer(ears, token, 0, "127.0.0.1");
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await ears.unmute();
  ears.start();
  for (let wait = 0; ears.view().last?.text !== "Turn the lights on." && wait < 100; wait++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ears.view().last?.text, "Turn the lights on.");
  const said: string[] = [];
  const out = (line: string) => said.push(line);
  assert.equal(await askCommand("health", token, out, base), 0);
  assert.equal(await askCommand("health", "wrong", out, base), 1);
  assert.equal(await askCommand("state", token, out, base), 0);
  assert.deepEqual(said.slice(0, 2), ["200 idle", "401 (no state)"]);
  assert.match(said[2], /Turn the lights on/);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const odd = createServer((_request, response) => response.end(JSON.stringify({ state: "Turn the lights on." })));
  await new Promise<void>((resolve) => odd.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => closed(odd));
  said.length = 0;
  assert.equal(await askCommand("health", token, out, `http://127.0.0.1:${(odd.address() as AddressInfo).port}`), 0);
  assert.deepEqual(said, ["200 (no state)"], "a state that isn't one plain word isn't printed either");
  odd.closeAllConnections();
  await new Promise((resolve) => odd.close(resolve));
});

test("ask sends the token and prints the status and the answer, refusals included", async () => {
  const ears = createEars({ microphone: null, record: () => assert.fail("nothing should record"), log: () => {} });
  const server = await startEarsServer(ears, token, 0, "127.0.0.1");
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.deepEqual(await ask("state", token, base), { status: 200, body: '{"state":"muted","reason":"ears starts muted after every start, and waits to be unmuted","microphone":null,"last":null,"lastId":null}' });
  assert.deepEqual(await ask("start", token, base), { status: 409, body: '{"error":"ears is muted","state":"muted","reason":"ears starts muted after every start, and waits to be unmuted","microphone":null,"last":null,"lastId":null}' });
  ears.unmute();
  assert.deepEqual(await ask("start", token, base), { status: 409, body: '{"error":"no microphone is set, so there\'s nothing to record from","state":"idle","reason":null,"microphone":null,"last":null,"lastId":null}' });
  assert.deepEqual(await ask("stop", token, base), { status: 409, body: '{"error":"ears isn\'t recording","state":"idle","reason":null,"microphone":null,"last":null,"lastId":null}' });
  assert.deepEqual(await ask("state", "wrong", base), { status: 401, body: '{"error":"A valid token is needed"}' });
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("anything else is refused with the usage, before anything is sent", async () => {
  for (const what of [undefined, "", "State", "mute", "unmute", "toString", "__proto__", "constructor"]) {
    await assert.rejects(ask(what, token, "http://127.0.0.1:1"), { message: askUsage }, String(what));
  }
});

test("as a command, it prints the answer and exits 0 for a yes and 1 for a refusal, a wrong token or no answer at all", async () => {
  const ears = createEars({ microphone: null, record: () => assert.fail("nothing should record"), log: () => {} });
  const server = await startEarsServer(ears, token, 0, "127.0.0.1");
  stillOpen.add(() => closed(server));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const said: string[] = [];
  const out = (line: string) => said.push(line);
  assert.equal(await askCommand("state", token, out, base), 0);
  assert.equal(await askCommand("start", token, out, base), 1);
  assert.equal(await askCommand("state", "wrong", out, base), 1);
  assert.equal(await askCommand("mute", token, out, base), 1);
  assert.deepEqual(said.map((line) => line.slice(0, 25)), ['200 {"state":"muted","rea', '409 {"error":"ears is mut', '401 {"error":"A valid tok', askUsage.slice(0, 25)]);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  said.length = 0;
  assert.equal(await askCommand("state", token, out, base), 1);
  assert.match(said[0], /fetch failed/);
});

test("talk prints one plain line for each answer, never the recording's text, and exits 1 unless ears is listening or sent it", async () => {
  const answers: { status: number; body: unknown }[] = [];
  const fake = createServer((request, response) => {
    const next = answers.shift() ?? { status: 500, body: {} };
    response.writeHead(next.status, { "content-type": "application/json" });
    response.end(JSON.stringify({ ...((next.body as object) ?? {}), asked: `${request.method} ${request.url}` }));
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => closed(fake));
  const base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  const said: string[] = [];
  const out = (line: string) => said.push(line);
  answers.push({ status: 200, body: { sent: false, id: 3, last: { text: "Turn the lights on." } } });
  answers.push({ status: 200, body: { sent: true, seconds: 3.4, last: { text: "Turn the lights on.", textProblem: null } } });
  answers.push({ status: 409, body: { error: "Jarvis is still speaking, so ears can't listen yet. Press again when he's finished" } });
  answers.push({ status: 409, body: { error: "a\nb\u0007c" } });
  answers.push({ status: 409, body: {} });
  answers.push({ status: 404, body: { error: "No such route" } });
  answers.push({ status: 401, body: { error: "A valid token is needed" } });
  answers.push({ status: 200, body: { id: 4 } });
  answers.push({ status: 200, body: { sent: true, seconds: 0.6, last: { text: null, textProblem: "Whisper heard no\nwords" } } });
  answers.push({ status: 200, body: { sent: true, seconds: 0.6, last: { text: "  ", textProblem: null } } });
  answers.push({ status: 409, body: { error: "ears is muted" } });
  answers.push({ status: 409, body: { error: "ears is already listening, so just speak: it sends what you say when you stop talking" } });
  answers.push({ status: 409, body: { error: "no Jarvis chat has taken the recording yet, so there's nothing to send it to. Press again in a moment" } });
  const codes = [];
  for (let asked = 0; asked < 13; asked++) codes.push(await askCommand("talk", token, out, base));
  assert.deepEqual(codes, [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1]);
  assert.deepEqual(said, [
    listeningLine,
    "Sent after 3.4 seconds of recording, to the Jarvis chat that took it.",
    "Not listening: Jarvis is still speaking, so ears can't listen yet. Press again when he's finished.",
    "Not listening: a b c.",
    "Not listening: ears answered 409.",
    "This ears doesn't know the talk button yet, so start it again with bash host/ears.sh start, which rebuilds it.",
    "Ears didn't accept the token, so nothing happened.",
    listeningLine,
    "Stopped after 0.6 seconds of recording, but there's no text to send: Whisper heard no words.",
    "Stopped after 0.6 seconds of recording, but there's no text to send: Whisper heard no words.",
    "Not listening: ears is muted, so unmute it with bash host/ears.sh unmute.",
    "Already listening, so just speak: ears sends it when you stop talking.",
    "Not sent yet: no Jarvis chat has taken the recording, so there's nothing to send it to. Press again in a moment.",
  ]);
  assert.equal(listeningLine, "Listening, and a Jarvis chat has taken it. Speak after his chime: ears sends it when you stop talking, or press again once you've spoken to send it now.");
  assert.equal(alreadyLine, "Already listening, so just speak: ears sends it when you stop talking.");
  assert.equal(said.some((line) => line.includes("lights")), false);
});

test("talk reaches ears's own talk-button route", async () => {
  let asked = "";
  const fake = createServer((request, response) => {
    asked = `${request.method} ${request.url} ${request.headers.authorization}`;
    response.end(JSON.stringify({ sent: false }));
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => closed(fake));
  await ask("talk", token, `http://127.0.0.1:${(fake.address() as AddressInfo).port}`);
  assert.equal(asked, `POST /wake/talk Bearer ${token}`);
});

test("talk that can't reach ears says so in a line of its own, and other questions keep the plain error", async () => {
  const said: string[] = [];
  const out = (line: string) => said.push(line);
  const gone = createServer();
  await new Promise<void>((resolve) => gone.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(gone.address() as AddressInfo).port}`;
  await closed(gone);
  assert.deepEqual([await askCommand("talk", token, out, base), await askCommand("state", token, out, base)], [1, 1]);
  assert.deepEqual(said, ["Not listening: couldn't reach ears (fetch failed).", "fetch failed"]);
  said.length = 0;
  assert.equal(await askCommand("talks", token, out, base), 1);
  assert.deepEqual(said, [askUsage]);
});
