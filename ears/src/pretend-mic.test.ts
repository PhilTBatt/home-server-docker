import assert from "node:assert/strict";
import { test } from "node:test";
import { pretendChunkMs, pretendSound, runPretendMic } from "./pretend-mic.js";

test("the pretend microphone makes a quiet 440 Hz tone, 16-bit, carrying on smoothly from one piece to the next", () => {
  const whole = pretendSound(0, 3200);
  const split = Buffer.concat([pretendSound(0, 1600), pretendSound(1600, 1600)]);
  assert.deepEqual(split, whole);
  const samples = Array.from({ length: 3200 }, (_unused, index) => whole.readInt16LE(index * 2));
  assert.equal(Math.max(...samples), 1000);
  assert.equal(Math.min(...samples), -1000);
  assert.equal(samples[0], 0);
});

test("it sends a tenth of a second of sound every tenth of a second until it's stopped", async () => {
  assert.equal(pretendChunkMs, 100);
  const sent: Buffer[] = [];
  const stop = runPretendMic((sound) => sent.push(sound) > 0, 20);
  await new Promise((resolve) => setTimeout(resolve, 110));
  stop();
  const count = sent.length;
  assert.ok(count >= 3 && count <= 6, `${count} pieces`);
  assert.ok(sent.every((piece) => piece.length === 640));
  assert.deepEqual(Buffer.concat(sent.slice(0, 3)), pretendSound(0, 960), "the tone carries on from piece to piece");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(sent.length, count);
});
