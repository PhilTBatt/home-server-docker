import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { test } from "node:test";
import { textLimitMs, whisperHost, whisperPort, whisperText } from "./whisper.js";
import { createEventReader, encodeEvent, type WyomingEvent } from "./wyoming.js";

type StandIn = { port: number; heard: WyomingEvent[]; closed: Promise<void>; server: Server; sockets: Set<Socket> };

async function standIn(answer: (event: WyomingEvent, socket: Socket) => void): Promise<StandIn> {
  const heard: WyomingEvent[] = [];
  let closedNow: () => void = () => {};
  const closed = new Promise<void>((resolve) => (closedNow = resolve));
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const reader = createEventReader();
    socket.on("data", (bytes: Buffer) => {
      for (const event of reader.push(bytes)) {
        heard.push(event);
        answer(event, socket);
      }
    });
    socket.on("close", () => closedNow());
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, heard, closed, server, sockets };
}

async function stopped(standing: StandIn) {
  for (const socket of standing.sockets) socket.destroy();
  await new Promise((resolve) => standing.server.close(resolve));
}

const says = (text: string) => (event: WyomingEvent, socket: Socket) => {
  if (event.type === "audio-stop") socket.write(encodeEvent({ type: "transcript", data: { text }, payload: null }));
};

test("Whisper is reached at its service's name on Wyoming's usual port, and gets a minute to turn a recording into text", () => {
  assert.deepEqual([whisperHost, whisperPort, textLimitMs], ["whisper", 10300, 60_000]);
});

test("a recording goes to Whisper as 16-bit mono at 16,000 Hz in Whisper's own language, and the text comes back tidied, with the connection closed", { timeout: 10_000 }, async () => {
  const standing = await standIn(says("  Turn the\n lights on.  "));
  const toText = whisperText({ host: "127.0.0.1", port: standing.port });
  assert.equal(await toText(Uint8Array.of(1, 2, 3, 4), new AbortController().signal), "Turn the lights on.");
  assert.deepEqual(
    standing.heard.map((event) => [event.type, event.data]),
    [
      ["transcribe", {}],
      ["audio-start", { rate: 16000, width: 2, channels: 1 }],
      ["audio-chunk", { rate: 16000, width: 2, channels: 1 }],
      ["audio-stop", {}],
    ],
  );
  await standing.closed;
  await stopped(standing);
});

test("Whisper not answering in time is given up on, saying how long it had, and the connection is closed", { timeout: 10_000 }, async () => {
  const standing = await standIn(() => {});
  const toText = whisperText({ host: "127.0.0.1", port: standing.port, limitMs: 100 });
  await assert.rejects(toText(Uint8Array.of(1, 2), new AbortController().signal), { message: "Whisper took longer than 0.1 seconds" });
  await standing.closed;
  await stopped(standing);
});

test("a Whisper that stops reading the sound is still given up on in time, and the connection is closed", { timeout: 10_000 }, async () => {
  const standing = await standIn(() => {});
  standing.server.on("connection", (socket: Socket) => socket.pause());
  const toText = whisperText({ host: "127.0.0.1", port: standing.port, limitMs: 300 });
  const began = performance.now();
  await assert.rejects(toText(new Uint8Array(16_000_000), new AbortController().signal), { message: "Whisper took longer than 0.3 seconds" });
  assert.ok(performance.now() - began < 1500, `${performance.now() - began} ms`);
  for (const socket of standing.sockets) socket.resume();
  await standing.closed;
  await stopped(standing);
});

test("calling it off stops at once with the caller's reason, not as a time-out, and closes the connection", { timeout: 10_000 }, async () => {
  const standing = await standIn(() => {});
  const toText = whisperText({ host: "127.0.0.1", port: standing.port, limitMs: 5000 });
  const control = new AbortController();
  const asking = toText(Uint8Array.of(1, 2), control.signal);
  await new Promise((resolve) => setTimeout(resolve, 30));
  control.abort(new Error("Muted"));
  await assert.rejects(asking, { message: "Muted" });
  await standing.closed;
  await stopped(standing);
});

test("Whisper's own refusal and a Whisper that isn't there come through as errors that say so", { timeout: 10_000 }, async () => {
  const refusing = await standIn((event, socket) => {
    if (event.type === "audio-stop") socket.write(encodeEvent({ type: "error", data: { text: "Model not loaded" }, payload: null }));
  });
  await assert.rejects(whisperText({ host: "127.0.0.1", port: refusing.port })(Uint8Array.of(1, 2), new AbortController().signal), { message: "The Wyoming server refused: Model not loaded" });
  await stopped(refusing);
  const gone = await standIn(() => {});
  const port = gone.port;
  await stopped(gone);
  await assert.rejects(whisperText({ host: "127.0.0.1", port })(Uint8Array.of(1, 2), new AbortController().signal), { message: `Couldn't reach the Wyoming server at 127.0.0.1:${port} (ECONNREFUSED)` });
});
