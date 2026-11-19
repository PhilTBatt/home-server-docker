import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { after, mock, test } from "node:test";
import { killAfterMs, playerArgs, playerCommand, shortError, spawnPlayer, startPlayer, type PlayerExit, type PlayerProcess } from "./player.js";

type Fake = Omit<PlayerProcess, "stderr"> & { stderr: PassThrough; written: Buffer[]; killed: number; kills: string[]; exit(exit: PlayerExit): void; ending: boolean; release(): void };

function fakeProcess(options: { holdWrites?: boolean; deaf?: boolean } = {}): Fake {
  let finish: (exit: PlayerExit) => void = () => {};
  const ended = new Promise<PlayerExit>((resolve) => (finish = resolve));
  let pending: (() => void) | null = null;
  const fake = {
    written: [] as Buffer[],
    killed: 0,
    kills: [] as string[],
    ending: false,
    ended,
    stderr: new PassThrough(),
    stdin: new Writable({
      highWaterMark: options.holdWrites ? 1 : 16_384,
      write(chunk: Buffer, _encoding, callback) {
        fake.written.push(Buffer.from(chunk));
        if (options.holdWrites) pending = callback;
        else callback();
      },
      final(callback) {
        fake.ending = true;
        callback();
      },
    }),
    kill(signal: "SIGTERM" | "SIGKILL") {
      fake.killed++;
      fake.kills.push(signal);
      if (options.deaf !== true || signal === "SIGKILL") finish({ code: null, signal });
    },
    exit(exit: PlayerExit) {
      finish(exit);
    },
    release() {
      const callback = pending;
      pending = null;
      callback?.();
    },
  };
  return fake;
}

function playerOn(fake: Fake, seen: (readonly string[])[] = []) {
  return startPlayer({
    device: "plughw:1,0",
    rate: 24_000,
    spawn: (args) => {
      seen.push(args);
      return fake;
    },
  });
}

const folders: string[] = [];
after(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "jarvis-player-test-"));
  folders.push(folder);
  return folder;
}

function realPlayer(script: string, args: string[] = []) {
  return (playerArgsGiven: readonly string[]) => spawnPlayer(["-e", script, "--", ...args, ...playerArgsGiven], process.execPath);
}

test("the player is aplay, given raw 16-bit little-endian mono at the engine's rate", () => {
  assert.equal(playerCommand, "aplay");
  assert.deepEqual(playerArgs("plughw:1,0", 24_000), ["-q", "-t", "raw", "-f", "S16_LE", "-c", "1", "-r", "24000", "-D", "plughw:1,0"]);
  assert.deepEqual(playerArgs("plughw:0,0", 22_050), ["-q", "-t", "raw", "-f", "S16_LE", "-c", "1", "-r", "22050", "-D", "plughw:0,0"]);
});

test("starting the player starts aplay once, with those arguments", () => {
  const fake = fakeProcess();
  const seen: (readonly string[])[] = [];
  playerOn(fake, seen);
  assert.deepEqual(seen, [playerArgs("plughw:1,0", 24_000)]);
});

test("a bad rate or an empty device is refused before anything starts", () => {
  let started = 0;
  const spawn = () => {
    started++;
    return fakeProcess();
  };
  for (const rate of [1999, 192_001, 24_000.5, Number.NaN]) {
    assert.throws(() => startPlayer({ device: "plughw:1,0", rate, spawn }), { message: `The sound rate must be a whole number of Hz from 2000 to 192000, not ${rate}` });
  }
  assert.throws(() => startPlayer({ device: " ", rate: 24_000, spawn }), { message: "There's no sound device to play on" });
  assert.equal(started, 0);
  startPlayer({ device: "plughw:1,0", rate: 2000, spawn });
  startPlayer({ device: "plughw:1,0", rate: 192_000, spawn });
  assert.equal(started, 2);
});

test("sound written to the player goes to aplay's input, in order", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  await player.write(Uint8Array.of(1, 2));
  await player.write(Uint8Array.of(3, 4, 5, 6));
  assert.deepEqual(Buffer.concat(fake.written), Buffer.from([1, 2, 3, 4, 5, 6]));
});

test("empty sound isn't written at all", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  await player.write(new Uint8Array(0));
  assert.equal(fake.written.length, 0);
});

test("finishing closes aplay's input and waits for it to end", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  await player.write(Uint8Array.of(1, 2));
  let done = false;
  const finished = player.finish().then(() => (done = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fake.ending, true);
  assert.equal(done, false);
  fake.exit({ code: 0, signal: null });
  await finished;
  assert.equal(done, true);
  assert.equal(fake.killed, 0);
});

test("finishing twice gives the same result and closes the input once", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  const first = player.finish();
  const second = player.finish();
  assert.equal(first, second);
  fake.exit({ code: 0, signal: null });
  await first;
});

test("a write while it's waiting for aplay to take sound waits until aplay is ready", async () => {
  const fake = fakeProcess({ holdWrites: true });
  const player = playerOn(fake);
  let done = false;
  const writing = player.write(Uint8Array.of(1, 2, 3, 4)).then(() => (done = true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false);
  fake.release();
  await writing;
  assert.equal(done, true);
});

test("a write waiting on aplay when finishing starts succeeds once aplay has taken it all and ended well", async () => {
  const fake = fakeProcess({ holdWrites: true });
  const player = playerOn(fake);
  const writing = player.write(Uint8Array.of(1, 2, 3, 4));
  await new Promise((resolve) => setImmediate(resolve));
  const finished = player.finish();
  fake.release();
  await new Promise((resolve) => setImmediate(resolve));
  fake.exit({ code: 0, signal: null });
  await writing;
  await finished;
  assert.deepEqual(Buffer.concat(fake.written), Buffer.from([1, 2, 3, 4]));
});

test("a write waiting on aplay when finishing starts still fails if aplay then fails", async () => {
  const fake = fakeProcess({ holdWrites: true });
  const player = playerOn(fake);
  const writing = player.write(Uint8Array.of(1, 2, 3, 4));
  await new Promise((resolve) => setImmediate(resolve));
  const finished = player.finish();
  fake.exit({ code: 1, signal: null });
  await assert.rejects(writing, { message: "aplay stopped with code 1" });
  await assert.rejects(finished, { message: "aplay stopped with code 1" });
});

test("adding sound after finishing has started is refused", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  const finished = player.finish();
  await assert.rejects(player.write(Uint8Array.of(1, 2)), { message: "The player is finishing, so no more sound can be added" });
  fake.exit({ code: 0, signal: null });
  await finished;
});

test("aplay failing makes finishing fail, with what aplay said, kept short and tidy", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.stderr.write("aplay: main:850: audio open error:\n  No such file\u001b[0m or directory\n");
  await new Promise((resolve) => setImmediate(resolve));
  fake.exit({ code: 1, signal: null });
  await assert.rejects(player.finish(), { message: "aplay stopped with code 1: aplay: main:850: audio open error: No such file [0m or directory" });
});

test("aplay failing with nothing said still says how it stopped", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ code: 2, signal: null });
  await assert.rejects(player.finish(), { message: "aplay stopped with code 2" });
});

test("aplay being killed by something else is a failure, naming the signal", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ code: null, signal: "SIGKILL" });
  await assert.rejects(player.finish(), { message: "aplay was stopped by SIGKILL" });
});

test("aplay missing says it isn't installed, and where sound plays from", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ error: Object.assign(new Error("spawn aplay ENOENT"), { code: "ENOENT" }) });
  await assert.rejects(player.finish(), { message: "aplay isn't installed here. Sound plays from Jarvis's own image, which bash host/jarvis.sh sound-test builds" });
});

test("aplay failing to start for another reason says so", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ error: Object.assign(new Error("spawn aplay EACCES"), { code: "EACCES" }) });
  await assert.rejects(player.finish(), { message: "aplay couldn't start: spawn aplay EACCES" });
});

test("writing after aplay has failed is refused with aplay's failure", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.stderr.write("broken");
  await new Promise((resolve) => setImmediate(resolve));
  fake.exit({ code: 1, signal: null });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(player.write(Uint8Array.of(1, 2)), { message: "aplay stopped with code 1: broken" });
});

test("writing after aplay has ended by itself is refused", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ code: 0, signal: null });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(player.write(Uint8Array.of(1, 2)), { message: "aplay has already finished" });
});

test("a write waiting on aplay fails if aplay ends first", async () => {
  const fake = fakeProcess({ holdWrites: true });
  const player = playerOn(fake);
  const writing = player.write(Uint8Array.of(1, 2, 3, 4));
  await new Promise((resolve) => setImmediate(resolve));
  fake.exit({ code: 0, signal: null });
  await assert.rejects(writing, { message: "aplay finished before it took all the sound" });
});

test("stopping kills aplay at once, and finishing then succeeds", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  await player.write(Uint8Array.of(1, 2));
  player.stop();
  assert.equal(fake.killed, 1);
  assert.equal(fake.stdin.destroyed, true);
  await player.finish();
});

test("stopping while finishing still kills aplay, and finishing succeeds", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  const finished = player.finish();
  player.stop();
  assert.equal(fake.killed, 1);
  await finished;
});

test("aplay is asked to stop first, and killed outright only if it hasn't ended a short while later", async () => {
  assert.equal(killAfterMs, 2000);
  const deaf = fakeProcess({ deaf: true });
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: () => deaf, killAfterMs: 30 });
  await player.write(Uint8Array.of(1, 2));
  player.stop();
  assert.deepEqual(deaf.kills, ["SIGTERM"]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(deaf.kills, ["SIGTERM"]);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(deaf.kills, ["SIGTERM", "SIGKILL"]);
  await player.finish();
  const fine = fakeProcess();
  const listening = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: () => fine, killAfterMs: 30 });
  listening.stop();
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(fine.kills, ["SIGTERM"]);
});

test("unless told otherwise, the wait before killing outright is two seconds", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const deaf = fakeProcess({ deaf: true });
    const player = playerOn(deaf);
    player.stop();
    mock.timers.tick(1999);
    assert.deepEqual(deaf.kills, ["SIGTERM"]);
    mock.timers.tick(1);
    assert.deepEqual(deaf.kills, ["SIGTERM", "SIGKILL"]);
  } finally {
    mock.timers.reset();
  }
});

test("stopping twice kills aplay once", () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  player.stop();
  player.stop();
  assert.equal(fake.killed, 1);
});

test("stopping after aplay has ended does nothing", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ code: 0, signal: null });
  await player.finish();
  player.stop();
  assert.equal(fake.killed, 0);
});

test("stopping after aplay has failed doesn't hide the failure", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.exit({ code: 1, signal: null });
  await new Promise((resolve) => setImmediate(resolve));
  player.stop();
  assert.equal(fake.killed, 0);
  await assert.rejects(player.finish(), { message: "aplay stopped with code 1" });
});

test("writing after stopping is quietly dropped", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  player.stop();
  await player.write(Uint8Array.of(1, 2));
  assert.equal(fake.written.length, 0);
});

test("writing well after stopping, once aplay has gone, is still quietly dropped", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  player.stop();
  await new Promise((resolve) => setImmediate(resolve));
  await player.write(Uint8Array.of(1, 2));
  assert.equal(fake.written.length, 0);
});

test("a write waiting on aplay ends quietly when the player is stopped", async () => {
  const fake = fakeProcess({ holdWrites: true });
  const player = playerOn(fake);
  const writing = player.write(Uint8Array.of(1, 2, 3, 4));
  await new Promise((resolve) => setImmediate(resolve));
  player.stop();
  await writing;
});

test("an error on aplay's input doesn't crash Jarvis", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
  fake.exit({ code: 1, signal: null });
  await assert.rejects(player.finish(), { message: "aplay stopped with code 1" });
});

test("what aplay says is kept to the first part", async () => {
  const fake = fakeProcess();
  const player = playerOn(fake);
  fake.stderr.write("x".repeat(10_000));
  await new Promise((resolve) => setImmediate(resolve));
  fake.exit({ code: 1, signal: null });
  await assert.rejects(player.finish(), (error: Error) => error.message.length < 340 && error.message.endsWith("…"));
});

test("short errors drop control characters, squash spaces and cut long text", () => {
  assert.equal(shortError("  one\n\ttwo\u0007  three  "), "one two three");
  assert.equal(shortError("a\u0085b"), "a b");
  assert.equal(shortError("a  b"), "a b");
  assert.equal(shortError("y".repeat(300)), "y".repeat(300));
  assert.equal(shortError("y".repeat(301)), `${"y".repeat(299)}…`);
  assert.equal(shortError(""), "");
});

test("with a real process, every byte arrives through the pipe, more than a pipe holds at once", async () => {
  const folder = await scratch();
  const out = join(folder, "out.json");
  const script = `let n=0;process.stdin.on("data",(c)=>{n+=c.length});process.stdin.on("end",()=>{require("fs").writeFileSync(${JSON.stringify(out)},JSON.stringify({n,args:process.argv.slice(1)}))})`;
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: realPlayer(script) });
  const chunk = new Uint8Array(64 * 1024).fill(7);
  for (let i = 0; i < 8; i++) await player.write(chunk);
  await player.finish();
  const seen = JSON.parse(await readFile(out, "utf8")) as { n: number; args: string[] };
  assert.equal(seen.n, 8 * 64 * 1024);
  assert.deepEqual(seen.args, playerArgs("plughw:1,0", 24_000));
});

test("with a real process, a failure's exit code and words come through", async () => {
  const script = `process.stderr.write("audio open error: No such file or directory\\n");process.exit(1)`;
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: realPlayer(script) });
  await assert.rejects(player.finish(), { message: "aplay stopped with code 1: audio open error: No such file or directory" });
});

test("with a real process, a big write still waiting when finishing starts arrives in full and both succeed", async () => {
  const folder = await scratch();
  const out = join(folder, "count");
  const script = `let n=0;process.stdin.on("data",(c)=>{n+=c.length});process.stdin.on("end",()=>{require("fs").writeFileSync(${JSON.stringify(out)},String(n))})`;
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: realPlayer(script) });
  const writing = player.write(new Uint8Array(4 * 1024 * 1024));
  const finished = player.finish();
  await Promise.all([writing, finished]);
  assert.equal(await readFile(out, "utf8"), String(4 * 1024 * 1024));
});

test("with a real process that dies without reading, writing fails instead of crashing", async () => {
  const script = `process.stderr.write("gone");process.exit(3)`;
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: realPlayer(script) });
  const chunk = new Uint8Array(256 * 1024);
  await assert.rejects(
    (async () => {
      for (let i = 0; i < 16; i++) await player.write(chunk);
    })(),
    { message: "aplay stopped with code 3: gone" },
  );
  await assert.rejects(player.finish(), { message: "aplay stopped with code 3: gone" });
});

test("with a real process that never stops by itself, stopping ends it", async () => {
  const script = `process.stdin.resume();setInterval(()=>{},1000)`;
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: realPlayer(script) });
  await player.write(new Uint8Array(1024));
  const started = performance.now();
  player.stop();
  await player.finish();
  assert.ok(performance.now() - started < 5000);
});

test("with a real process that ignores being asked to stop, stopping still ends it", { timeout: 10_000 }, async () => {
  const script = `process.on("SIGTERM",()=>{});process.stdin.resume();setInterval(()=>{},1000);setTimeout(()=>process.exit(0),8000)`;
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: realPlayer(script), killAfterMs: 300 });
  await player.write(new Uint8Array(1024));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const started = performance.now();
  player.stop();
  await player.finish();
  const took = performance.now() - started;
  assert.ok(took >= 250 && took < 3000, String(took));
});

test("with no such program, finishing says it isn't installed", async () => {
  const player = startPlayer({ device: "plughw:1,0", rate: 24_000, spawn: (args) => spawnPlayer(args, "jarvis-no-such-player") });
  await assert.rejects(player.finish(), { message: "aplay isn't installed here. Sound plays from Jarvis's own image, which bash host/jarvis.sh sound-test builds" });
});
