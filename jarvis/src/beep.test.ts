import assert from "node:assert/strict";
import { test } from "node:test";
import { beep, beepPeak, fadeMs, joinSound, silence } from "./beep.js";

function samples(sound: Uint8Array): number[] {
  const view = new DataView(sound.buffer, sound.byteOffset, sound.byteLength);
  return Array.from({ length: sound.length / 2 }, (_, i) => view.getInt16(i * 2, true));
}

function crossings(values: number[]): number {
  let count = 0;
  for (let i = 1; i < values.length; i++) if ((values[i - 1] < 0 && values[i] >= 0) || (values[i - 1] >= 0 && values[i] < 0)) count++;
  return count;
}

test("a beep is two bytes for each sample, at the rate asked for", () => {
  assert.equal(beep(24_000, 440, 100).length, 4800);
  assert.equal(beep(22_050, 440, 100).length, 4410);
  assert.equal(beep(48_000, 1000, 250).length, 24_000);
});

test("a beep's length is rounded to whole samples, and is never empty", () => {
  assert.equal(beep(24_000, 440, 0.01).length, 2);
  assert.equal(beep(22_050, 440, 1).length, 44);
});

test("a beep is a sine wave at the pitch asked for", () => {
  const values = samples(beep(24_000, 440, 1000));
  assert.ok(Math.abs(crossings(values) - 880) <= 2, `crossings: ${crossings(values)}`);
  const high = samples(beep(24_000, 880, 1000));
  assert.ok(Math.abs(crossings(high) - 1760) <= 2, `crossings: ${crossings(high)}`);
});

test("a beep stays at the gentle peak level, and reaches it away from the ends", () => {
  const values = samples(beep(24_000, 440, 500));
  const top = Math.round(beepPeak * 32767);
  assert.ok(values.every((value) => Math.abs(value) <= top));
  assert.ok(Math.max(...values.slice(2400, 9600).map(Math.abs)) >= top - 5);
  assert.equal(beepPeak, 0.3);
});

test("a beep starts and ends at silence, fading in and out so it doesn't click", () => {
  const values = samples(beep(24_000, 440, 200));
  assert.equal(values[0], 0);
  assert.equal(values[values.length - 1], 0);
  const fade = (24_000 * fadeMs) / 1000;
  const top = beepPeak * 32767;
  assert.ok(Math.max(...values.slice(0, fade / 4).map(Math.abs)) < top / 4);
  assert.ok(Math.max(...values.slice(-fade / 4).map(Math.abs)) < top / 4);
  assert.ok(Math.max(...values.slice(fade, fade * 2).map(Math.abs)) >= Math.round(top) - 50);
  assert.equal(fadeMs, 10);
});

test("a beep shorter than two fades fades over half its length instead", () => {
  const values = samples(beep(24_000, 440, 5));
  assert.equal(values.length, 120);
  assert.equal(values[0], 0);
  assert.equal(values[values.length - 1], 0);
  assert.ok(Math.max(...values.map(Math.abs)) > 7000);
});

test("samples are signed 16-bit and little-endian", () => {
  const sound = beep(24_000, 440, 50);
  const view = new DataView(sound.buffer);
  const big = Array.from({ length: sound.length / 2 }, (_, i) => view.getInt16(i * 2, false));
  const little = samples(sound);
  assert.ok(little.some((value) => value < 0));
  assert.notDeepEqual(big, little);
  assert.equal(little[600], Math.round(Math.sin((2 * Math.PI * 440 * 600) / 24_000) * beepPeak * 32767));
});

test("a bad rate, pitch or length is refused and named", () => {
  assert.throws(() => beep(1999, 440, 100), { message: "The sound rate must be a whole number of Hz from 2000 to 192000, not 1999" });
  assert.throws(() => beep(192_001, 440, 100), { message: "The sound rate must be a whole number of Hz from 2000 to 192000, not 192001" });
  assert.throws(() => beep(24_000.5, 440, 100), { message: "The sound rate must be a whole number of Hz from 2000 to 192000, not 24000.5" });
  assert.throws(() => beep(Number.NaN, 440, 100), { message: "The sound rate must be a whole number of Hz from 2000 to 192000, not NaN" });
  assert.throws(() => beep(24_000, 440, 0), { message: "A sound must last more than 0 ms, not 0" });
  assert.throws(() => beep(24_000, 440, -5), { message: "A sound must last more than 0 ms, not -5" });
  assert.throws(() => beep(24_000, 440, Number.POSITIVE_INFINITY), { message: "A sound must last more than 0 ms, not Infinity" });
  assert.throws(() => beep(24_000, 0, 100), { message: "A beep at 24000 Hz must be above 0 Hz and below 12000 Hz, not 0" });
  assert.throws(() => beep(24_000, 12_000, 100), { message: "A beep at 24000 Hz must be above 0 Hz and below 12000 Hz, not 12000" });
  assert.throws(() => beep(24_000, Number.NaN, 100), { message: "A beep at 24000 Hz must be above 0 Hz and below 12000 Hz, not NaN" });
});

test("the edges of the allowed rates are accepted", () => {
  assert.equal(beep(2000, 440, 10).length, 40);
  assert.equal(beep(192_000, 440, 10).length, 3840);
});

test("silence is zeros, two bytes a sample", () => {
  const quiet = silence(24_000, 80);
  assert.equal(quiet.length, 3840);
  assert.ok(quiet.every((byte) => byte === 0));
  assert.throws(() => silence(24_000, 0), { message: "A sound must last more than 0 ms, not 0" });
  assert.throws(() => silence(100, 10), { message: "The sound rate must be a whole number of Hz from 2000 to 192000, not 100" });
});

test("joining sounds keeps every part, in order", () => {
  const joined = joinSound([Uint8Array.of(1, 2), Uint8Array.of(), Uint8Array.of(3, 4, 5, 6)]);
  assert.deepEqual(Array.from(joined), [1, 2, 3, 4, 5, 6]);
  assert.equal(joinSound([]).length, 0);
});
