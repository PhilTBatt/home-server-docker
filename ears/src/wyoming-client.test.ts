import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { test } from "node:test";
import { connectWyoming, describe, transcribe, transcribeChunkBytes, wyomingConnectMs, type WyomingConnection } from "./wyoming-client.js";
import { createEventReader, encodeEvent, type WyomingEvent } from "./wyoming.js";

type StandIn = { port: number; heard: WyomingEvent[]; closed: Promise<void>; server: Server };

const open = new Map<Server, Set<Socket>>();

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function standIn(answer: (event: WyomingEvent, socket: Socket) => Promise<void> | void): Promise<StandIn> {
  const heard: WyomingEvent[] = [];
  let closedNow: () => void = () => {};
  const closed = new Promise<void>((resolve) => (closedNow = resolve));
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const reader = createEventReader();
    let work = Promise.resolve();
    socket.on("data", (bytes: Buffer) => {
      for (const event of reader.push(bytes)) {
        heard.push(event);
        work = work.then(() => answer(event, socket));
      }
    });
    socket.on("close", () => closedNow());
    socket.on("error", () => {});
  });
  open.set(server, sockets);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, heard, closed, server };
}

async function stopped(server: Server) {
  for (const socket of open.get(server) ?? []) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}

async function sendInPieces(socket: Socket, message: Uint8Array, sizes: number[]) {
  let at = 0;
  for (let index = 0; at < message.length; index++) {
    const size = sizes[index % sizes.length];
    socket.write(message.subarray(at, at + size));
    at += size;
    await pause(1);
  }
}

const format = { rate: 16000, width: 2, channels: 1 };
const audio = (from: number, length: number) => Uint8Array.from({ length }, (_unused, index) => (from + index) % 256);

function answers(text: string, before: WyomingEvent[] = []) {
  return async (event: WyomingEvent, socket: Socket) => {
    if (event.type !== "audio-stop") return;
    for (const message of [...before, { type: "transcript", data: { text }, payload: null }].map(encodeEvent)) await sendInPieces(socket, message, [3, 50, 1, 700]);
  };
}

test("a connection gives up after 3 seconds by default, and sound goes in one-second pieces", { timeout: 10_000 }, () => {
  assert.equal(wyomingConnectMs, 3000);
  assert.equal(transcribeChunkBytes, 32_000);
});

test("turning sound into text sends transcribe, audio-start, the sound in pieces and audio-stop, and gives back the transcript's text, however it arrives", { timeout: 10_000 }, async () => {
  const server = await standIn(answers(" Hello Jarvis."));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const sound = audio(0, 65_000);
  assert.equal(await transcribe(connection, sound, format, "en"), " Hello Jarvis.");
  assert.deepEqual(
    server.heard.map((event) => [event.type, event.data, event.payload?.length ?? null]),
    [
      ["transcribe", { language: "en" }, null],
      ["audio-start", format, null],
      ["audio-chunk", format, 32_000],
      ["audio-chunk", format, 32_000],
      ["audio-chunk", format, 1000],
      ["audio-stop", {}, null],
    ],
  );
  assert.deepEqual(Buffer.concat(server.heard.flatMap((event) => (event.payload === null ? [] : [event.payload]))), Buffer.from(sound));
  connection.close();
  await stopped(server.server);
});

test("without a language, transcribe goes with no data and the server's own language is used, and the pieces can be any whole number of samples", { timeout: 10_000 }, async () => {
  const server = await standIn(answers("Hi."));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal(await transcribe(connection, audio(0, 10), format, null, undefined, 4), "Hi.");
  assert.deepEqual(server.heard[0], { type: "transcribe", data: {}, payload: null });
  assert.deepEqual(server.heard.map((event) => event.payload?.length ?? null), [null, null, 4, 4, 2, null]);
  await stopped(server.server);
});

test("no sound at all still sends audio-start and audio-stop, and gives back whatever text comes", { timeout: 10_000 }, async () => {
  const server = await standIn(answers(""));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal(await transcribe(connection, new Uint8Array(0), format, "en"), "");
  assert.deepEqual(server.heard.map((event) => event.type), ["transcribe", "audio-start", "audio-stop"]);
  await stopped(server.server);
});

test("messages it doesn't know, and a transcript sent in parts before the whole one, are passed over", { timeout: 10_000 }, async () => {
  const server = await standIn(answers("The whole thing.", [{ type: "ping", data: {}, payload: null }, { type: "transcript-start", data: {}, payload: null }, { type: "transcript-chunk", data: { text: "The whole" }, payload: null }, { type: "something-new", data: {}, payload: Uint8Array.of(1, 2, 3) }]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal(await transcribe(connection, audio(0, 4), format, "en"), "The whole thing.");
  await stopped(server.server);
});

test("thirty seconds of sound goes through whole, in thirty pieces, leaving nothing listening for a call-off", { timeout: 10_000 }, async () => {
  const sound = audio(3, 960_000);
  const server = await standIn(answers("Long."));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const control = new AbortController();
  assert.equal(await transcribe(connection, sound, format, "en", control.signal), "Long.");
  assert.equal(getEventListeners(control.signal, "abort").length, 0, "each piece stops listening for a call-off once it's sent");
  assert.equal(server.heard.filter((event) => event.type === "audio-chunk").length, 30);
  assert.deepEqual(Buffer.concat(server.heard.flatMap((event) => (event.payload === null ? [] : [event.payload]))), Buffer.from(sound));
  await stopped(server.server);
});

test("sound that isn't a whole number of samples is refused before anything is sent", { timeout: 10_000 }, async () => {
  const server = await standIn(answers("x"));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  await assert.rejects(transcribe(connection, audio(0, 3), format, "en"), { message: "The sound to turn into text isn't a whole number of samples" });
  await assert.rejects(transcribe(await connectWyoming({ host: "127.0.0.1", port: server.port }), audio(0, 6), { rate: 16000, width: 2, channels: 2 }, "en"), { message: "The sound to turn into text isn't a whole number of samples" });
  await pause(20);
  assert.deepEqual(server.heard, []);
  await stopped(server.server);
});

async function refusedWith(answer: (event: WyomingEvent, socket: Socket) => Promise<void> | void, message: string) {
  const server = await standIn(answer);
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  await assert.rejects(transcribe(connection, audio(0, 4), format, "en"), { message });
  await server.closed;
  await assert.rejects(connection.send({ type: "describe", data: {}, payload: null }));
  await stopped(server.server);
}

const replies = (...events: WyomingEvent[]) => (event: WyomingEvent, socket: Socket) => {
  if (event.type === "audio-stop") socket.write(Buffer.concat(events.map((reply) => encodeEvent(reply))));
};

test("an error from the server is passed on with its text, tidied, and the connection is closed", { timeout: 10_000 }, async () => {
  await refusedWith(replies({ type: "error", data: { text: "No model:\u0007 base-int8", code: "bad-model" }, payload: null }), "The Wyoming server refused: No model: base-int8");
  await refusedWith(replies({ type: "error", data: {}, payload: null }), "The Wyoming server refused: no reason given");
});

test("a transcript without its text, or the server closing first or part-way through a message, is an error", { timeout: 10_000 }, async () => {
  await refusedWith(replies({ type: "transcript", data: { text: 3 }, payload: null }), "The Wyoming server sent a transcript without its text");
  await refusedWith(replies({ type: "transcript", data: {}, payload: null }), "The Wyoming server sent a transcript without its text");
  await refusedWith((event, socket) => {
    if (event.type === "audio-stop") socket.end();
  }, "The Wyoming server closed the connection without sending the text");
  await refusedWith((event, socket) => {
    if (event.type === "audio-stop") socket.end(encodeEvent({ type: "transcript", data: { text: "Hello there" }, payload: null }).subarray(0, 20));
  }, "The Wyoming server closed the connection part-way through a message");
  await refusedWith((event, socket) => {
    if (event.type === "audio-stop") socket.write("this isn't json\n");
  }, "The Wyoming server sent a header that isn't JSON");
});

test("calling it off while waiting for the text stops at once, with the caller's reason, and closes the connection", { timeout: 10_000 }, async () => {
  const server = await standIn(() => {});
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const control = new AbortController();
  const asking = transcribe(connection, audio(0, 4), format, "en", control.signal);
  await pause(30);
  control.abort(new Error("Muted"));
  await assert.rejects(asking, { message: "Muted" });
  await server.closed;
  await stopped(server.server);
});

test("a server that stops reading can't hold up a call-off: the sending stops at once, with the caller's reason, and the connection is closed", { timeout: 10_000 }, async () => {
  const sockets = new Set<Socket>();
  let closedNow: () => void = () => {};
  const closed = new Promise<void>((resolve) => (closedNow = resolve));
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.pause();
    socket.on("close", () => closedNow());
    socket.on("error", () => {});
  });
  open.set(server, sockets);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const connection = await connectWyoming({ host: "127.0.0.1", port: (server.address() as AddressInfo).port });
  const control = new AbortController();
  const asking = transcribe(connection, new Uint8Array(16_000_000), format, "en", control.signal);
  await pause(300);
  const began = performance.now();
  control.abort(new Error("Muted"));
  await assert.rejects(asking, { message: "Muted" });
  assert.ok(performance.now() - began < 1000, `${performance.now() - began} ms`);
  await assert.rejects(connection.send({ type: "describe", data: {}, payload: null }), { message: "Muted" });
  for (const socket of sockets) socket.resume();
  await closed;
  await stopped(server);
});

test("already called off, it sends nothing, and a reason is made up when the caller gave none", { timeout: 10_000 }, async () => {
  const server = await standIn(answers("x"));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const control = new AbortController();
  control.abort("no Error");
  await assert.rejects(transcribe(connection, audio(0, 4), format, "en", control.signal), { message: "The request to the Wyoming server was called off" });
  await server.closed;
  assert.deepEqual(server.heard, []);
  await stopped(server.server);
});

test("describing the server returns its info, passing over anything else, and refuses an error or a closed connection", { timeout: 10_000 }, async () => {
  const info = { asr: [{ name: "faster-whisper", models: [{ name: "base-int8", languages: ["en"], installed: true }] }] };
  const server = await standIn((event, socket) => {
    if (event.type === "describe") socket.write(Buffer.concat([encodeEvent({ type: "ping", data: {}, payload: null }), encodeEvent({ type: "info", data: info, payload: null })]));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.deepEqual(await describe(connection), info);
  assert.deepEqual(server.heard, [{ type: "describe", data: {}, payload: null }]);
  connection.close();
  await stopped(server.server);
  const refusing = await standIn((event, socket) => {
    if (event.type === "describe") socket.write(encodeEvent({ type: "error", data: { text: "busy" }, payload: null }));
  });
  await assert.rejects(describe(await connectWyoming({ host: "127.0.0.1", port: refusing.port })), { message: "The Wyoming server refused: busy" });
  await stopped(refusing.server);
  const closing = await standIn((event, socket) => {
    if (event.type === "describe") socket.end();
  });
  await assert.rejects(describe(await connectWyoming({ host: "127.0.0.1", port: closing.port })), { message: "The Wyoming server closed the connection without describing itself" });
  await stopped(closing.server);
});

test("after the server closes, waiting gives nothing more, sending is refused, and a new connection works", { timeout: 10_000 }, async () => {
  const server = await standIn(async (event, socket) => {
    if (event.type === "audio-stop") socket.end(encodeEvent({ type: "transcript", data: { text: "One." }, payload: null }));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal(await transcribe(connection, audio(0, 2), format, "en"), "One.");
  assert.equal(await connection.next(), null);
  await assert.rejects(connection.send({ type: "describe", data: {}, payload: null }), { message: `The connection to the Wyoming server at 127.0.0.1:${server.port} is closed` });
  const again = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal(await transcribe(again, audio(0, 2), format, "en"), "One.");
  await stopped(server.server);
});

test("messages that arrived before the server closed are still read first, and only one wait is allowed at a time", { timeout: 10_000 }, async () => {
  const server = await standIn((event, socket) => {
    if (event.type === "describe") socket.end(Buffer.concat([encodeEvent({ type: "ping", data: {}, payload: null }), encodeEvent({ type: "info", data: {}, payload: null })]));
  });
  const connection: WyomingConnection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const waiting = connection.next();
  await assert.rejects(connection.next(), { message: "Only one wait for the Wyoming server's next message at a time" });
  await connection.send({ type: "describe", data: {}, payload: null });
  await server.closed;
  await pause(20);
  assert.equal((await waiting)?.type, "ping");
  assert.equal((await connection.next())?.type, "info");
  assert.equal(await connection.next(), null);
  await stopped(server.server);
});

test("a wait that's called off stops at once, and the next wait still gets the message", { timeout: 10_000 }, async () => {
  const server = await standIn((event, socket) => {
    if (event.type === "describe") setTimeout(() => socket.write(encodeEvent({ type: "info", data: { a: 1 }, payload: null })), 30);
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const control = new AbortController();
  const waiting = connection.next(control.signal);
  control.abort(new Error("enough"));
  await assert.rejects(waiting, { message: "enough" });
  await connection.send({ type: "describe", data: {}, payload: null });
  assert.deepEqual((await connection.next())?.data, { a: 1 });
  connection.close();
  await stopped(server.server);
});

test("nothing listening is named with its address and reason, a slow server with how long it was given, and a call already called off is refused", { timeout: 10_000 }, async () => {
  const server = await standIn(() => {});
  const port = server.port;
  await stopped(server.server);
  await assert.rejects(connectWyoming({ host: "127.0.0.1", port }), { message: `Couldn't reach the Wyoming server at 127.0.0.1:${port} (ECONNREFUSED)` });
  const control = new AbortController();
  control.abort(new Error("not now"));
  await assert.rejects(connectWyoming({ host: "127.0.0.1", port, signal: control.signal }), { message: "not now" });
  await assert.rejects(connectWyoming({ host: "127.0.0.1", port, connectMs: 0 }), (error: unknown) => error instanceof Error && /^(The Wyoming server at 127\.0\.0\.1:\d+ didn't answer within 0 seconds|Couldn't reach the Wyoming server at 127\.0\.0\.1:\d+ \(ECONNREFUSED\))$/.test(error.message));
});

test("a transcript that came in the same bytes as a bad message still counts, and the bad one's reason comes after it", { timeout: 10_000 }, async () => {
  const server = await standIn((event, socket) => {
    if (event.type === "audio-stop") socket.write(Buffer.concat([encodeEvent({ type: "transcript", data: { text: "Fine." }, payload: null }), Buffer.from("garbage\n")]));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal(await transcribe(connection, audio(0, 4), format, "en"), "Fine.");
  await assert.rejects(connection.next(), { message: "The Wyoming server sent a header that isn't JSON" });
  await server.closed;
  await stopped(server.server);
  await refusedWith((event, socket) => {
    if (event.type === "audio-stop") socket.write(Buffer.concat([encodeEvent({ type: "error", data: { text: "Model failed" }, payload: null }), Buffer.from("garbage\n")]));
  }, "The Wyoming server refused: Model failed");
});

test("a second request on a connection still busy with one is refused, and the first carries on", { timeout: 10_000 }, async () => {
  let reply: () => void = () => {};
  const server = await standIn((event, socket) => {
    if (event.type === "audio-stop") reply = () => socket.write(encodeEvent({ type: "transcript", data: { text: "One." }, payload: null }));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const first = transcribe(connection, audio(0, 4), format, "en");
  await pause(30);
  await assert.rejects(transcribe(connection, audio(0, 4), format, "en"), { message: "The connection to the Wyoming server is still busy with another request" });
  await assert.rejects(describe(connection), { message: "The connection to the Wyoming server is still busy with another request" });
  reply();
  assert.equal(await first, "One.");
  assert.equal(server.heard.filter((event) => event.type === "transcribe").length, 1);
  connection.close();
  await stopped(server.server);
});

test("closing a connection at this end while waiting says so, rather than blaming the server", { timeout: 10_000 }, async () => {
  const server = await standIn(() => {});
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const asking = describe(connection);
  await pause(20);
  connection.close();
  await assert.rejects(asking, { message: `The connection to the Wyoming server at 127.0.0.1:${server.port} was closed at this end` });
  await stopped(server.server);
});

test("connecting can be called off part-way, with the caller's reason", { timeout: 10_000 }, async () => {
  const server = await standIn(() => {});
  const control = new AbortController();
  const connecting = connectWyoming({ host: "127.0.0.1", port: server.port, signal: control.signal });
  control.abort(new Error("stop now"));
  await assert.rejects(connecting, { message: "stop now" });
  await stopped(server.server);
});

test("a connection says how much it's still waiting to send, which grows when the server stops reading", { timeout: 10_000 }, async () => {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.pause();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const connection = await connectWyoming({ host: "127.0.0.1", port: (server.address() as AddressInfo).port });
  assert.equal(connection.buffered(), 0);
  for (let index = 0; index < 400; index++) void connection.send({ type: "audio-chunk", data: format, payload: new Uint8Array(32_000) }).catch(() => {});
  assert.ok(connection.buffered() > 1_000_000, String(connection.buffered()));
  connection.close();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
});
