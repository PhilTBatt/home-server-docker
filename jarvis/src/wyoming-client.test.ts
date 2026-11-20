import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { test } from "node:test";
import { connectWyoming, describe, synthesize, wyomingConnectMs, type AudioPiece, type WyomingConnection } from "./wyoming-client.js";
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

const format = { rate: 22050, width: 2, channels: 1 };
const audio = (from: number, length: number) => Uint8Array.from({ length }, (_unused, index) => (from + index) % 256);
const spoken = (pieces: AudioPiece[]) => pieces.map((piece) => [piece.rate, piece.width, piece.channels, [...piece.audio]]);

async function heard(speech: AsyncIterable<AudioPiece>): Promise<AudioPiece[]> {
  const pieces: AudioPiece[] = [];
  for await (const piece of speech) pieces.push(piece);
  return pieces;
}

function speaks(chunks: Uint8Array[], extra: WyomingEvent[] = []) {
  return async (event: WyomingEvent, socket: Socket) => {
    if (event.type !== "synthesize") return;
    const messages = [{ type: "audio-start", data: format, payload: null }, ...extra, ...chunks.map((payload) => ({ type: "audio-chunk", data: format, payload })), { type: "audio-stop", data: {}, payload: null }].map(encodeEvent);
    for (const message of messages) await sendInPieces(socket, message, [3, 50, 1, 700]);
  };
}

test("a connection gives up after 3 seconds by default", { timeout: 10_000 }, () => {
  assert.equal(wyomingConnectMs, 3000);
});

test("speaking sends one synthesize message with the text and voice, and passes back the sound in order, however it arrives", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(0, 1000), audio(7, 2)]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.deepEqual(spoken(await heard(synthesize(connection, "Hello there.", "en_GB-alan-medium"))), [[22050, 2, 1, [...audio(0, 1000)]], [22050, 2, 1, [...audio(7, 2)]]]);
  assert.deepEqual(server.heard, [{ type: "synthesize", data: { text: "Hello there.", voice: { name: "en_GB-alan-medium" } }, payload: null }]);
  connection.close();
  await stopped(server.server);
});

test("without a voice, only the text is sent, and the server's default is used", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(0, 4)]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  await heard(synthesize(connection, "Hi.", null));
  assert.deepEqual(server.heard.map((event) => event.data), [{ text: "Hi." }]);
  connection.close();
  await stopped(server.server);
});

test("several pieces of speech in a row go over one connection, each ending at its audio-stop", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(1, 6)]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  for (const words of ["One.", "Two.", "Three."]) assert.deepEqual(spoken(await heard(synthesize(connection, words, null))), [[22050, 2, 1, [...audio(1, 6)]]]);
  assert.deepEqual(server.heard.map((event) => event.data.text), ["One.", "Two.", "Three."]);
  connection.close();
  await stopped(server.server);
});

test("messages it doesn't know, and empty pieces of sound, are passed over", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(2, 4), new Uint8Array(0)], [{ type: "ping", data: { text: "x" }, payload: null }, { type: "something-new", data: {}, payload: Uint8Array.of(1, 2, 3) }]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.deepEqual(spoken(await heard(synthesize(connection, "Hi.", null))), [[22050, 2, 1, [...audio(2, 4)]]]);
  connection.close();
  await stopped(server.server);
});

test("a large piece of sound comes through whole", { timeout: 10_000 }, async () => {
  const big = audio(3, 1_048_576);
  const server = await standIn(async (event, socket) => {
    if (event.type !== "synthesize") return;
    socket.write(encodeEvent({ type: "audio-start", data: format, payload: null }));
    socket.write(encodeEvent({ type: "audio-chunk", data: format, payload: big }));
    socket.write(encodeEvent({ type: "audio-stop", data: {}, payload: null }));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const pieces = await heard(synthesize(connection, "Long.", null));
  assert.equal(pieces.length, 1);
  assert.deepEqual(pieces[0].audio, big);
  connection.close();
  await stopped(server.server);
});

async function refusedWith(answer: (event: WyomingEvent, socket: Socket) => Promise<void> | void, message: string) {
  const server = await standIn(answer);
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  await assert.rejects(heard(synthesize(connection, "Hi.", null)), { message });
  await server.closed;
  await assert.rejects(connection.send({ type: "describe", data: {}, payload: null }));
  await stopped(server.server);
}

const replies = (...events: WyomingEvent[]) => (event: WyomingEvent, socket: Socket) => {
  if (event.type === "synthesize") socket.write(Buffer.concat(events.map((reply) => encodeEvent(reply))));
};

test("an error from the server is passed on with its text, tidied, and the connection is closed", { timeout: 10_000 }, async () => {
  await refusedWith(replies({ type: "error", data: { text: "Unknown voice:\u0007 en_XX", code: "bad-voice" }, payload: null }), "The Wyoming server refused: Unknown voice: en_XX");
  await refusedWith(replies({ type: "error", data: {}, payload: null }), "The Wyoming server refused: no reason given");
});

test("sound that isn't described first, changes how it's encoded, isn't whole samples or comes twice is refused, and the connection closed", { timeout: 10_000 }, async () => {
  const start = { type: "audio-start", data: format, payload: null };
  await refusedWith(replies({ type: "audio-chunk", data: format, payload: audio(0, 4) }), "The Wyoming server sent sound before saying how it's encoded");
  await refusedWith(replies(start, { type: "audio-chunk", data: { ...format, rate: 16000 }, payload: audio(0, 4) }), "The Wyoming server changed how its sound is encoded part-way through");
  await refusedWith(replies(start, { type: "audio-chunk", data: format, payload: audio(0, 3) }), "The Wyoming server sent a piece of sound that isn't a whole number of samples");
  await refusedWith(replies({ ...start, data: { ...format, channels: 2 } }, { type: "audio-chunk", data: { ...format, channels: 2 }, payload: audio(0, 6) }), "The Wyoming server sent a piece of sound that isn't a whole number of samples");
  await refusedWith(replies(start, start), "The Wyoming server started the speech twice");
  for (const data of [{ width: 2, channels: 1 }, { rate: 0, width: 2, channels: 1 }, { rate: 22050, width: 1.5, channels: 1 }, { rate: 22050, width: 2, channels: "1" }]) {
    await refusedWith(replies({ type: "audio-start", data, payload: null }), "The Wyoming server sent audio-start without a clear rate, sample width and number of channels");
  }
  await refusedWith(replies(start, { type: "audio-chunk", data: { rate: 22050 }, payload: audio(0, 4) }), "The Wyoming server sent audio-chunk without a clear rate, sample width and number of channels");
});

test("a connection closed before the end of the speech, or part-way through a message, is an error", { timeout: 10_000 }, async () => {
  await refusedWith((event, socket) => {
    if (event.type === "synthesize") socket.end(encodeEvent({ type: "audio-start", data: format, payload: null }));
  }, "The Wyoming server closed the connection before the end of the speech");
  await refusedWith((event, socket) => {
    if (event.type === "synthesize") socket.end(encodeEvent({ type: "audio-chunk", data: format, payload: audio(0, 100) }).subarray(0, 60));
  }, "The Wyoming server closed the connection part-way through a message");
  await refusedWith((event, socket) => {
    if (event.type === "synthesize") socket.write("this isn't json\n");
  }, "The Wyoming server sent a header that isn't JSON");
});

test("an audio-stop with no sound before it ends the speech with nothing to play", { timeout: 10_000 }, async () => {
  const server = await standIn(replies({ type: "audio-stop", data: {}, payload: null }));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.deepEqual(await heard(synthesize(connection, "", null)), []);
  connection.close();
  await stopped(server.server);
});

test("calling off speech part-way stops it at once, with the caller's reason, and closes the connection", { timeout: 10_000 }, async () => {
  const server = await standIn(async (event, socket) => {
    if (event.type === "synthesize") socket.write(Buffer.concat([encodeEvent({ type: "audio-start", data: format, payload: null }), encodeEvent({ type: "audio-chunk", data: format, payload: audio(0, 4) })]));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const control = new AbortController();
  const pieces: AudioPiece[] = [];
  const speech = (async () => {
    for await (const piece of synthesize(connection, "Hi.", null, control.signal)) {
      pieces.push(piece);
      setTimeout(() => control.abort(new Error("Speech was stopped")), 20);
    }
  })();
  await assert.rejects(speech, { message: "Speech was stopped" });
  assert.equal(pieces.length, 1);
  await server.closed;
  await stopped(server.server);
});

test("speech already called off sends nothing, and a reason is made up when the caller gave none", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(0, 4)]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const control = new AbortController();
  control.abort("no Error");
  await assert.rejects(heard(synthesize(connection, "Hi.", null, control.signal)), { message: "The request to the Wyoming server was called off" });
  await server.closed;
  assert.deepEqual(server.heard, []);
  await stopped(server.server);
});

test("leaving the speech before its end closes the connection, since the rest would still arrive on it", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(0, 4), audio(1, 4), audio(2, 4)]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  for await (const piece of synthesize(connection, "Hi.", null)) {
    assert.equal(piece.audio.length, 4);
    break;
  }
  await server.closed;
  await assert.rejects(connection.send({ type: "describe", data: {}, payload: null }), { message: `The connection to the Wyoming server at 127.0.0.1:${server.port} was closed at this end` });
  await stopped(server.server);
});

test("describing the server returns its info, passing over anything else, and refuses an error or a closed connection", { timeout: 10_000 }, async () => {
  const info = { tts: [{ name: "piper", models: [{ name: "en_GB-alan-medium", languages: ["en_GB"], installed: true }] }] };
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
  let first = true;
  const server = await standIn(async (event, socket) => {
    if (event.type !== "synthesize") return;
    socket.write(Buffer.concat([encodeEvent({ type: "audio-start", data: format, payload: null }), encodeEvent({ type: "audio-chunk", data: format, payload: audio(0, 2) }), encodeEvent({ type: "audio-stop", data: {}, payload: null })]));
    if (first) socket.end();
    first = false;
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal((await heard(synthesize(connection, "One.", null))).length, 1);
  assert.equal(await connection.next(), null);
  await assert.rejects(connection.send({ type: "describe", data: {}, payload: null }), { message: `The connection to the Wyoming server at 127.0.0.1:${server.port} is closed` });
  const again = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal((await heard(synthesize(again, "Two.", null))).length, 1);
  again.close();
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

test("good messages that came in the same bytes as a bad one still count, and the bad one's reason comes after them", { timeout: 10_000 }, async () => {
  const server = await standIn((event, socket) => {
    if (event.type === "synthesize") socket.write(Buffer.concat([encodeEvent({ type: "audio-start", data: format, payload: null }), encodeEvent({ type: "audio-chunk", data: format, payload: audio(0, 4) }), encodeEvent({ type: "audio-stop", data: {}, payload: null }), Buffer.from("garbage\n")]));
  });
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  assert.equal((await heard(synthesize(connection, "Hi.", null))).length, 1);
  await assert.rejects(connection.next(), { message: "The Wyoming server sent a header that isn't JSON" });
  await server.closed;
  await stopped(server.server);
  await refusedWith(replies({ type: "error", data: { text: "Voice not found" }, payload: null }, { type: "nonsense", data: {}, payload: null }), "The Wyoming server refused: Voice not found");
  await refusedWith((event, socket) => {
    if (event.type === "synthesize") socket.write(Buffer.concat([encodeEvent({ type: "error", data: { text: "Voice not found" }, payload: null }), Buffer.from("garbage\n")]));
  }, "The Wyoming server refused: Voice not found");
});

test("an error after some sound is passed on after that sound, and messages it doesn't know before the start are passed over", { timeout: 10_000 }, async () => {
  const pieces: AudioPiece[] = [];
  const server = await standIn(replies({ type: "ping", data: {}, payload: null }, { type: "audio-start", data: format, payload: null }, { type: "audio-chunk", data: format, payload: audio(0, 4) }, { type: "error", data: { text: "Piper failed on sentence 2" }, payload: null }));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  await assert.rejects(
    (async () => {
      for await (const piece of synthesize(connection, "One. Two.", null)) pieces.push(piece);
    })(),
    { message: "The Wyoming server refused: Piper failed on sentence 2" },
  );
  assert.deepEqual(spoken(pieces), [[22050, 2, 1, [...audio(0, 4)]]]);
  await server.closed;
  await stopped(server.server);
});

test("a second request on a connection still busy with one is refused, and the first carries on", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks([audio(0, 4), audio(1, 4)]));
  const connection = await connectWyoming({ host: "127.0.0.1", port: server.port });
  const first = synthesize(connection, "One.", null);
  const firstPiece = await first.next();
  assert.equal(firstPiece.done, false);
  await assert.rejects(heard(synthesize(connection, "Two.", null)), { message: "The connection to the Wyoming server is still busy with another request" });
  await assert.rejects(describe(connection), { message: "The connection to the Wyoming server is still busy with another request" });
  assert.equal((await heard(first)).length, 1);
  assert.equal((await heard(synthesize(connection, "Three.", null))).length, 2);
  assert.deepEqual(server.heard.map((event) => event.data.text), ["One.", "Three."]);
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
