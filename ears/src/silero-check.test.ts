import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkSound, checkSounds, sileroCheck } from "./silero-check.js";
import type { SileroStep } from "./silero.js";

const here = dirname(fileURLToPath(import.meta.url));

function samplesOf(sound: Uint8Array): number[] {
  const view = new DataView(sound.buffer, sound.byteOffset, sound.length);
  return Array.from({ length: sound.length / 2 }, (_, index) => view.getInt16(index * 2, true));
}

test("the check plays it a second each of silence, quiet noise and a 440 Hz tone", () => {
  assert.deepEqual(checkSounds, ["silence", "noise", "a steady tone"]);
  const silence = samplesOf(checkSound("silence"));
  assert.equal(silence.length, 16_000);
  assert.ok(silence.every((sample) => sample === 0));
  const noise = samplesOf(checkSound("noise"));
  assert.ok(noise.every((sample) => Math.abs(sample) <= 300) && noise.some((sample) => sample !== 0));
  assert.deepEqual(samplesOf(checkSound("noise")), noise);
  const tone = samplesOf(checkSound("a steady tone", 0.5));
  assert.equal(tone.length, 8_000);
  assert.equal(Math.max(...tone), 3000);
  assert.equal(tone[0], 0);
});

const steady = (chance: (input: Float32Array) => number): SileroStep => async (input, state) => ({ probability: chance(input), state });

test("when nothing reaches the speech line, the check says each sound's highest chance and passes", async () => {
  const lines: string[] = [];
  assert.equal(await sileroCheck(steady(() => 0.12), (line) => void lines.push(line)), 0);
  assert.deepEqual(lines, [
    "A second of silence: its highest chance of being speech was 0.12.",
    "A second of noise: its highest chance of being speech was 0.12.",
    "A second of a steady tone: its highest chance of being speech was 0.12.",
    "The speech detector loaded and runs, and none of them reached 0.5, where it counts something as speech.",
  ]);
});

test("when anything reaches the speech line, the check says so and fails", async () => {
  const lines: string[] = [];
  const loud = steady((input) => (input.some((value) => Math.abs(value) > 0.05) ? 0.5 : 0));
  assert.equal(await sileroCheck(loud, (line) => void lines.push(line)), 1);
  assert.deepEqual(lines.slice(0, 3).map((line) => line.split(": ")[1]), ["its highest chance of being speech was 0.00.", "its highest chance of being speech was 0.00.", "its highest chance of being speech was 0.50."]);
  assert.equal(lines[3], "The speech detector runs, but took something that isn't speech for speech, which it shouldn't.");
});

test("each sound starts the detector afresh, so one sound's state never colours the next", async () => {
  const fresh: boolean[] = [];
  const step: SileroStep = async (_input, state) => (fresh.push(state.every((value) => value === 0)), { probability: 0.1, state: state.map(() => 1) });
  assert.equal(await sileroCheck(step, () => {}), 0);
  assert.equal(fresh.filter((yes) => yes).length, checkSounds.length);
  assert.equal(fresh[0], true);
});

test("run as a program with a model that isn't there, it says it couldn't load and exits 1", { timeout: 15_000 }, async () => {
  const child = spawn(process.execPath, [join(here, "silero-check-run.js"), "/no/such/model.onnx"], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (piece) => (out += piece));
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 1);
  assert.match(out, /^The speech detector couldn't load: .+\.\n$/);
});
