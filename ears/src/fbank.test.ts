import assert from "node:assert/strict";
import { test } from "node:test";
import { createFbank, fbankBins, fbankFftSize, fbankFloor, fbankFrameSamples, fbankLowHz, fbankPreemphasis, fbankShiftSamples, frameCount, hammingWindow, melBanks, melOf, powerSpectrum, samplesOf, subtractMean } from "./fbank.js";

function testSignal(count: number): Float64Array {
  const samples = new Float64Array(count);
  let seed = 7;
  for (let index = 0; index < count; index++) {
    seed = (seed * 48271) % 2147483647;
    samples[index] = Math.round(Math.sin((2 * Math.PI * 300 * index) / 16000) * 4000 + Math.sin((2 * Math.PI * 1250 * index) / 16000) * 1500 + ((seed / 2147483647) * 2 - 1) * 200);
  }
  return samples;
}

test("features are 80 log mel energies from 25 ms of sound every 10 ms, through a 512-point FFT, from 20 Hz up, with Kaldi's pre-emphasis and floor", () => {
  assert.deepEqual([fbankBins, fbankFrameSamples, fbankShiftSamples, fbankFftSize, fbankLowHz, fbankPreemphasis, fbankFloor], [80, 400, 160, 512, 20, 0.97, 1.1920928955078125e-7]);
});

test("frames start every 160 samples and only whole frames count, so 400 samples make the first and every 160 more another", () => {
  assert.deepEqual([0, 399, 400, 559, 560, 16000].map(frameCount), [0, 0, 1, 1, 2, 98]);
});

test("the mel scale is Kaldi's, 1127 times the log of one plus the frequency over 700", () => {
  assert.equal(melOf(0), 0);
  assert.ok(Math.abs(melOf(700) - 1127 * Math.LN2) < 1e-9);
});

test("the window is Hamming's, 0.08 at each end and 1 in the middle of an odd length", () => {
  const window = hammingWindow(401);
  assert.ok(Math.abs(window[0] - 0.08) < 1e-12 && Math.abs(window[400] - 0.08) < 1e-12 && Math.abs(window[200] - 1) < 1e-12);
  assert.equal(hammingWindow().length, 400);
});

test("the power spectrum of a single click is flat, and of a steady wave peaks at its own frequency", () => {
  const click = new Float64Array(400);
  click[0] = 2;
  const flat = powerSpectrum(click);
  assert.equal(flat.length, 257);
  assert.ok(flat.every((value) => Math.abs(value - 4) < 1e-9));
  const wave = Float64Array.from({ length: 512 }, (_, index) => Math.cos((2 * Math.PI * 32 * index) / 512));
  const peaked = powerSpectrum(wave);
  assert.ok(Math.abs(peaked[32] - 256 * 256) < 1e-6);
  assert.ok(peaked.every((value, index) => index === 32 || value < 1e-12));
});

test("the 80 mel banks are triangles that cover the spectrum from 20 Hz without the top bin, each rising and falling once", () => {
  const banks = melBanks();
  assert.equal(banks.length, 80);
  assert.equal(banks[0].first, 1);
  const last = banks[79];
  assert.ok(last.first + last.weights.length <= 256);
  for (const bank of banks) {
    assert.ok(bank.weights.length > 0 && bank.weights.every((weight) => weight > 0 && weight <= 1));
    const top = bank.weights.indexOf(Math.max(...bank.weights));
    assert.ok(bank.weights.slice(0, top + 1).every((weight, index, all) => index === 0 || weight >= all[index - 1]));
    assert.ok(bank.weights.slice(top).every((weight, index, all) => index === 0 || weight <= all[index - 1]));
  }
});

test("the features match kaldi-native-fbank's for the same sound, to within a thousandth", () => {
  const frames = createFbank()(testSignal(3200));
  assert.equal(frames.length, 18);
  assert.ok(frames.every((frame) => frame.length === 80));
  const expected: [number, number[]][] = [
    [0, [12.9236, 11.2458, 13.7942, 15.1238, 16.6181, 17.441]],
    [7, [12.334, 9.8773, 13.0943, 14.6321, 17.4893, 18.3273]],
    [17, [12.3772, 7.3091, 12.177, 15.4133, 16.8466, 17.3064]],
  ];
  for (const [frame, values] of expected) {
    [0, 5, 20, 40, 60, 79].forEach((bin, at) => assert.ok(Math.abs(frames[frame][bin] - values[at]) < 1e-3, `frame ${frame} bin ${bin}: ${frames[frame][bin]} against ${values[at]}`));
  }
  const sum = frames.reduce((total, frame) => total + frame.reduce((part, value) => part + value, 0), 0);
  assert.ok(Math.abs(sum - 21971.543) < 0.05, String(sum));
});

test("silence is floored rather than giving minus infinity", () => {
  const frames = createFbank()(new Float64Array(800));
  assert.equal(frames.length, 3);
  assert.ok(frames.every((frame) => frame.every((value) => Math.abs(value - Math.log(fbankFloor)) < 1e-6)));
});

test("too little sound for one frame gives no features", () => {
  assert.deepEqual(createFbank()(new Float64Array(399)), []);
});

test("sound is read as 16-bit little-endian samples, an odd last byte left out", () => {
  assert.deepEqual([...samplesOf(Uint8Array.of(0x01, 0x00, 0xff, 0xff, 0x00, 0x80, 0x07))], [1, -1, -32768]);
  assert.deepEqual([...samplesOf(Uint8Array.of(9, 9, 0x10, 0x00).subarray(2))], [16]);
});

test("taking away each bin's mean over the frames leaves every bin averaging zero, in one row after another", () => {
  const flat = subtractMean([Float32Array.of(1, 10), Float32Array.of(3, 20), Float32Array.of(5, 60)]);
  assert.deepEqual([...flat], [-2, -20, 0, -10, 2, 30]);
  assert.deepEqual([...subtractMean([])], []);
});
