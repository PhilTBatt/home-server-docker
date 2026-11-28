import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createSocketServer, type AddressInfo, type Socket } from "node:net";
import { test } from "node:test";
import { typeYes } from "./hub-tools.js";
import { askOnPhone, hubModeCheck, phoneQuestion, withPhoneTag, hubDesk, mostVoiceSeconds, phoneBackNote, phoneOffNote, phoneOldHubNote, phoneUnreachableNote, phoneVoice, wavOf, watchPhone, whisperHears, type NextReply, type PhoneDesk, type PhoneEvent } from "./phone.js";
import type { SpeechEngine } from "./speech.js";
import { createEventReader, encodeEvent, type WyomingEvent } from "./wyoming.js";

type Seen = { method: string; url: string; auth: string | undefined; type: string | undefined; body: Buffer };

async function standInHub(answer: (seen: Seen, response: ServerResponse) => void) {
  const seen: Seen[] = [];
  const server = createServer((request: IncomingMessage, response) => {
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => {
      const one = { method: request.method ?? "", url: request.url ?? "", auth: request.headers.authorization, type: request.headers["content-type"], body: Buffer.concat(parts) };
      seen.push(one);
      answer(one, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

test("the hub's desk takes a recording with its id, sends Jarvis's words as JSON, his voice as a WAV, and reads a yes or no, all with the token", { timeout: 5_000 }, async () => {
  const hub = await standInHub((seen, response) => {
    if (seen.url === "/talk/next") {
      response.writeHead(200, { "content-type": "application/octet-stream", "talk-id": "00000000000000a1" });
      return void response.end(Buffer.alloc(8, 7));
    }
    if (seen.url.endsWith("/answer") && seen.method === "GET") return json(response, 200, { answer: "yes" });
    json(response, 200, { done: true });
  });
  const desk = hubDesk("a-token", hub.url);
  const signal = new AbortController().signal;
  assert.deepEqual(await desk.next(signal), { status: 200, request: { id: "00000000000000a1", audio: new Uint8Array(8).fill(7) }, fields: {} });
  await desk.heard("00000000000000a1", "hello", signal);
  await desk.reply("00000000000000a1", "Hi.", true, signal);
  await desk.failed("00000000000000a1", "Oops.", signal);
  await desk.ask("00000000000000a1", "Sure?", signal);
  assert.equal(await desk.answer("00000000000000a1", signal), "yes");
  await desk.voice("00000000000000a1", wavOf(new Uint8Array(4), 24_000), signal);
  await desk.voice("00000000000000a1", wavOf(new Uint8Array(6), 24_000), signal, 3);
  await desk.voiceDone("00000000000000a1", signal);
  await desk.noVoice("00000000000000a1", signal);
  assert.deepEqual(
    hub.seen.map((one) => [one.method, one.url, one.auth, one.type ?? null, one.type === "application/json" ? JSON.parse(one.body.toString()) : one.body.length]),
    [
      ["GET", "/talk/next", "Bearer a-token", null, 0],
      ["POST", "/talk/00000000000000a1/heard", "Bearer a-token", "application/json", { text: "hello" }],
      ["POST", "/talk/00000000000000a1/reply", "Bearer a-token", "application/json", { text: "Hi.", voice: true }],
      ["POST", "/talk/00000000000000a1/failed", "Bearer a-token", "application/json", { text: "Oops." }],
      ["POST", "/talk/00000000000000a1/ask", "Bearer a-token", "application/json", { question: "Sure?" }],
      ["GET", "/talk/00000000000000a1/answer", "Bearer a-token", null, 0],
      ["POST", "/talk/00000000000000a1/voice", "Bearer a-token", "audio/wav", 48],
      ["POST", "/talk/00000000000000a1/voice?part=3", "Bearer a-token", "audio/wav", 50],
      ["POST", "/talk/00000000000000a1/voice-done", "Bearer a-token", "application/json", {}],
      ["POST", "/talk/00000000000000a1/no-voice", "Bearer a-token", "application/json", {}],
    ],
  );
  await hub.close();
});

test("the hub's desk passes on a 204 or an error as it came, refuses a recording it can't read, and throws the hub's reason when told no", { timeout: 5_000 }, async () => {
  let next = 0;
  const hub = await standInHub((seen, response) => {
    if (seen.url === "/talk/next") {
      next++;
      if (next === 1) return void response.writeHead(204).end();
      if (next === 2) return json(response, 404, { error: "Talking to Jarvis from the phone is switched off" });
      if (next === 3) {
        response.writeHead(200, { "talk-id": "../../etc" });
        return void response.end(Buffer.alloc(4));
      }
      response.writeHead(200, { "talk-id": "00000000000000a1" });
      return void response.end(Buffer.alloc(3));
    }
    if (seen.url.endsWith("/answer")) return json(response, 200, { answer: "maybe" });
    json(response, 409, { error: "That recording has already been answered" });
  });
  const desk = hubDesk("a-token", hub.url);
  const signal = new AbortController().signal;
  assert.deepEqual(await desk.next(signal), { status: 204, request: null, fields: {} });
  assert.deepEqual(await desk.next(signal), { status: 404, request: null, fields: { error: "Talking to Jarvis from the phone is switched off" } });
  for (let n = 0; n < 2; n++) assert.deepEqual(await desk.next(signal), { status: 200, request: null, fields: { error: "its recording couldn't be read" } });
  await assert.rejects(desk.reply("00000000000000a1", "Hi.", false, signal), { message: "the hub said: That recording has already been answered" });
  await assert.rejects(desk.voice("00000000000000a1", wavOf(new Uint8Array(2), 24_000), signal), { message: "the hub said: That recording has already been answered" });
  assert.equal(await desk.answer("00000000000000a1", signal), null);
  await hub.close();
});

function scripted(replies: Array<NextReply | Error>) {
  const asked: number[] = [];
  const desk: Pick<PhoneDesk, "next"> = {
    async next(signal) {
      asked.push(asked.length);
      const reply = replies.shift();
      if (reply === undefined) return new Promise<NextReply>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("called off")), { once: true }));
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { desk, asked };
}

async function firstEvents(events: AsyncIterable<PhoneEvent>, count: number): Promise<PhoneEvent[]> {
  const got: PhoneEvent[] = [];
  for await (const event of events) {
    got.push(event);
    if (got.length === count) break;
  }
  return got;
}

const request = { id: "00000000000000a1", audio: new Uint8Array(4) };

test("watching the phone passes on a recording, then nudges every 2 seconds until it's taken, and asks for no more meanwhile", { timeout: 5_000 }, async (t) => {
  const { desk, asked } = scripted([request, { ...request, id: "00000000000000a2" }, { ...request, id: "00000000000000a3" }].map((one) => ({ status: 200, request: one, fields: {} })));
  const waits: number[] = [];
  const control = new AbortController();
  t.after(() => control.abort());
  const news = watchPhone({ desk, signal: control.signal, wait: async (ms) => void waits.push(ms) });
  const got = await firstEvents(news.events, 3);
  assert.deepEqual(got, [{ kind: "phone" }, { kind: "phone" }, { kind: "phone" }]);
  assert.deepEqual(waits, [2_000, 2_000]);
  assert.equal(asked.length, 1);
  assert.deepEqual(news.take(), request);
  assert.equal(news.take(), null);
});

test("watching the phone says once when the hub has TALK off, is too old, or can't be reached, waits 10 seconds between tries, and says when it's back", { timeout: 5_000 }, async (t) => {
  const { desk } = scripted([
    { status: 404, request: null, fields: { error: "Talking to Jarvis from the phone is switched off" } },
    { status: 404, request: null, fields: { error: "Talking to Jarvis from the phone is switched off" } },
    { status: 404, request: null, fields: { error: "Not Found" } },
    new Error("fetch failed"),
    { status: 500, request: null, fields: {} },
    { status: 204, request: null, fields: {} },
    { status: 200, request, fields: {} },
  ]);
  const waits: number[] = [];
  let clock = 0;
  const control = new AbortController();
  t.after(() => control.abort());
  const news = watchPhone({ desk, signal: control.signal, wait: async (ms) => void waits.push(ms), now: () => (clock += 2_000) });
  const got = await firstEvents(news.events, 6);
  assert.deepEqual(got, [
    { kind: "phone note", line: phoneOffNote },
    { kind: "phone note", line: phoneOldHubNote },
    { kind: "phone note", line: phoneUnreachableNote("fetch failed") },
    { kind: "phone note", line: phoneUnreachableNote("the hub replied 500") },
    { kind: "phone note", line: phoneBackNote },
    { kind: "phone" },
  ]);
  assert.deepEqual(waits, [10_000, 10_000, 10_000, 10_000, 10_000]);
});

test("a hub that answers 204 at once is asked again no more than once a second", { timeout: 5_000 }, async (t) => {
  const { desk } = scripted([{ status: 204, request: null, fields: {} }, { status: 204, request: null, fields: {} }, { status: 200, request, fields: {} }]);
  const waits: number[] = [];
  let clock = 0;
  const control = new AbortController();
  t.after(() => control.abort());
  const news = watchPhone({ desk, signal: control.signal, wait: async (ms) => void waits.push(ms), now: () => (clock += 100) });
  await firstEvents(news.events, 1);
  assert.deepEqual(waits, [900, 900]);
});

test("watching the phone stops quietly when called off mid-ask", { timeout: 5_000 }, async () => {
  const control = new AbortController();
  const desk: Pick<PhoneDesk, "next"> = { next: (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
  const news = watchPhone({ desk, signal: control.signal });
  const reading = firstEvents(news.events, 1);
  setTimeout(() => control.abort(), 20);
  assert.deepEqual(await reading, []);
});

test("a WAV is a 44-byte header for 16-bit mono at the given rate, then the sound", () => {
  const wav = wavOf(Uint8Array.of(1, 2, 3, 4), 24_000);
  const view = new DataView(wav.buffer);
  assert.equal(Buffer.from(wav.subarray(0, 4)).toString("latin1"), "RIFF");
  assert.equal(view.getUint32(4, true), 40);
  assert.equal(Buffer.from(wav.subarray(8, 16)).toString("latin1"), "WAVEfmt ");
  assert.deepEqual([view.getUint32(16, true), view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true), view.getUint32(28, true), view.getUint16(32, true), view.getUint16(34, true)], [16, 1, 1, 24_000, 48_000, 2, 16]);
  assert.equal(Buffer.from(wav.subarray(36, 40)).toString("latin1"), "data");
  assert.equal(view.getUint32(40, true), 4);
  assert.deepEqual([...wav.subarray(44)], [1, 2, 3, 4]);
});

function fakeEngine(bytesEach: number, heard: string[][]): SpeechEngine {
  return {
    name: "Fake",
    sampleRate: 10,
    splitsSentences: false,
    async *speak(text) {
      const pieces: string[] = [];
      heard.push(pieces);
      for await (const piece of text) {
        pieces.push(piece);
        yield new Uint8Array(bytesEach).fill(pieces.length);
      }
    },
    async check() {},
  };
}

test("the phone's voice is the whole answer, each sentence as it would be spoken sent as its own WAV at the engine's rate, as soon as it's made", async () => {
  const heard: string[][] = [];
  const sent: Uint8Array<ArrayBuffer>[] = [];
  const count = await phoneVoice(fakeEngine(4, heard), "It's **sunny**. Take [a coat](https://example.com) anyway.", new AbortController().signal, true, async (wav) => {
    assert.equal(heard[0].length, sent.length + 1, "each piece goes before the next sentence is asked for");
    sent.push(wav);
  });
  assert.equal(count, 2);
  assert.deepEqual(heard, [["It's sunny.", "Take a coat anyway."]]);
  assert.deepEqual(sent.map((wav) => new DataView(wav.buffer).getUint32(24, true)), [10, 10]);
  assert.deepEqual(sent.map((wav) => [...wav.subarray(44)]), [[1, 1, 1, 1], [2, 2, 2, 2]]);
  const none: Uint8Array[] = [];
  assert.equal(await phoneVoice(fakeEngine(4, heard), "```\ncode\n```", new AbortController().signal, true, async (wav) => void none.push(wav)), 0);
  assert.deepEqual(none, []);
});

test(`the phone's voice stops at ${mostVoiceSeconds} seconds in all`, async () => {
  const heard: string[][] = [];
  const most = 10 * 2 * mostVoiceSeconds;
  const sent: Uint8Array[] = [];
  const count = await phoneVoice(fakeEngine(most - 2, heard), "One. Two. Three.", new AbortController().signal, false, async (wav) => void sent.push(wav));
  assert.equal(count, 2);
  assert.deepEqual(sent.map((wav) => wav.length - 44), [most - 2, 2]);
  assert.deepEqual(heard, [["One.", "Two."]]);
});

test("a sentence the engine makes no sound for sends no piece, so the phone never gets a WAV with nothing in it", async () => {
  const sizes = [4, 0, 4];
  const engine: SpeechEngine = {
    name: "Fake",
    sampleRate: 10,
    splitsSentences: false,
    async *speak(text) {
      for await (const _piece of text) yield new Uint8Array(sizes.shift() ?? 0).fill(7);
    },
    async check() {},
  };
  const sent: Uint8Array[] = [];
  assert.equal(await phoneVoice(engine, "One. Two. Three.", new AbortController().signal, false, async (wav) => void sent.push(wav)), 2);
  assert.deepEqual(sent.map((wav) => wav.length - 44), [4, 4]);
});

test("a piece the hub won't take stops the voice there, and no more sentences are made", async () => {
  const heard: string[][] = [];
  let sent = 0;
  await assert.rejects(
    phoneVoice(fakeEngine(4, heard), "One. Two. Three.", new AbortController().signal, false, async () => {
      sent++;
      if (sent === 2) throw new Error("the hub said: no");
    }),
    /the hub said: no/,
  );
  assert.equal(sent, 2);
  assert.deepEqual(heard, [["One.", "Two."]]);
});

test("a yes asked on the phone is put to the hub, then its answer is checked until one comes", async () => {
  const calls: string[] = [];
  const answers: Array<"yes" | "no" | null> = [null, null, "no"];
  const desk = { ask: async (id: string, question: string) => void calls.push(`ask ${id} ${question}`), answer: async (id: string) => (calls.push(`answer ${id}`), answers.shift() ?? null) } as unknown as PhoneDesk;
  const waits: number[] = [];
  assert.equal(await askOnPhone({ desk, askPollMs: 5, wait: async (ms) => void waits.push(ms) }, "00000000000000a1", "Sure?", new AbortController().signal), "no");
  assert.deepEqual(calls.slice(0, 1), ["ask 00000000000000a1 Sure?"]);
  calls.length = 0;
  answers.push("yes");
  assert.equal(await askOnPhone({ desk, askPollMs: 5, wait: async () => {} }, "00000000000000a1", `Jarvis wants to scan the library. ${typeYes}`, new AbortController().signal), "yes");
  assert.deepEqual(calls[0], "ask 00000000000000a1 Jarvis wants to scan the library.", "the phone's question doesn't say to type yes");
  calls.length = 0;
  answers.push(null, null, "no");
  assert.equal(await askOnPhone({ desk, askPollMs: 5, wait: async (ms) => void waits.push(ms) }, "00000000000000a1", "Sure?", new AbortController().signal), "no");
  assert.deepEqual(calls, ["ask 00000000000000a1 Sure?", "answer 00000000000000a1", "answer 00000000000000a1", "answer 00000000000000a1"]);
  assert.deepEqual(waits, [5, 5, 5, 5, 5, 5]);
});

test("a yes the phone never answers gives no answer once the time is up, and stops at once when called off", async () => {
  const desk = { ask: async () => {}, answer: async () => null } as unknown as PhoneDesk;
  const started = Date.now();
  assert.equal(await askOnPhone({ desk, askPollMs: 5, askMs: 60 }, "00000000000000a1", "Sure?", new AbortController().signal), null);
  assert.ok(Date.now() - started < 1_000);
  const control = new AbortController();
  const asking = askOnPhone({ desk, askPollMs: 5, askMs: 60_000 }, "00000000000000a1", "Sure?", control.signal);
  setTimeout(() => control.abort(), 20);
  assert.equal(await asking, null);
});

test("the phone's recording goes to Whisper as 16-bit mono at 16,000 a second, in English, and comes back tidied", { timeout: 5_000 }, async () => {
  const heard: WyomingEvent[] = [];
  const sockets = new Set<Socket>();
  const server = createSocketServer((socket) => {
    sockets.add(socket);
    const reader = createEventReader();
    socket.on("data", (bytes: Buffer) => {
      for (const event of reader.push(bytes)) {
        heard.push(event);
        if (event.type === "audio-stop") socket.write(encodeEvent({ type: "transcript", data: { text: "  What's\n on   today? " }, payload: null }));
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const hear = whisperHears({ host: "127.0.0.1", port: (server.address() as AddressInfo).port });
  assert.equal(await hear(new Uint8Array(6), new AbortController().signal), "What's on today?");
  assert.deepEqual(heard.slice(0, 2).map((event) => [event.type, event.data]), [["transcribe", { language: "en" }], ["audio-start", { rate: 16_000, width: 2, channels: 1 }]]);
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
});

test("a Whisper that's too slow is named with how long it was given", { timeout: 5_000 }, async () => {
  const sockets = new Set<Socket>();
  const server = createSocketServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const hear = whisperHears({ host: "127.0.0.1", port: (server.address() as AddressInfo).port, limitMs: 50 });
  await assert.rejects(hear(new Uint8Array(6), new AbortController().signal), { message: "Whisper took longer than 0.05 seconds" });
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
});

test("a phone question is marked on a line of its own, and a yes asked on the phone loses the typed-yes wording wherever it is", () => {
  assert.equal(withPhoneTag("what's on"), "what's on\n\n[Asked from his phone, through the hub.]");
  assert.equal(phoneQuestion(`Jarvis wants to scan the library. ${typeYes}`), "Jarvis wants to scan the library.");
  assert.equal(phoneQuestion(typeYes), "");
  assert.equal(phoneQuestion("Switch to bedtime?"), "Switch to bedtime?");
});

test("the phone's mode check reads the hub's GET /mode with the token, says off when modes are off there, and throws on anything else", { timeout: 5_000 }, async () => {
  let reply: [number, unknown] = [200, { mode: "guest", until: null, by: "phone" }];
  const hub = await standInHub((_seen, response) => json(response, reply[0], reply[1]));
  try {
    const check = hubModeCheck("test-token", hub.url);
    assert.equal(await check(new AbortController().signal), "guest");
    assert.deepEqual(hub.seen.map((one) => [one.method, one.url, one.auth]), [["GET", "/mode", "Bearer test-token"]]);
    reply = [200, { mode: "normal", until: null, by: "typed" }];
    assert.equal(await check(new AbortController().signal), "normal");
    reply = [404, { error: "Modes are switched off" }];
    assert.equal(await check(new AbortController().signal), "off");
    reply = [500, { error: "broken" }];
    await assert.rejects(check(new AbortController().signal), /the hub said: broken/);
    reply = [200, { mode: "party" }];
    await assert.rejects(check(new AbortController().signal), /couldn't be read/);
  } finally {
    await hub.close();
  }
});
