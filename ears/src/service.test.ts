import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pretendMic, startService, type Service } from "./service.js";

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
    const started = await startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture" }, log: (line) => lines.push(line), switchAt, everyMs: 20, port: 0, host: "127.0.0.1", limitMs });
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
  assert.equal(service.ears.view().state, "idle");
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

test("if the port is taken, starting fails and leaves nothing running", { timeout: 15_000 }, async () => {
  const taken = createServer();
  await new Promise<void>((resolve) => taken.listen(0, "127.0.0.1", resolve));
  const port = (taken.address() as AddressInfo).port;
  await assert.rejects(startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture" }, log: () => {}, switchAt: "/no/such/switch", everyMs: 20, port, host: "127.0.0.1" }), { code: "EADDRINUSE" });
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
  const none = await startService({ ...base, config: { token, microphone: null, micLevel: 80, micControl: "Capture" } });
  services.push(none);
  assert.equal(none.microphone, "no microphone set");
  const pretend = await startService({ ...base, config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture" } });
  services.push(pretend);
  assert.equal(pretend.microphone, "the pretend microphone");
  const levels: [number, string, number][] = [];
  const card = await startService({ ...base, config: { token, microphone: "card", micLevel: 65, micControl: "Mic" }, findCard: async () => ({ number: 2, device: "plughw:2,0", capture: "pcmC2D0c", mixer: "controlC2" }), setLevel: async (number, control, level) => void levels.push([number, control, level]) });
  services.push(card);
  assert.equal(card.microphone, "sound card 2's microphone (Mic set to 65%)");
  assert.deepEqual(levels, [[2, "Mic", 65]]);
  const kept = await startService({ ...base, config: { token, microphone: "card", micLevel: "keep", micControl: "Capture" }, findCard: async () => ({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), setLevel: async () => assert.fail("the level was set") });
  services.push(kept);
  assert.equal(kept.microphone, "sound card 1's microphone (at its own level)");
});

test("with the card microphone, the card is found and its level set before anything listens, and either failing stops ears starting", { timeout: 15_000 }, async () => {
  const switchAt = await quietSwitch();
  const base = { log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", config: { token, microphone: "card" as const, micLevel: 80, micControl: "Capture" } };
  await assert.rejects(startService({ ...base, findCard: async () => Promise.reject(new Error("No sound devices were passed in")) }), { message: "No sound devices were passed in" });
  await assert.rejects(startService({ ...base, findCard: async () => ({ number: 1, device: "plughw:1,0", capture: "pcmC1D0c", mixer: "controlC1" }), setLevel: async () => Promise.reject(new Error("Couldn't set Capture on sound card 1")) }), { message: "Couldn't set Capture on sound card 1" });
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
    const service = await startService({ config: { token, microphone: "card", micLevel: 80, micControl: "Capture" }, log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", findCard: async () => ({ number: 3, device: "plughw:3,0", capture: "pcmC3D0c", mixer: "controlC3" }), setLevel: async () => {} });
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
  const service = await startService({ config: { token, microphone: "pretend", micLevel: 80, micControl: "Capture" }, log: () => {}, switchAt, everyMs: 20, port: 0, host: "127.0.0.1", toText: async (sound) => (heard.push(sound.length), "Hello there.") });
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
