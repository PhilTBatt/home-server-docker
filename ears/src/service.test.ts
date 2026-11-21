import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { movedOn } from "./ears.js";
import { wakeOffError } from "./server.js";
import { pretendMic, startService, type Service } from "./service.js";
import { createEventReader, encodeEvent } from "./wyoming.js";
import { connectWyoming } from "./wyoming-client.js";

const token = "t".repeat(64);
const folders: string[] = [];
const services: Service[] = [];
after(async () => {
  for (const service of services) await service.close();
  for (const folder of folders) await rm(folder, { recursive: true, force: true });
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function recorders(): number[] {
  const found: number[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const parent = Number(readFileSync(`/proc/${name}/stat`, "utf8").replace(/^.*\) /s, "").split(" ")[1]);
      if (parent === process.pid && readFileSync(`/proc/${name}/cmdline`, "utf8").includes("pretend-mic-run.js")) found.push(Number(name));
    } catch {}
  }
  return found;
}

async function until(done: () => boolean, ms = 3000): Promise<number> {
  const began = performance.now();
  while (!done() && performance.now() - began < ms) await pause(5);
  return performance.now() - began;
}

async function setUp(atStart: string | null, limitMs?: number) {
  const folder = await mkdtemp(join(tmpdir(), "ears-"));
  folders.push(folder);
  const switchAt = join(folder, "mute");
  if (atStart !== null) await writeFile(switchAt, atStart);
  const lines: string[] = [];
  const start = async () => {
    const started = await startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, log: (line) => lines.push(line), switchAt, everyMs: 20, port: 0, host: "127.0.0.1", limitMs });
    services.push(started);
    return started;
  };
  const service = await start();
  const call = async (method: string, path: string, which = service) => (await fetch(`http://127.0.0.1:${(which.server.address() as AddressInfo).port}${path}`, { method, headers: { authorization: `Bearer ${token}` } })).json();
  return { service, call, flip: (text: string) => writeFile(switchAt, text), remove: () => rm(switchAt), lines, start };
}

test("the pretend microphone is a process of its own, run by this Node", () => {
  assert.equal(pretendMic.command, process.execPath);
  assert.match(pretendMic.args[0], /pretend-mic-run\.js$/);
});

test("it starts muted even when the file already says unmuted, and a new unmute is what counts", { timeout: 15_000 }, async () => {
  const { service, call, flip } = await setUp("unmuted 5\n");
  await pause(100);
  assert.equal((await call("GET", "/state")).state, "muted");
  assert.equal((await call("POST", "/recording/start")).error, "ears is muted");
  await flip("unmuted 6\n");
  await until(() => service.ears.view().state === "idle");
  assert.equal((await call("GET", "/state")).state, "idle");
  await service.close();
});

test("muting through the file ends the recording process: it's gone within a poll and the time it takes to exit", { timeout: 15_000 }, async () => {
  const { service, call, flip, lines } = await setUp("muted\n");
  await flip("unmuted 100\n");
  await until(() => service.ears.view().state === "idle");
  assert.equal((await call("POST", "/recording/start")).state, "recording");
  await until(() => recorders().length === 1);
  const [pid] = recorders();
  assert.ok(pid > 0);
  await pause(300);
  await flip("muted\n");
  const took = await until(() => recorders().length === 0);
  assert.deepEqual(recorders(), []);
  assert.ok(took < 1000, `the recorder was gone ${took} ms after the mute`);
  await until(() => service.ears.view().last !== null);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "once ears has logged the stop, the process is gone for good, not just stopped");
  assert.deepEqual([service.ears.view().state, service.ears.view().last?.reason], ["muted", "muted"]);
  assert.deepEqual(lines.slice(0, 3), ["Unmuted.", "Recording started.", "Muted."]);
  assert.match(lines[3], /^Recording stopped after 0\.\d seconds: muted\.$/);
  await service.close();
});

test("a mute and an unmute between two looks at the switch still end the recording", { timeout: 15_000 }, async () => {
  const { service, call, flip } = await setUp(null);
  await flip("unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  await call("POST", "/recording/start");
  await until(() => recorders().length === 1);
  await flip("muted\n");
  await flip("unmuted 2\n");
  const took = await until(() => recorders().length === 0);
  assert.deepEqual(recorders(), []);
  assert.ok(took < 1000, `${took} ms`);
  await until(() => service.ears.view().last !== null);
  await until(() => service.ears.view().state === "idle");
  assert.equal(service.ears.view().state, "idle", "ears ends up unmuted, whether it saw the mute or only the new unmute");
  await service.close();
});

test("a switch file that disappears mutes too, and ends the recording", { timeout: 15_000 }, async () => {
  const { service, call, flip, remove } = await setUp(null);
  await flip("unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  await call("POST", "/recording/start");
  await until(() => recorders().length === 1);
  await remove();
  await until(() => recorders().length === 0);
  assert.deepEqual(recorders(), []);
  assert.equal(service.ears.view().state, "muted");
  await service.close();
});

test("asked to stop, the recording process is gone before the answer comes", { timeout: 15_000 }, async () => {
  const { service, call, flip } = await setUp(null);
  await flip("unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  await call("POST", "/recording/start");
  await until(() => recorders().length === 1);
  await pause(250);
  const stopped = await call("POST", "/recording/stop");
  assert.deepEqual(recorders(), []);
  assert.equal(stopped.state, "idle");
  assert.ok(stopped.seconds >= 0.2 && stopped.seconds < 2, String(stopped.seconds));
  await service.close();
});

test("a recording left running is ended at the time limit, process and all", { timeout: 15_000 }, async () => {
  const { service, call, flip, lines } = await setUp(null, 400);
  await flip("unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  await call("POST", "/recording/start");
  await until(() => recorders().length === 1);
  const took = await until(() => recorders().length === 0 && service.ears.view().state === "idle");
  assert.ok(took < 2000, `${took} ms`);
  assert.equal(service.ears.view().last?.reason, "it reached the 0.4-second limit");
  assert.match(lines.at(-1) ?? "", /^Recording stopped after 0\.\d seconds: it reached the 0\.4-second limit\.$/);
  await service.close();
});

test("shutting down ends any recording and its process, and a restart with the same file comes back muted", { timeout: 15_000 }, async () => {
  const { service, call, flip, lines, start } = await setUp(null);
  await flip("unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  await call("POST", "/recording/start");
  await until(() => recorders().length === 1);
  await service.close();
  assert.deepEqual(recorders(), []);
  assert.equal(lines.includes("Muted: ears is shutting down."), true);
  await flip("unmuted 99\n");
  await pause(100);
  assert.equal(service.ears.view().state, "muted", "once it's shut down, it stops reading the switch");
  const again = await start();
  await pause(100);
  assert.equal(again.ears.view().state, "muted");
  assert.equal((await call("POST", "/recording/start", again)).error, "ears is muted");
  await flip("unmuted 2\n");
  await until(() => again.ears.view().state === "idle");
  assert.equal(again.ears.view().state, "idle");
  await again.close();
  await again.close();
});

test("a restarted ears numbers its recordings after the ones it made before, so a chat still holding an old number can't stop or cancel a new one", { timeout: 15_000 }, async () => {
  const { service, call, flip, start } = await setUp(null);
  await flip("unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  const old = (await call("POST", "/recording/start")).id;
  await call("POST", "/recording/stop");
  await service.close();
  const before = Date.now();
  const again = await start();
  await flip("unmuted 2\n");
  await until(() => again.ears.view().state === "idle");
  const started = await call("POST", "/recording/start", again);
  try {
    assert.ok(Number.isInteger(old) && started.id > old, `${started.id} after ${old}`);
    assert.ok(started.id > before, "numbered from the clock, not from how long this ears has run");
    const stale = [await call("POST", `/recording/stop?id=${old}`, again), await call("POST", `/recording/cancel?id=${old}`, again)];
    assert.deepEqual(stale.map((answer) => answer.error), [movedOn, movedOn]);
    assert.deepEqual([again.ears.view().state, again.ears.current()?.id], ["recording", started.id]);
  } finally {
    await again.close();
  }
});

test("if the port is taken, starting fails and leaves nothing running", { timeout: 15_000 }, async () => {
  const taken = createServer();
  await new Promise<void>((resolve) => taken.listen(0, "127.0.0.1", resolve));
  const port = (taken.address() as AddressInfo).port;
  await assert.rejects(startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, log: () => {}, switchAt: "/no/such/switch", everyMs: 20, port, host: "127.0.0.1" }), { code: "EADDRINUSE" });
  await new Promise((resolve) => taken.close(resolve));
});

const quietSwitch = async () => {
  const folder = await mkdtemp(join(tmpdir(), "ears-"));
  folders.push(folder);
  return join(folder, "mute");
};

test("each microphone setting says what ears records from: nothing, the pretend one, or the card passed in, at the level set", { timeout: 15_000 }, async () => {
  const switchAt = await quietSwitch();
  const base = { log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1" };
  const none = await startService({ ...base, config: { token, microphone: null, micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 } });
  services.push(none);
  assert.equal(none.microphone, "no microphone set");
  const pretend = await startService({ ...base, config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 } });
  services.push(pretend);
  assert.equal(pretend.microphone, "the pretend microphone");
  const levels: [number, string, number][] = [];
  const card = await startService({ ...base, config: { token, microphone: "card", micLevel: 65, micControl: "Mic", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, findCard: async () => ({ number: 2, device: "plughw:2,0", capture: "pcmC2D0c", mixer: "controlC2" }), setLevel: async (number, control, level) => void levels.push([number, control, level]) });
  services.push(card);
  assert.equal(card.microphone, "sound card 2's microphone (Mic set to 65%)");
  assert.deepEqual(levels, [[2, "Mic", 65]]);
  const kept = await startService({ ...base, config: { token, microphone: "card", micLevel: "keep", micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, findCard: async () => ({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), setLevel: async () => assert.fail("the level was set") });
  services.push(kept);
  assert.equal(kept.microphone, "sound card 1's microphone (at its own level)");
  const boosts: [number, string, number][] = [];
  const boosted = await startService({ ...base, config: { token, microphone: "card", micLevel: 100, micControl: "Capture", micBoost: 1, micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, findCard: async () => ({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), setLevel: async () => {}, setBoost: async (number, control, steps) => void boosts.push([number, control, steps]) });
  services.push(boosted);
  assert.equal(boosted.microphone, "sound card 1's microphone (Capture set to 100%, Internal Mic Boost set to 1)");
  assert.deepEqual(boosts, [[1, "Internal Mic Boost", 1]]);
});

test("with the card microphone, the card is found and its level set before anything listens, and either failing stops ears starting", { timeout: 15_000 }, async () => {
  const switchAt = await quietSwitch();
  const base = { log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", config: { token, microphone: "card" as const, micLevel: 80, micControl: "Capture", micBoost: "keep" as const, micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness" as const, wakePauseMs: 1500 } };
  await assert.rejects(startService({ ...base, findCard: async () => Promise.reject(new Error("No sound devices were passed in")) }), { message: "No sound devices were passed in" });
  await assert.rejects(startService({ ...base, findCard: async () => ({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), setLevel: async () => Promise.reject(new Error("Couldn't set Capture on sound card 1")) }), { message: "Couldn't set Capture on sound card 1" });
  await assert.rejects(startService({ ...base, config: { ...base.config, micBoost: 2 }, findCard: async () => ({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), setLevel: async () => {}, setBoost: async () => Promise.reject(new Error("Couldn't set Internal Mic Boost on sound card 1")) }), { message: "Couldn't set Internal Mic Boost on sound card 1" });
});

test("with the card microphone and nothing pretend given, ears records with arecord on that card", { timeout: 15_000 }, async () => {
  const switchAt = await quietSwitch();
  await writeFile(switchAt, "muted");
  const folder = await mkdtemp(join(tmpdir(), "ears-bin-"));
  folders.push(folder);
  const argsFile = join(folder, "args");
  await writeFile(join(folder, "arecord"), `#!/bin/sh\nprintf '%s\\n' "$@" > ${argsFile}\nexec sleep 30\n`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${folder}:${path}`;
  try {
    const service = await startService({ config: { token, microphone: "card", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", findCard: async () => ({ number: 3, device: "plughw:3,0", capture: "pcmC3D0c", mixer: "controlC3" }), setLevel: async () => {} });
    services.push(service);
    await writeFile(switchAt, "unmuted 1");
    await until(() => service.ears.view().state === "idle");
    assert.equal(service.ears.start().ok, true);
    await until(() => {
      try {
        return readFileSync(argsFile, "utf8").length > 0;
      } catch {
        return false;
      }
    });
    assert.deepEqual(readFileSync(argsFile, "utf8").trim().split("\n"), ["-q", "-D", "plughw:3,0", "-t", "raw", "-f", "S16_LE", "-r", "16000", "-c", "1"]);
    await service.ears.stop();
  } finally {
    process.env.PATH = path;
  }
});

test("with Whisper given, a stopped recording's sound is turned into text, and the answer to the stop has it", { timeout: 15_000 }, async () => {
  const switchAt = await quietSwitch();
  await writeFile(switchAt, "muted");
  const heard: number[] = [];
  const service = await startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", toText: async (sound) => (heard.push(sound.length), "Hello there.") });
  services.push(service);
  await writeFile(switchAt, "unmuted 2");
  await until(() => service.ears.view().state === "idle");
  service.ears.start();
  await pause(250);
  const answer = await (await fetch(`http://127.0.0.1:${(service.server.address() as AddressInfo).port}/recording/stop`, { method: "POST", headers: { authorization: `Bearer ${token}` } })).json();
  assert.equal(answer.state, "idle");
  assert.equal(answer.last.text, "Hello there.");
  assert.ok(heard[0] > 3000, String(heard[0]));
});

async function standInWakeServer() {
  const heard: { types: string[]; names: unknown[]; bytes: number; since: number; sockets: Socket[] } = { types: [], names: [], bytes: 0, since: 0, sockets: [] };
  const server = createServer((socket) => {
    heard.sockets.push(socket);
    const reader = createEventReader();
    socket.on("error", () => {});
    socket.on("data", (bytes: Buffer) => {
      for (const event of reader.push(bytes)) {
        heard.types.push(event.type);
        if (event.type === "detect") heard.names.push(event.data.names);
        if (event.type === "audio-start") heard.since = 0;
        if (event.type === "audio-chunk") {
          heard.bytes += event.payload?.length ?? 0;
          heard.since += event.payload?.length ?? 0;
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    heard,
    connect: (signal: AbortSignal) => connectWyoming({ host: "127.0.0.1", port, signal }),
    fire() {
      for (const socket of heard.sockets) if (!socket.destroyed) socket.write(encodeEvent({ type: "detection", data: { name: "hey_jarvis", timestamp: Math.floor(heard.since / 32) }, payload: null }));
    },
    async close() {
      for (const socket of heard.sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("with the wake word on, a waiting chat opens the microphone and sends it to the wake-word server, and a detection becomes a recording the chat can claim and get the text of", { timeout: 20_000 }, async (t) => {
  const stand = await standInWakeServer();
  t.after(() => stand.close());
  const switchAt = await quietSwitch();
  const lines: string[] = [];
  const turned: number[] = [];
  const service = await startService({
    config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "loudness", wakePauseMs: 1500 },
    log: (line) => lines.push(line),
    switchAt,
    everyMs: 20,
    port: 0,
    host: "127.0.0.1",
    toText: async (sound) => (turned.push(sound.length), "What's the time?"),
    wake: { connect: stand.connect, startWithinMs: 400, settleMs: 0, presenceMs: 200 },
  });
  services.push(service);
  const base = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string) => (await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` } })).json();
  const first = await call("GET", "/wait");
  assert.deepEqual([first.state, first.wake, first.lastId, first.current, typeof first.run, typeof first.version], ["muted", { on: true, listening: false, held: false, problem: null }, null, null, "string", "number"]);
  assert.match(first.run, /^[0-9a-f]{16}$/);
  const began = performance.now();
  const elsewhere = await call("GET", "/wait?after=1000000&run=0123456789abcdef");
  assert.ok(performance.now() - began < 1000 && elsewhere.run === first.run, "a chat that knew another start of ears is answered at once, with this one's id");
  assert.deepEqual(recorders(), [], "muted, so nothing is open even with a chat waiting");
  await writeFile(switchAt, "unmuted 1\n");
  const unmuted = await call("GET", `/wait?after=${first.version}&run=${first.run}`);
  assert.equal(unmuted.state, "idle");
  await call("POST", "/wake/hold?by=aa");
  await call("POST", "/wake/hold?by=bb");
  assert.equal((await call("POST", "/wake/release?by=aa")).wake.held, true, "each chat's hold is its own");
  assert.equal((await call("POST", "/wake/release?by=bb")).wake.held, false);
  const keepWaiting = (async () => {
    for (let round = 0; round < 40; round++) await call("GET", `/wait?after=1000000&run=${first.run}`);
  })();
  await until(() => stand.heard.bytes > 6400, 5000);
  assert.equal(recorders().length, 1);
  assert.deepEqual(stand.heard.names, [["hey_jarvis"]]);
  assert.deepEqual(stand.heard.types.slice(0, 3), ["detect", "audio-start", "audio-chunk"]);
  assert.equal(service.wake.full().wake && (service.wake.full().wake as { listening: boolean }).listening, true);
  stand.fire();
  await until(() => service.ears.current() !== null);
  const id = service.ears.current()?.id ?? 0;
  assert.deepEqual(service.ears.current(), { id, by: "wake", claimed: false });
  const claimed = await call("POST", `/wake/claim?id=${id}`);
  assert.deepEqual([claimed.state, claimed.current], ["recording", { id, by: "wake", claimed: true }]);
  await until(() => service.ears.view().state === "idle", 5000);
  const quiet = await call("GET", "/wait?after=0");
  assert.deepEqual([quiet.state, quiet.lastId, quiet.current, quiet.last.reason, quiet.last.text, quiet.last.pauseMs], ["idle", id, null, "nothing loud enough to be speech came within 0.4 seconds, so it wasn't sent to Whisper", null, 1500]);
  assert.deepEqual(turned, [], "the pretend microphone's steady tone is never speech, so nothing went to Whisper");
  await pause(800);
  stand.fire();
  await until(() => service.ears.current()?.id === id + 1);
  assert.equal((await call("POST", `/wake/claim?id=${id + 1}`)).current.claimed, true);
  await pause(200);
  const stopped = await call("POST", "/recording/stop");
  assert.deepEqual([stopped.state, stopped.last.text, stopped.last.reason], ["idle", "What's the time?", "asked to stop"]);
  assert.ok(turned[0] >= 16_000 + 6_400, "the half second before the detection is kept");
  assert.ok(lines.includes("Heard the wake word. The room's background is 707, so speech is anything above 2121."), lines.join("\n"));
  assert.equal(lines.some((line) => line.includes("What's the time")), false);
  await writeFile(switchAt, "muted\n");
  await until(() => recorders().length === 0);
  await service.close();
  await keepWaiting.catch(() => {});
});

test("with EARS_WAKE_END=silero, a wake-word recording is judged by the speech detector loaded at start, which ends it and says so", { timeout: 20_000 }, async (t) => {
  const stand = await standInWakeServer();
  t.after(() => stand.close());
  const switchAt = await quietSwitch();
  const turned: number[] = [];
  let judged = 0;
  const service = await startService({
    config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "silero", wakePauseMs: 1500 },
    log: () => {},
    switchAt,
    everyMs: 20,
    port: 0,
    host: "127.0.0.1",
    toText: async (sound) => (turned.push(sound.length), "What's the time?"),
    wake: { connect: stand.connect, startWithinMs: 400, settleMs: 0, presenceMs: 200 },
    loadSilero: async () => async (_input, state) => (judged++, { probability: 0, state }),
  });
  services.push(service);
  const base = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string) => (await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` } })).json();
  const first = await call("GET", "/wait");
  await writeFile(switchAt, "unmuted 1\n");
  await call("GET", `/wait?after=${first.version}&run=${first.run}`);
  const keepWaiting = (async () => {
    for (let round = 0; round < 40; round++) await call("GET", `/wait?after=1000000&run=${first.run}`);
  })();
  await until(() => stand.heard.bytes > 6400, 5000);
  stand.fire();
  await until(() => service.ears.current() !== null);
  const id = service.ears.current()?.id ?? 0;
  await call("POST", `/wake/claim?id=${id}`);
  await until(() => service.ears.view().state === "idle", 5000);
  const ended = await call("GET", "/wait?after=0");
  assert.deepEqual([ended.lastId, ended.last.reason, ended.last.ender], [id, "the speech detector heard no speech within 0.4 seconds, so it wasn't sent to Whisper", "silero"]);
  assert.ok(judged > 0, "the detector it loaded judged the recording");
  assert.deepEqual(turned, []);
  await writeFile(switchAt, "muted\n");
  await until(() => recorders().length === 0);
  await service.close();
  await keepWaiting.catch(() => {});
});

test("with the wake word on, a chat can ask for a follow-up: refused while a chat holds the wake word, and otherwise a recording it has already taken, dropped unheard if no speech comes in time", { timeout: 20_000 }, async (t) => {
  const stand = await standInWakeServer();
  t.after(() => stand.close());
  const switchAt = await quietSwitch();
  const lines: string[] = [];
  const turned: number[] = [];
  const service = await startService({
    config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "loudness", wakePauseMs: 900 },
    log: (line) => lines.push(line),
    switchAt,
    everyMs: 20,
    port: 0,
    host: "127.0.0.1",
    toText: async (sound) => (turned.push(sound.length), "And tomorrow?"),
    wake: { connect: stand.connect, settleMs: 0, presenceMs: 200 },
  });
  services.push(service);
  const base = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string) => {
    const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  await writeFile(switchAt, "unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  const keepWaiting = (async () => {
    for (let round = 0; round < 40; round++) await call("GET", "/wait?after=1000000");
  })();
  await until(() => stand.heard.bytes > 6400, 5000);
  await call("POST", "/wake/hold?by=aa");
  const refused = await call("POST", "/wake/follow?within=1000");
  assert.deepEqual([refused.status, refused.body.error, service.ears.view().state], [409, "a Jarvis chat is still speaking, so ears can't listen for a follow-up yet", "idle"]);
  await call("POST", "/wake/release?by=aa");
  await pause(800);
  const began = performance.now();
  const started = await call("POST", "/wake/follow?within=1000");
  const id = started.body.id;
  assert.deepEqual([started.status, started.body.state, service.ears.current(), recorders().length], [200, "recording", { id, by: "follow", claimed: true }, 1]);
  assert.equal(lines.at(-1), "Recording started to hear a follow-up.");
  assert.ok((await until(() => service.ears.view().state === "idle", 5000)) < 5000);
  assert.ok(performance.now() - began >= 950, "it waits the second asked for, though no chat claims it");
  const quiet = await call("GET", "/wait?after=0");
  assert.deepEqual([quiet.body.lastId, quiet.body.last.reason, quiet.body.last.text, quiet.body.last.textProblem, quiet.body.last.ender, quiet.body.last.pauseMs, turned], [id, "nothing loud enough to be speech came within 1 second, so it wasn't sent to Whisper", null, null, "loudness", 900, []], "the pause comes from EARS_WAKE_PAUSE's setting");
  await writeFile(switchAt, "muted\n");
  await until(() => recorders().length === 0);
  await service.close();
  await keepWaiting.catch(() => {});
});

test("with no chat waiting, the microphone closes a moment later, and with the wake word off nothing opens and holds are refused", { timeout: 20_000 }, async (t) => {
  const stand = await standInWakeServer();
  t.after(() => stand.close());
  const switchAt = await quietSwitch();
  const service = await startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "loudness", wakePauseMs: 1500 }, log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", wake: { connect: stand.connect, presenceMs: 150, waitMs: 50 } });
  services.push(service);
  const base = `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string) => (await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` } })).json();
  await writeFile(switchAt, "unmuted 1\n");
  await until(() => service.ears.view().state === "idle");
  await call("GET", "/wait?after=1000");
  await until(() => recorders().length === 1);
  await until(() => recorders().length === 0, 2000);
  await service.close();
  const off = await startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "loudness", wakePauseMs: 1500 }, log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", wake: { waitMs: 50 } });
  services.push(off);
  const offBase = `http://127.0.0.1:${(off.server.address() as AddressInfo).port}`;
  await writeFile(switchAt, "unmuted 2\n");
  await until(() => off.ears.view().state === "idle");
  const view = await (await fetch(`${offBase}/wait?after=100`, { headers: { authorization: `Bearer ${token}` } })).json();
  assert.deepEqual(view.wake, { on: false, listening: false, held: false, problem: null });
  assert.equal((await fetch(`${offBase}/wake/hold?by=aa`, { method: "POST", headers: { authorization: `Bearer ${token}` } })).status, 409);
  const follow = await fetch(`${offBase}/wake/follow?within=5000`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual([follow.status, (await follow.json()).error, off.ears.view().state], [409, wakeOffError, "idle"]);
  assert.deepEqual(recorders(), []);
  await off.close();
});

test("with the wake word on and EARS_WAKE_END=silero, the speech detector is loaded once at start, and one that won't load stops ears, saying how to go back", { timeout: 20_000 }, async () => {
  const switchAt = await quietSwitch();
  const base = { log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", wake: { waitMs: 50 } };
  let loads = 0;
  const loaded = await startService({ ...base, config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "silero", wakePauseMs: 1500 }, loadSilero: async () => (loads++, async (_input, state) => ({ probability: 0, state })) });
  services.push(loaded);
  assert.equal(loads, 1);
  for (const config of [
    { token, microphone: "pretend" as const, micLevel: 80, micControl: "Capture", micBoost: "keep" as const, micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "loudness" as const, wakePauseMs: 1500 },
    { token, microphone: "pretend" as const, micLevel: 80, micControl: "Capture", micBoost: "keep" as const, micBoostControl: "Internal Mic Boost", wake: false, wakeEnd: "silero" as const, wakePauseMs: 1500 },
  ]) {
    const service = await startService({ ...base, config, loadSilero: async () => assert.fail("it loaded the detector") });
    services.push(service);
  }
  await assert.rejects(startService({ ...base, config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost", wake: true, wakeEnd: "silero", wakePauseMs: 1500 }, loadSilero: async () => Promise.reject(new Error("no such file")) }), {
    message: "the speech detector couldn't load: no such file. Set EARS_WAKE_END=loudness to go back to the loudness check",
  });
});
