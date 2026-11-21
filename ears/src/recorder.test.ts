import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bytesPerSecond, killAfterMs, recordingLimitMs, recordingRate, startRecording } from "./recorder.js";

const pretend = { command: process.execPath, args: [join(fileURLToPath(new URL(".", import.meta.url)), "pretend-mic-run.js")] };
const node = (code: string) => ({ command: process.execPath, args: ["-e", code] });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("a recording is 16-bit mono at 16,000 Hz, for at most 30 seconds, and a stuck recorder gets 1 second before it's killed", () => {
  assert.deepEqual([recordingRate, bytesPerSecond, recordingLimitMs, killAfterMs], [16_000, 32_000, 30_000, 1_000]);
});

test("stopping a recording ends its process, and says why, how long it ran and how much sound came", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: pretend });
  await pause(600);
  assert.equal(alive(recording.pid), true);
  const stopped = await recording.stop("asked to stop");
  assert.equal(alive(recording.pid), false);
  assert.equal(stopped.reason, "asked to stop");
  assert.equal(stopped.failed, false);
  assert.ok(stopped.ms >= 600 && stopped.ms < 2000, `${stopped.ms} ms`);
  assert.ok(stopped.bytes >= 10_000 && stopped.bytes <= 32_000, `${stopped.bytes} bytes in about 0.6 s`);
  assert.equal(stopped.bytes % 2, 0);
  assert.equal(await recording.ended, stopped);
});

test("stopping twice keeps the first reason and ends once", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: pretend });
  const first = recording.stop("muted");
  const second = recording.stop("asked to stop");
  assert.equal(await first, await second);
  assert.equal((await first).reason, "muted");
  assert.equal((await recording.stop("again")).reason, "muted");
});

test("a recording that reaches its time limit is stopped, and its process with it", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: pretend, limitMs: 300 });
  const stopped = await recording.ended;
  assert.equal(alive(recording.pid), false);
  assert.deepEqual([stopped.reason, stopped.failed], ["it reached the 0.3-second limit", false]);
  assert.ok(stopped.ms >= 300 && stopped.ms < 1500, `${stopped.ms} ms`);
  assert.equal(startRecording({ recorder: pretend, limitMs: 30_000 }).stop("x") instanceof Promise, true);
});

test("a recorder sending more sound than the limit allows is stopped", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: node("setInterval(() => process.stdout.write(Buffer.alloc(64000)), 5)"), limitMs: 1000 });
  const stopped = await recording.ended;
  assert.deepEqual([stopped.reason, stopped.failed], ["more sound came than the time limit allows", false]);
  assert.ok(stopped.bytes > 40_000);
  assert.equal(alive(recording.pid), false);
});

test("the sound a recording gets is kept in memory and handed back when it ends, as whole 16-bit samples", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: node("process.stdout.write(Buffer.from([1, 2, 3])); setTimeout(() => process.stdout.write(Buffer.from([4, 5])), 50); setInterval(() => {}, 1000)") });
  await pause(300);
  const stopped = await recording.stop("asked to stop");
  assert.deepEqual([[...stopped.sound], stopped.bytes], [[1, 2, 3, 4], 5]);
});

test("only the sound up to the limit is kept, however much more the recorder sends", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: node("setInterval(() => process.stdout.write(Buffer.alloc(1000, 7)), 5)"), limitMs: 1000, maxBytes: 4500 });
  const stopped = await recording.ended;
  assert.equal(stopped.reason, "more sound came than the time limit allows");
  assert.ok(stopped.bytes > 4500, String(stopped.bytes));
  assert.equal(stopped.sound.length, 4000);
  assert.ok(stopped.sound.every((byte) => byte === 7));
});

test("a recorder that sends nothing hands back no sound", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: node("setInterval(() => {}, 1000)") });
  await pause(200);
  const stopped = await recording.stop("asked to stop");
  assert.deepEqual([stopped.sound.length, stopped.bytes], [0, 0]);
});

test("a recorder that ignores being asked to end is killed a second later", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: node("process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)"), killAfterMs: 300 });
  await pause(300);
  const began = performance.now();
  const stopped = await recording.stop("asked to stop");
  const took = performance.now() - began;
  assert.equal(alive(recording.pid), false);
  assert.ok(took >= 250 && took < 1500, `${took} ms`);
  assert.deepEqual([stopped.reason, stopped.failed], ["asked to stop", false]);
});

test("a recorder that ends by itself counts as failed, with its code and the start of what it said", { timeout: 10_000 }, async () => {
  const stopped = await startRecording({ recorder: node("process.stderr.write('arecord: main:850: audio open error: No such file or directory\\n'); process.exit(1)") }).ended;
  assert.deepEqual([stopped.reason, stopped.failed], ["the recorder ended by itself with code 1: arecord: main:850: audio open error: No such file or directory", true]);
  const quiet = await startRecording({ recorder: node("process.exit(0)") }).ended;
  assert.deepEqual([quiet.reason, quiet.failed], ["the recorder ended by itself with code 0", true]);
  const long = await startRecording({ recorder: node("process.stderr.write('\\u001b[31m' + 'x'.repeat(400)); process.exit(2)") }).ended;
  assert.equal(long.reason.length, "the recorder ended by itself with code 2: ".length + 200);
  assert.equal(long.reason.includes("\u001b"), false);
});

test("a recorder killed from outside counts as failed, naming the signal", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: pretend });
  await pause(200);
  process.kill(recording.pid as number, "SIGKILL");
  const stopped = await recording.ended;
  assert.deepEqual([stopped.reason, stopped.failed], ["the recorder was ended by SIGKILL", true]);
});

test("a recorder that can't start counts as failed, saying why", { timeout: 10_000 }, async () => {
  const recording = startRecording({ recorder: { command: "/no/such/recorder", args: [] } });
  const stopped = await recording.ended;
  assert.equal(stopped.failed, true);
  assert.match(stopped.reason, /^the recorder couldn't start: spawn \/no\/such\/recorder ENOENT$/);
  assert.equal((await recording.stop("asked to stop")).reason, stopped.reason);
});

function anyAlive(pattern: string): number[] {
  const found: number[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      if (readFileSync(`/proc/${name}/cmdline`, "utf8").split("\0").includes(pattern)) found.push(Number(name));
    } catch {}
  }
  return found;
}

const quiet = (marker: string) => `"${process.execPath}" -e "setInterval(() => {}, 1000)" -- ${marker} >/dev/null 2>&1`;

test("a recorder's own children are ended with it, so nothing keeps recording after a stop, even one that never sends ears anything", { timeout: 10_000 }, async () => {
  const marker = `--ears-test-${process.pid}-a`;
  const recording = startRecording({ recorder: { command: "/bin/sh", args: ["-c", `${quiet(marker)} & wait`] }, killAfterMs: 300 });
  await pause(500);
  assert.equal(anyAlive(marker).length, 1);
  const stopped = await recording.stop("asked to stop");
  assert.equal(stopped.reason, "asked to stop");
  await pause(50);
  assert.deepEqual(anyAlive(marker), []);
});

test("a recorder that leaves a child running when it ends is finished anyway, and the child is ended at once", { timeout: 10_000 }, async () => {
  const marker = `--ears-test-${process.pid}-b`;
  const recording = startRecording({ recorder: { command: "/bin/sh", args: ["-c", `${quiet(marker)} & sleep 0.3`] }, killAfterMs: 5_000 });
  const stopped = await recording.ended;
  assert.deepEqual([stopped.reason, stopped.failed], ["the recorder ended by itself with code 0", true]);
  await pause(50);
  assert.deepEqual(anyAlive(marker), []);
});

test("a recorder whose child escapes its group and keeps its output open is given up on a second after it ends", { timeout: 10_000 }, async () => {
  const marker = `--ears-test-${process.pid}-c`;
  const recording = startRecording({ recorder: { command: "/bin/sh", args: ["-c", `setsid "${process.execPath}" "${pretend.args[0]}" ${marker} & sleep 0.3`] }, killAfterMs: 300 });
  await pause(300);
  const began = performance.now();
  const stopped = await recording.ended;
  const took = performance.now() - began;
  assert.deepEqual([stopped.reason, stopped.failed], ["the recorder ended by itself with code 0", true]);
  assert.ok(took < 3000, `${took} ms`);
  for (let tries = 0; tries < 100 && anyAlive(marker).length > 0; tries++) await pause(20);
  assert.deepEqual(anyAlive(marker), [], "with nowhere left to send its sound, it ends too");
});

test("a recorder that ends by itself has failed, even if ears asks it to stop before its output closes", { timeout: 10_000 }, async () => {
  const marker = `--ears-test-${process.pid}-d`;
  const recording = startRecording({ recorder: { command: "/bin/sh", args: ["-c", `setsid "${process.execPath}" -e "setInterval(() => {}, 1000)" -- ${marker} 2>/dev/null & echo "no such card" >&2; sleep 0.2; exit 1`] }, killAfterMs: 1_000 });
  const fallback = setTimeout(() => anyAlive(marker).forEach((pid) => process.kill(pid, "SIGKILL")), 4_000);
  try {
    await pause(500);
    const began = performance.now();
    const stopped = await recording.stop("asked to stop");
    const took = performance.now() - began;
    assert.deepEqual([stopped.reason, stopped.failed], ["the recorder ended by itself with code 1: no such card", true]);
    assert.ok(took < 3000, `${took} ms`);
  } finally {
    clearTimeout(fallback);
    for (const pid of anyAlive(marker)) process.kill(pid, "SIGKILL");
  }
});

test("the recorder is given no settings but PATH, so ears's token isn't passed to it", { timeout: 10_000 }, async () => {
  const before = process.env.EARS_TOKEN;
  process.env.EARS_TOKEN = "a-token-the-recorder-must-not-see";
  try {
    const stopped = await startRecording({ recorder: node("process.stderr.write(Object.keys(process.env).sort().join(',') + ' ' + Object.values(process.env).join(',')); process.exit(3)") }).ended;
    assert.equal(stopped.reason.includes("a-token-the-recorder-must-not-see"), false);
    assert.match(stopped.reason, /^the recorder ended by itself with code 3: PATH /);
  } finally {
    if (before === undefined) delete process.env.EARS_TOKEN;
    else process.env.EARS_TOKEN = before;
  }
});

test("with no limit and nothing kept, a recorder runs until it's stopped and hands each piece on as it comes", { timeout: 10_000 }, async () => {
  const pieces: number[] = [];
  const recording = startRecording({ recorder: pretend, limitMs: null, keep: false, onSound: (sound) => pieces.push(sound.length) });
  await pause(500);
  assert.equal(alive(recording.pid), true);
  assert.ok(pieces.length >= 3, `${pieces.length} pieces`);
  const stopped = await recording.stop("not needed");
  assert.deepEqual([stopped.reason, stopped.failed, stopped.sound.length], ["not needed", false, 0]);
  assert.equal(stopped.bytes, pieces.reduce((sum, size) => sum + size, 0));
  assert.equal(alive(recording.pid), false);
  const after = pieces.length;
  await pause(200);
  assert.equal(pieces.length, after, "nothing more is handed on once it has ended");
});

test("a recorder with no limit never stops for sending a lot", { timeout: 10_000 }, async () => {
  let bytes = 0;
  const recording = startRecording({ recorder: node("setInterval(() => process.stdout.write(Buffer.alloc(64000)), 5)"), limitMs: null, keep: false, onSound: (sound) => (bytes += sound.length) });
  await pause(400);
  const stopped = await recording.stop("asked to stop");
  assert.equal(stopped.reason, "asked to stop");
  assert.ok(bytes > 1_000_000, String(bytes));
});

test("pieces are handed on even when they're also kept", { timeout: 10_000 }, async () => {
  const pieces: number[] = [];
  const recording = startRecording({ recorder: node("process.stdout.write(Buffer.from([1, 2, 3, 4])); setInterval(() => {}, 1000)"), onSound: (sound) => pieces.push(...sound) });
  await pause(300);
  const stopped = await recording.stop("asked to stop");
  assert.deepEqual([[...stopped.sound], pieces], [[1, 2, 3, 4], [1, 2, 3, 4]]);
});
