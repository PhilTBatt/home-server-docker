import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createPiper, piperCheckMs, piperHost, piperName, piperPort, piperRate, piperSpeakMs } from "./piper.js";
import { startPlayer } from "./player.js";
import { setVolume } from "./sound-card.js";
import { say } from "./speech.js";
import { readySentence, startVoice } from "./voice.js";
import { createEventReader, encodeEvent, type WyomingEvent } from "./wyoming.js";

type StandIn = { port: number; heard: WyomingEvent[][]; closed: () => number; server: Server };

const open = new Map<Server, Set<Socket>>();
const folders: string[] = [];

after(async () => {
  for (const folder of folders) await rm(folder, { recursive: true, force: true });
});

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function standIn(answer: (event: WyomingEvent, socket: Socket) => Promise<void> | void): Promise<StandIn> {
  const heard: WyomingEvent[][] = [];
  let closed = 0;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const mine: WyomingEvent[] = [];
    heard.push(mine);
    const reader = createEventReader();
    let work = Promise.resolve();
    socket.on("data", (bytes: Buffer) => {
      for (const event of reader.push(bytes)) {
        mine.push(event);
        work = work.then(() => answer(event, socket));
      }
    });
    socket.on("close", () => closed++);
    socket.on("error", () => {});
  });
  open.set(server, sockets);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, heard, closed: () => closed, server };
}

async function stopped(server: Server) {
  for (const socket of open.get(server) ?? []) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
}

async function until(done: () => boolean) {
  for (let tries = 0; tries < 200 && !done(); tries++) await pause();
}

const format = { rate: 22050, width: 2, channels: 1 };
const audio = (from: number, length: number) => Uint8Array.from({ length }, (_unused, index) => (from + index) % 256);

function speaks(chunks: (text: string) => Uint8Array[], shape = format) {
  return (event: WyomingEvent, socket: Socket) => {
    if (event.type !== "synthesize") return;
    const pieces = chunks(String(event.data.text));
    for (const message of [{ type: "audio-start", data: shape, payload: null }, ...pieces.map((payload) => ({ type: "audio-chunk", data: shape, payload })), { type: "audio-stop", data: {}, payload: null }]) socket.write(encodeEvent(message));
  };
}

function describes(info: Record<string, unknown>) {
  return (event: WyomingEvent, socket: Socket) => {
    if (event.type === "describe") socket.write(encodeEvent({ type: "info", data: info, payload: null }));
  };
}

const piperInfo = (voices: string[]) => ({ asr: [], tts: [{ name: "piper", installed: true, voices: voices.map((name) => ({ name, installed: true, languages: ["en_GB"] })) }], wake: [] });

async function* texts(...pieces: string[]): AsyncGenerator<string> {
  for (const piece of pieces) yield piece;
}

async function sounds(speech: AsyncIterable<Uint8Array>): Promise<number[][]> {
  const out: number[][] = [];
  for await (const sound of speech) out.push([...sound]);
  return out;
}

test("Piper is reached by the compose service's name on Wyoming's usual port, gets 30 seconds a piece and 3 to answer a check", () => {
  assert.deepEqual([piperName, piperHost, piperPort, piperSpeakMs, piperCheckMs], ["Piper", "piper", 10200, 30_000, 3_000]);
});

test("a voice's quality sets the rate Jarvis plays it at: medium and high are 22,050 Hz, low and x_low 16,000 Hz", () => {
  assert.equal(piperRate("en_GB-alan-medium"), 22_050);
  assert.equal(piperRate("en_US-lessac-high"), 22_050);
  assert.equal(piperRate("en_GB-alan-low"), 16_000);
  assert.equal(piperRate("de_DE-eva_k-x_low"), 16_000);
  assert.equal(piperRate("en_GB-southern_english_female-low"), 16_000);
  assert.equal(piperRate("en_US-lowell-medium"), 22_050);
  assert.equal(piperRate("en_US-low_voice-high"), 22_050);
  const engine = createPiper({ voice: "en_GB-alan-low" });
  assert.deepEqual([engine.name, engine.sampleRate, engine.splitsSentences], ["Piper", 16_000, false]);
  assert.equal(createPiper({ voice: "en_GB-alan-medium" }).sampleRate, 22_050);
});

test("each piece is one synthesize request naming the voice, on a connection of its own that's closed once its sound is back, and its sound comes back whole and in order", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks((text) => (text === "Hello there." ? [audio(0, 1000), audio(9, 4)] : [audio(5, 6)])));
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
  const spoken = await sounds(engine.speak(texts("Hello there.", "  ", "", "How are you? Fine, thanks.  "), new AbortController().signal));
  assert.deepEqual(spoken, [[...audio(0, 1000), ...audio(9, 4)], [...audio(5, 6)]]);
  assert.deepEqual(server.heard, [
    [{ type: "synthesize", data: { text: "Hello there.", voice: { name: "en_GB-alan-medium" } }, payload: null }],
    [{ type: "synthesize", data: { text: "How are you? Fine, thanks.", voice: { name: "en_GB-alan-medium" } }, payload: null }],
  ]);
  await until(() => server.closed() === 2);
  assert.equal(server.closed(), 2);
  await stopped(server.server);
});

test("a piece's sound is asked for only once the one before it has been taken", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks(() => [audio(1, 2)]));
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
  const speech = engine.speak(texts("One.", "Two."), new AbortController().signal)[Symbol.asyncIterator]();
  await speech.next();
  await pause(50);
  assert.equal(server.heard.length, 1);
  await speech.next();
  assert.equal(server.heard.length, 2);
  assert.equal((await speech.next()).done, true);
  await stopped(server.server);
});

test("sound that isn't 16-bit mono at the voice's rate is refused, saying what came and what Jarvis plays", { timeout: 10_000 }, async () => {
  for (const [shape, said] of [
    [{ rate: 24000, width: 2, channels: 1 }, "Piper sent sound at 24000 Hz, 16-bit, with 1 channel, but Jarvis plays en_GB-alan-medium as 22050 Hz, 16-bit mono"],
    [{ rate: 22050, width: 4, channels: 1 }, "Piper sent sound at 22050 Hz, 32-bit, with 1 channel, but Jarvis plays en_GB-alan-medium as 22050 Hz, 16-bit mono"],
    [{ rate: 22050, width: 2, channels: 2 }, "Piper sent sound at 22050 Hz, 16-bit, with 2 channels, but Jarvis plays en_GB-alan-medium as 22050 Hz, 16-bit mono"],
  ] as const) {
    const server = await standIn(speaks(() => [audio(0, 8)], shape));
    const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
    await assert.rejects(sounds(engine.speak(texts("Hi."), new AbortController().signal)), { message: said });
    await until(() => server.closed() === 1);
    assert.equal(server.closed(), 1);
    await stopped(server.server);
  }
  const low = await standIn(speaks(() => [audio(0, 8)]));
  await assert.rejects(sounds(createPiper({ voice: "en_GB-alan-low", host: "127.0.0.1", port: low.port }).speak(texts("Hi."), new AbortController().signal)), { message: "Piper sent sound at 22050 Hz, 16-bit, with 1 channel, but Jarvis plays en_GB-alan-low as 16000 Hz, 16-bit mono" });
  await stopped(low.server);
});

test("a piece Piper answers with no sound at all is an error, not silence", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks(() => []));
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
  await assert.rejects(sounds(engine.speak(texts("Hi."), new AbortController().signal)), { message: "Piper sent no sound" });
  const stopOnly = await standIn((event, socket) => {
    if (event.type === "synthesize") socket.write(encodeEvent({ type: "audio-stop", data: {}, payload: null }));
  });
  await assert.rejects(sounds(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: stopOnly.port }).speak(texts("Hi."), new AbortController().signal)), { message: "Piper sent no sound" });
  await stopped(server.server);
  await stopped(stopOnly.server);
});

test("Piper's own refusal, a closed port and a dropped connection come through as errors that say so", { timeout: 10_000 }, async () => {
  const refuses = await standIn((event, socket) => {
    if (event.type === "synthesize") socket.end(encodeEvent({ type: "error", data: { text: "[Errno 30] Read-only file system: '/data/en_GB-alan-medium.onnx.part'", code: "OSError" }, payload: null }));
  });
  await assert.rejects(sounds(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: refuses.port }).speak(texts("Hi."), new AbortController().signal)), { message: "The Wyoming server refused: [Errno 30] Read-only file system: '/data/en_GB-alan-medium.onnx.part'" });
  const drops = await standIn((event, socket) => {
    if (event.type === "synthesize") socket.end(encodeEvent({ type: "audio-start", data: format, payload: null }));
  });
  await assert.rejects(sounds(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: drops.port }).speak(texts("Hi."), new AbortController().signal)), { message: "The Wyoming server closed the connection before the end of the speech" });
  const port = refuses.port;
  await stopped(refuses.server);
  await stopped(drops.server);
  await assert.rejects(sounds(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port }).speak(texts("Hi."), new AbortController().signal)), { message: `Couldn't reach the Wyoming server at 127.0.0.1:${port} (ECONNREFUSED)` });
});

test("a piece that takes longer than its time is given up on, saying how long it had, and its connection is closed", { timeout: 10_000 }, async () => {
  const server = await standIn(() => {});
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port, speakMs: 150 });
  const began = performance.now();
  await assert.rejects(sounds(engine.speak(texts("Hi."), new AbortController().signal)), { message: "Piper took longer than 0.15 seconds over one piece of speech" });
  assert.ok(performance.now() - began < 2000);
  await until(() => server.closed() === 1);
  assert.equal(server.closed(), 1);
  const trickles = await standIn((event, socket) => {
    if (event.type !== "synthesize") return;
    socket.write(encodeEvent({ type: "audio-start", data: format, payload: null }));
    const timer = setInterval(() => socket.write(encodeEvent({ type: "audio-chunk", data: format, payload: audio(0, 2) })), 20);
    socket.on("close", () => clearInterval(timer));
  });
  await assert.rejects(sounds(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: trickles.port, speakMs: 150 }).speak(texts("Hi."), new AbortController().signal)), { message: "Piper took longer than 0.15 seconds over one piece of speech" });
  await stopped(server.server);
  await stopped(trickles.server);
});

test("calling a piece off ends it with the caller's own reason, at once, and closes its connection", { timeout: 10_000 }, async () => {
  const server = await standIn(() => {});
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
  const stop = new AbortController();
  const why = new Error("new question");
  const speech = sounds(engine.speak(texts("Hi."), stop.signal));
  await until(() => server.heard.length === 1 && server.heard[0].length === 1);
  stop.abort(why);
  await assert.rejects(speech, (error: unknown) => error === why);
  await until(() => server.closed() === 1);
  assert.equal(server.closed(), 1);
  const before = new AbortController();
  before.abort(why);
  await assert.rejects(sounds(engine.speak(texts("Hi."), before.signal)), (error: unknown) => error === why);
  const callersOwnTimeout = AbortSignal.timeout(100);
  await assert.rejects(sounds(engine.speak(texts("Hi."), callersOwnTimeout)), (error: unknown) => error === callersOwnTimeout.reason);
  const checkTimeout = AbortSignal.timeout(100);
  await assert.rejects(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port }).check(checkTimeout), (error: unknown) => error === checkTimeout.reason);
  await stopped(server.server);
});

test("the check asks Piper to describe itself and is happy when it's Piper and lists the voice, then closes its connection", { timeout: 10_000 }, async () => {
  const server = await standIn(describes(piperInfo(["en_GB-alan-low", "en_GB-alan-medium"])));
  await createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port }).check(new AbortController().signal);
  assert.deepEqual(server.heard, [[{ type: "describe", data: {}, payload: null }]]);
  await until(() => server.closed() === 1);
  assert.equal(server.closed(), 1);
  await stopped(server.server);
});

test("the check says when what answered isn't Piper, or Piper has no such voice", { timeout: 10_000 }, async () => {
  for (const info of [{}, { tts: [] }, { tts: "piper" }, { tts: [{ name: "omnivoice", voices: [{ name: "en_GB-alan-medium" }] }] }, { tts: [null, "piper"] }]) {
    const server = await standIn(describes(info));
    await assert.rejects(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port }).check(new AbortController().signal), { message: `Something answered at 127.0.0.1:${server.port}, but not as Piper does` }, JSON.stringify(info));
    await until(() => server.closed() === 1);
    assert.equal(server.closed(), 1, "the connection is closed after a check that fails");
    await stopped(server.server);
  }
  for (const info of [piperInfo(["en_GB-alan-low"]), { tts: [{ name: "piper" }] }, { tts: [{ name: "piper", voices: "en_GB-alan-medium" }] }, { tts: [{ name: "piper", voices: ["en_GB-alan-medium"] }] }]) {
    const server = await standIn(describes(info));
    await assert.rejects(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port }).check(new AbortController().signal), { message: "Piper has no voice called en_GB-alan-medium" }, JSON.stringify(info));
    await until(() => server.closed() === 1);
    assert.equal(server.closed(), 1, "the connection is closed after a check that fails");
    await stopped(server.server);
  }
});

test("the check gives up after its own time, and passes on a refusal, a closed port and the caller calling it off", { timeout: 10_000 }, async () => {
  const silent = await standIn(() => {});
  await assert.rejects(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: silent.port, checkMs: 150 }).check(new AbortController().signal), { message: "Piper didn't answer within 0.15 seconds" });
  const stop = new AbortController();
  const why = new Error("Ctrl+C");
  const checking = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: silent.port }).check(stop.signal);
  await pause(20);
  stop.abort(why);
  await assert.rejects(checking, (error: unknown) => error === why);
  const refuses = await standIn((event, socket) => {
    if (event.type === "describe") socket.end(encodeEvent({ type: "error", data: { text: "busy" }, payload: null }));
  });
  await assert.rejects(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: refuses.port }).check(new AbortController().signal), { message: "The Wyoming server refused: busy" });
  const port = refuses.port;
  await stopped(silent.server);
  await stopped(refuses.server);
  await assert.rejects(createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port }).check(new AbortController().signal), { message: `Couldn't reach the Wyoming server at 127.0.0.1:${port} (ECONNREFUSED)` });
});

test("said through a player, Piper's sound plays at its voice's rate", { timeout: 10_000 }, async () => {
  const server = await standIn(speaks(() => [audio(0, 10), audio(3, 4)]));
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
  const opened: { device: string; rate: number }[] = [];
  const written: number[][] = [];
  await say(engine, "Hello.", "plughw:2,0", (options) => {
    opened.push(options);
    return { write: async (sound) => void written.push([...sound]), finish: async () => {}, stop: () => {} };
  }, new AbortController().signal);
  assert.deepEqual(opened, [{ device: "plughw:2,0", rate: 22050 }]);
  assert.deepEqual(written, [[...audio(0, 10), ...audio(3, 4)]]);
  await stopped(server.server);
});

test("end to end: a pretend amixer and aplay on the path and a stand-in Piper get the level, the check, the start-up sentence in the voice from the settings, and play it at 22,050 Hz", { timeout: 20_000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), "jarvis-piper-"));
  folders.push(folder);
  const bin = join(folder, "bin");
  await mkdir(bin);
  const mixerLog = join(folder, "amixer.log");
  const playerLog = join(folder, "aplay.log");
  const played = join(folder, "aplay.raw");
  await writeFile(join(bin, "amixer"), `#!/bin/sh\necho "$@" > ${JSON.stringify(mixerLog)}\n`);
  await writeFile(join(bin, "aplay"), `#!/bin/sh\necho "$@" > ${JSON.stringify(playerLog)}\ntimeout 5 cat > ${JSON.stringify(played)}\n`);
  await chmod(join(bin, "amixer"), 0o755);
  await chmod(join(bin, "aplay"), 0o755);
  const server = await standIn(async (event, socket) => {
    if (event.type === "describe") await describes(piperInfo(["en_GB-alan-medium"]))(event, socket);
    if (event.type === "synthesize") speaks(() => [audio(0, 3000), audio(1, 1000)])(event, socket);
  });
  const engine = createPiper({ voice: "en_GB-alan-medium", host: "127.0.0.1", port: server.port });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path ?? ""}`;
  let line: string;
  try {
    const voice = await startVoice({ engine, voice: "en_GB-alan-medium", volume: 65, findCard: async () => ({ number: 2, device: "plughw:2,0", speakers: "pcmC2D0p", mixer: "controlC2" }), setVolume: (card, volume) => setVolume(card, volume), startPlayer: (options) => startPlayer(options), signal: new AbortController().signal });
    line = voice.line;
  } finally {
    process.env.PATH = path;
  }
  assert.equal(line, "Voice: Piper, voice en_GB-alan-medium, on sound card 2 (Master set to 65%)");
  assert.equal(await readFile(mixerLog, "utf8"), "-q -c 2 sset Master 65% unmute\n");
  assert.equal(await readFile(playerLog, "utf8"), "-q -t raw -f S16_LE -c 1 -r 22050 -D plughw:2,0\n");
  assert.deepEqual([...(await readFile(played))], [...audio(0, 3000), ...audio(1, 1000)]);
  assert.deepEqual(server.heard, [[{ type: "describe", data: {}, payload: null }], [{ type: "synthesize", data: { text: readySentence, voice: { name: "en_GB-alan-medium" } }, payload: null }]]);
  await stopped(server.server);
});
