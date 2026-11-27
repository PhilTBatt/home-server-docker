import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { Features } from "../../config.js";
import { askMs, workMs, createTalkDesk, isWav, keptMs, leastTalkBytes, mostKept, mostTalkBytes, mostTextChars, mostWaiting, pickUpMs, seenMs, tidyText } from "./desk.js";
import { sweepMs, switchedOff, talk, unknownId } from "./routes.js";
import { mock } from "node:test";

const allOn: Features = { alerts: true, heartbeat: true, dailySummary: true, memoryInbox: true, memoryUpload: true, deals: true, findPhone: true, trains: true, trainAlerts: true, expiryAlerts: true, watchers: true, catchUp: true, modes: true, reminders: true, chores: true, sessions: true, spotify: true, talk: true, wall: true };

const second = Buffer.alloc(32_000, 1);

function wav(bytes = 100): Buffer {
  const sound = Buffer.alloc(bytes);
  sound.write("RIFF", 0, "latin1");
  sound.write("WAVE", 8, "latin1");
  return sound;
}

function buildApp(features: Features = allOn, waitMs = 50) {
  const clock = { at: 1_000_000 };
  let made = 0;
  const desk = createTalkDesk(() => `${(++made).toString(16).padStart(16, "0")}`);
  const app = Fastify();
  app.register(talk, { prefix: "/talk", features, desk, now: () => clock.at, waitMs });
  return { app, clock, desk };
}

function send(app: ReturnType<typeof Fastify>, sound: Buffer) {
  return app.inject({ method: "POST", url: "/talk", headers: { "content-type": "application/octet-stream" }, payload: sound });
}

async function seen(app: ReturnType<typeof Fastify>) {
  const reply = await app.inject({ method: "GET", url: "/talk/next" });
  assert.equal(reply.statusCode, 204);
}

async function taken(app: ReturnType<typeof Fastify>) {
  await seen(app);
  const sent = await send(app, second);
  assert.equal(sent.statusCode, 202);
  const next = await app.inject({ method: "GET", url: "/talk/next" });
  assert.equal(next.statusCode, 200);
  return sent.json().id as string;
}

test("with TALK off every route is a 404 that says so, and nothing is kept", async () => {
  const { app, desk, clock } = buildApp({ ...allOn, talk: false });
  for (const [method, url] of [["GET", "/talk/status"], ["GET", "/talk/next"], ["GET", "/talk/0000000000000001"], ["POST", "/talk/0000000000000001/reply"], ["GET", "/talk/0000000000000001/voice"]] as const) {
    const reply = await app.inject({ method, url, payload: method === "POST" ? { text: "hi" } : undefined });
    assert.deepEqual([reply.statusCode, reply.json()], [404, switchedOff], url);
  }
  const sent = await send(app, second);
  assert.deepEqual([sent.statusCode, sent.json()], [404, switchedOff]);
  assert.equal(desk.jarvisSeen(clock.at), false);
  assert.equal(desk.take(clock.at), null);
});

test("a recording is refused while Jarvis isn't asking for work, so the phone can say he isn't running", async () => {
  const { app, clock } = buildApp();
  assert.deepEqual((await app.inject({ method: "GET", url: "/talk/status" })).json(), { jarvis: false });
  const refused = await send(app, second);
  assert.deepEqual([refused.statusCode, refused.json()], [503, { error: "Jarvis isn't running on the server" }]);
  await seen(app);
  assert.deepEqual((await app.inject({ method: "GET", url: "/talk/status" })).json(), { jarvis: true });
  clock.at += seenMs;
  assert.equal((await send(app, second)).statusCode, 202);
  clock.at += seenMs + 1;
  assert.deepEqual((await app.inject({ method: "GET", url: "/talk/status" })).json(), { jarvis: false });
  assert.equal((await send(app, second)).statusCode, 503);
});

test("a recording goes to Jarvis once, as the raw sound with its id in a header, and never to anyone else", async () => {
  const { app } = buildApp();
  await seen(app);
  const sent = await send(app, second);
  assert.deepEqual([sent.statusCode, sent.json()], [202, { id: "0000000000000001" }]);
  const view = await app.inject({ method: "GET", url: "/talk/0000000000000001" });
  assert.deepEqual(view.json(), { id: "0000000000000001", state: "waiting", heard: null, text: null, question: null, asks: 0, voiceComing: false, voice: false });
  assert.equal(view.headers["cache-control"], "no-store");
  const next = await app.inject({ method: "GET", url: "/talk/next" });
  assert.equal(next.statusCode, 200);
  assert.equal(next.headers["talk-id"], "0000000000000001");
  assert.equal(next.headers["content-type"], "application/octet-stream");
  assert.deepEqual(next.rawPayload, second);
  assert.equal((await app.inject({ method: "GET", url: "/talk/next" })).statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: "/talk/0000000000000001" })).json().state, "taken");
});

test("asking for work waits for a recording, and hands it over as soon as one comes", async () => {
  const { app, desk, clock } = buildApp(allOn, 5_000);
  desk.take(clock.at);
  const waiting = app.inject({ method: "GET", url: "/talk/next" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const started = Date.now();
  assert.equal((await send(app, second)).statusCode, 202);
  const next = await waiting;
  assert.equal(next.statusCode, 200);
  assert.ok(Date.now() - started < 1_000);
});

test("asking for work with nothing coming answers 204 once the wait is up", async () => {
  const { app } = buildApp(allOn, 30);
  const started = Date.now();
  assert.equal((await app.inject({ method: "GET", url: "/talk/next" })).statusCode, 204);
  assert.ok(Date.now() - started >= 25);
});

test("closing the API lets a waiting request for work go at once", async () => {
  const { app } = buildApp(allOn, 60_000);
  await app.ready();
  const waiting = app.inject({ method: "GET", url: "/talk/next" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const started = Date.now();
  await app.close();
  assert.equal((await waiting).statusCode, 204);
  assert.ok(Date.now() - started < 1_000);
});

test("when Jarvis gives up waiting for work, a recording that comes after isn't handed to his closed request", { timeout: 5_000 }, async () => {
  const { app, desk, clock } = buildApp(allOn, 3_000);
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  desk.take(clock.at);
  const leaving = new AbortController();
  const asking = fetch(`${address}/talk/next`, { signal: leaving.signal }).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 50));
  leaving.abort();
  await asking;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const sent = await send(app, second);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(desk.view(sent.json().id, clock.at)?.state, "waiting");
  await app.close();
});

test("recordings must be raw 16-bit sound, from a quarter second to 30 seconds", async () => {
  const { app } = buildApp();
  await seen(app);
  assert.deepEqual((await send(app, Buffer.alloc(leastTalkBytes - 2))).json(), { error: "That recording was too short to hear anything" });
  assert.equal((await send(app, Buffer.alloc(leastTalkBytes))).statusCode, 202);
  assert.deepEqual((await send(app, Buffer.alloc(leastTalkBytes + 1))).json(), { error: "That recording isn't 16-bit sound" });
  assert.equal((await send(app, Buffer.alloc(mostTalkBytes))).statusCode, 202);
  const tooLong = await send(app, Buffer.alloc(mostTalkBytes + 2));
  assert.deepEqual([tooLong.statusCode, tooLong.json()], [400, { error: "Recordings can be at most 30 seconds" }]);
  assert.equal((await send(app, Buffer.alloc(mostTalkBytes + 2048))).statusCode, 413);
  const json = await app.inject({ method: "POST", url: "/talk", payload: { sound: "x" } });
  assert.equal(json.statusCode, 415);
});

test(`at most ${mostWaiting} recordings wait at once`, async () => {
  const { app } = buildApp();
  await seen(app);
  for (let n = 0; n < mostWaiting; n++) assert.equal((await send(app, second)).statusCode, 202);
  const refused = await send(app, second);
  assert.deepEqual([refused.statusCode, refused.json()], [409, { error: `${mostWaiting} recordings are already waiting for Jarvis` }]);
});

test("a recording Jarvis doesn't pick up within a minute is dropped, sound and all, and says so", async () => {
  const { app, clock, desk } = buildApp();
  await seen(app);
  const id = (await send(app, second)).json().id;
  clock.at += pickUpMs + 1;
  const view = await app.inject({ method: "GET", url: `/talk/${id}` });
  assert.deepEqual([view.json().state, view.json().text], ["failed", "Jarvis didn't pick it up within a minute."]);
  assert.equal(desk.take(clock.at), null);
});

test("what he heard, his answer and his voice reach the phone in turn, and the voice is a WAV kept only with its answer", async () => {
  const { app } = buildApp();
  const id = await taken(app);
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/voice`, headers: { "content-type": "audio/wav" }, payload: wav() })).statusCode, 409);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/heard`, payload: { text: "what's the time" } })).json(), { done: true });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/heard`, payload: { text: "again" } })).statusCode, 409);
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}` })).json(), { id, state: "heard", heard: "what's the time", text: null, question: null, asks: 0, voiceComing: false, voice: false });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/reply`, payload: { text: "It's ten past six.", voice: "yes" } })).statusCode, 400);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/reply`, payload: { text: "It's ten past six.", voice: true } })).json(), { done: true });
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}` })).json(), { id, state: "answered", heard: "what's the time", text: "It's ten past six.", question: null, asks: 0, voiceComing: true, voice: false });
  assert.equal((await app.inject({ method: "GET", url: `/talk/${id}/voice` })).statusCode, 404);
  const notWav = await app.inject({ method: "POST", url: `/talk/${id}/voice`, headers: { "content-type": "audio/wav" }, payload: Buffer.alloc(100) });
  assert.equal(notWav.statusCode, 415);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/voice`, headers: { "content-type": "audio/wav" }, payload: wav() })).json(), { done: true });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/voice`, headers: { "content-type": "audio/wav" }, payload: wav() })).statusCode, 409);
  assert.deepEqual([(await app.inject({ method: "GET", url: `/talk/${id}` })).json().voice, (await app.inject({ method: "GET", url: `/talk/${id}` })).json().voiceComing], [true, false]);
  const voice = await app.inject({ method: "GET", url: `/talk/${id}/voice` });
  assert.deepEqual([voice.statusCode, voice.headers["content-type"], voice.headers["cache-control"]], [200, "audio/wav", "no-store"]);
  assert.deepEqual(voice.rawPayload, wav());
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/reply`, payload: { text: "again" } })).statusCode, 409);
});

test("when Jarvis can't answer, the phone is told why", async () => {
  const { app } = buildApp();
  const id = await taken(app);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/failed`, payload: { text: "Whisper isn't running." } })).json(), { done: true });
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}` })).json(), { id, state: "failed", heard: null, text: "Whisper isn't running.", question: null, asks: 0, voiceComing: false, voice: false });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/failed`, payload: { text: "again" } })).statusCode, 409);
});

test("a yes or no Jarvis needs goes to the phone and back once, and the question goes after a minute unanswered", async () => {
  const { app, clock } = buildApp();
  const id = await taken(app);
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/answer`, payload: { yes: true } })).statusCode, 409);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/ask`, payload: { question: "Switch to bedtime?" } })).json(), { done: true });
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}` })).json(), { id, state: "asking", heard: null, text: null, question: "Switch to bedtime?", asks: 1, voiceComing: false, voice: false });
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}/answer` })).json(), { answer: null });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/answer`, payload: { yes: "yes" } })).statusCode, 400);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/answer`, payload: { yes: true } })).json(), { done: true });
  assert.equal((await app.inject({ method: "GET", url: `/talk/${id}` })).json().question, null);
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}/answer` })).json(), { answer: "yes" });
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}/answer` })).json(), { answer: null });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/ask`, payload: { question: "And the lights?" } })).statusCode, 200);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/answer`, payload: { yes: false } })).json(), { done: true });
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}/answer` })).json(), { answer: "no" });
  await app.inject({ method: "POST", url: `/talk/${id}/ask`, payload: { question: "One more?" } });
  assert.equal((await app.inject({ method: "GET", url: `/talk/${id}` })).json().asks, 3, "each question is counted, so the phone can tell the same question asked again");
  clock.at += askMs + 1;
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}` })).json(), { id, state: "heard", heard: null, text: null, question: null, asks: 3, voiceComing: false, voice: false });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/answer`, payload: { yes: true } })).statusCode, 409);
});

test("ids that aren't ours, and anything forgotten after 10 minutes, are a 404 that says so", async () => {
  const { app, clock } = buildApp();
  const id = await taken(app);
  for (const url of ["/talk/0000000000000009", "/talk/ZZZZZZZZZZZZZZZZ", "/talk/..%2f..%2fetc", `/talk/${id}0`]) {
    const reply = await app.inject({ method: "GET", url });
    assert.deepEqual([reply.statusCode, reply.json()], [404, unknownId], url);
  }
  clock.at += keptMs + 1;
  assert.deepEqual((await app.inject({ method: "GET", url: `/talk/${id}` })).json(), unknownId);
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/reply`, payload: { text: "late" } })).statusCode, 404);
});

test(`at most ${mostKept} recordings are kept, oldest forgotten first`, async () => {
  const { app } = buildApp();
  await seen(app);
  for (let n = 0; n < mostKept + 1; n++) {
    assert.equal((await send(app, second)).statusCode, 202);
    await app.inject({ method: "GET", url: "/talk/next" });
  }
  assert.equal((await app.inject({ method: "GET", url: "/talk/0000000000000001" })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/talk/0000000000000002" })).statusCode, 200);
});

test("text is kept tidy: no control characters, at most two blank lines, and a length cap", () => {
  assert.equal(tidyText("  hello\u0000\u0007there\r\nnext\n\n\n\nlast  ", 100), "hello there\nnext\n\nlast");
  assert.equal(tidyText("a".repeat(mostTextChars + 10), mostTextChars).length, mostTextChars);
  assert.equal(isWav(wav()), true);
  assert.equal(isWav(Buffer.alloc(100)), false);
  assert.equal(isWav(wav(44)), false);
});

test("bodies with no text are refused with what was expected", async () => {
  const { app } = buildApp();
  const id = await taken(app);
  for (const [path, key, error] of [["heard", "text", "text must be what Jarvis heard"], ["reply", "text", "text must be Jarvis's answer"], ["failed", "text", "text must say what went wrong"], ["ask", "question", "question must be what Jarvis wants a yes or no to"]]) {
    for (const payload of [{}, { [key]: "   " }, { [key]: 5 }]) {
      const reply = await app.inject({ method: "POST", url: `/talk/${id}/${path}`, payload });
      assert.deepEqual([reply.statusCode, reply.json()], [400, { error }], `${path} ${JSON.stringify(payload)}`);
    }
  }
});

test("when the voice can't be made, Jarvis says so and the phone stops waiting for it, which only an answer still waiting for its voice can be told", async () => {
  const { app } = buildApp();
  const id = await taken(app);
  assert.equal((await app.inject({ method: "POST", url: `/talk/${id}/no-voice` })).statusCode, 409);
  await app.inject({ method: "POST", url: `/talk/${id}/reply`, payload: { text: "Here.", voice: true } });
  assert.equal((await app.inject({ method: "GET", url: `/talk/${id}` })).json().voiceComing, true);
  assert.deepEqual((await app.inject({ method: "POST", url: `/talk/${id}/no-voice` })).json(), { done: true });
  assert.deepEqual([(await app.inject({ method: "GET", url: `/talk/${id}` })).json().voiceComing, (await app.inject({ method: "GET", url: `/talk/${id}` })).json().voice], [false, false]);
  const other = await taken(app);
  await app.inject({ method: "POST", url: `/talk/${other}/reply`, payload: { text: "Here.", voice: true } });
  await app.inject({ method: "POST", url: `/talk/${other}/voice`, headers: { "content-type": "audio/wav" }, payload: wav() });
  assert.equal((await app.inject({ method: "POST", url: `/talk/${other}/no-voice` })).statusCode, 409);
  assert.equal((await app.inject({ method: "POST", url: "/talk/0000000000000099/no-voice" })).statusCode, 404);
});

test("a recording Jarvis took but never answered, as when he was restarted, fails after 6 minutes with why", async () => {
  const { app, clock } = buildApp();
  for (const step of ["taken", "heard", "asking"]) {
    const id = await taken(app);
    if (step !== "taken") await app.inject({ method: "POST", url: `/talk/${id}/heard`, payload: { text: "hi" } });
    if (step === "asking") await app.inject({ method: "POST", url: `/talk/${id}/ask`, payload: { question: "Sure?" } });
    clock.at += workMs - 1;
    assert.equal((await app.inject({ method: "GET", url: `/talk/${id}` })).json().state, step === "asking" ? "heard" : step, step);
    clock.at += 2;
    const view = (await app.inject({ method: "GET", url: `/talk/${id}` })).json();
    assert.deepEqual([view.state, view.text, view.question], ["failed", "Jarvis stopped before he answered.", null], step);
  }
});

test("everything is swept once a minute, even with nobody asking, and the sweeping stops when the API closes", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const real = createTalkDesk();
    const swept: number[] = [];
    const desk = { ...real, sweep: (at: number) => (swept.push(at), real.sweep(at)) };
    const app = Fastify();
    const clock = { at: 5 };
    app.register(talk, { prefix: "/talk", features: allOn, desk, now: () => clock.at });
    await app.ready();
    mock.timers.tick(sweepMs - 1);
    assert.deepEqual(swept, []);
    mock.timers.tick(1);
    clock.at = 6;
    mock.timers.tick(sweepMs);
    assert.deepEqual(swept, [5, 6]);
    await app.close();
    mock.timers.tick(sweepMs * 3);
    assert.equal(swept.length, 2);
    await app.inject({ method: "GET", url: "/talk/status" }).catch(() => null);
  } finally {
    mock.timers.reset();
  }
});

test("asking whether Jarvis is running also sweeps", async () => {
  const { app, desk, clock } = buildApp();
  const id = await taken(app);
  await app.inject({ method: "POST", url: `/talk/${id}/reply`, payload: { text: "Done." } });
  clock.at += keptMs + 1;
  let swept = 0;
  const sweep = desk.sweep;
  desk.sweep = (at) => (swept++, sweep(at));
  await app.inject({ method: "GET", url: "/talk/status" });
  assert.equal(swept, 1);
});
