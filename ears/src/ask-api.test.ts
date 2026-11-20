import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { ask, askCommand, askUsage, questions } from "./ask-api.js";
import { createEars } from "./ears.js";
import { startEarsServer } from "./server.js";
import { textLimitMs } from "./whisper.js";

const token = "t".repeat(64);

test("ask knows four questions: the state, start, stop and health, and waits 4 seconds for an answer, or 70 for a stop, which waits for the text", () => {
  assert.deepEqual(Object.keys(questions), ["state", "start", "stop", "health"]);
  assert.deepEqual(Object.values(questions).map((question) => question.waitMs), [4_000, 4_000, 70_000, 4_000]);
  assert.ok(questions.stop.waitMs > textLimitMs + 5_000);
  assert.deepEqual(questions.health, { method: "GET", path: "/state", waitMs: 4_000 });
  assert.equal(askUsage, "Usage: node dist/ask.js state|start|stop|health");
});

test("health prints only the status and the state's one word, never the last recording's text, since Docker keeps what a health check prints", async () => {
  const ears = createEars({ microphone: "pretend", record: () => ({ pid: 1, ended: Promise.resolve({ reason: "x", failed: false, bytes: 2, ms: 1000, sound: Uint8Array.of(1, 2) }), stop: () => new Promise(() => {}) }), log: () => {}, toText: async () => "Turn the lights on." });
  const server = await startEarsServer(ears, token, 0, "127.0.0.1");
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
  said.length = 0;
  assert.equal(await askCommand("health", token, out, `http://127.0.0.1:${(odd.address() as AddressInfo).port}`), 0);
  assert.deepEqual(said, ["200 (no state)"], "a state that isn't one plain word isn't printed either");
  odd.closeAllConnections();
  await new Promise((resolve) => odd.close(resolve));
});

test("ask sends the token and prints the status and the answer, refusals included", async () => {
  const ears = createEars({ microphone: null, record: () => assert.fail("nothing should record"), log: () => {} });
  const server = await startEarsServer(ears, token, 0, "127.0.0.1");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.deepEqual(await ask("state", token, base), { status: 200, body: '{"state":"muted","reason":"ears starts muted after every start, and waits to be unmuted","microphone":null,"last":null}' });
  assert.deepEqual(await ask("start", token, base), { status: 409, body: '{"error":"ears is muted","state":"muted","reason":"ears starts muted after every start, and waits to be unmuted","microphone":null,"last":null}' });
  ears.unmute();
  assert.deepEqual(await ask("start", token, base), { status: 409, body: '{"error":"no microphone is set, so there\'s nothing to record from","state":"idle","reason":null,"microphone":null,"last":null}' });
  assert.deepEqual(await ask("stop", token, base), { status: 409, body: '{"error":"ears isn\'t recording","state":"idle","reason":null,"microphone":null,"last":null}' });
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
