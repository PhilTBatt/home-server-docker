import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { frameBytes } from "./levels.js";
import { sileroCheck } from "./silero-check.js";
import { createDetector, heardSpeech, loadSilero, sileroChunk, sileroContext, sileroModelPath, sileroStateSize, sileroThreshold, type SileroStep } from "./silero.js";

function samples(values: number[]): Uint8Array {
  const sound = new Uint8Array(values.length * 2);
  const view = new DataView(sound.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return sound;
}

function recording(chance = 0.1) {
  const inputs: Float32Array[] = [];
  const states: Float32Array[] = [];
  let count = 0;
  const step: SileroStep = async (input, state) => {
    inputs.push(input.slice());
    states.push(state.slice());
    count++;
    const next = new Float32Array(sileroStateSize).fill(count);
    return { probability: chance, state: next };
  };
  return { step, inputs, states };
}

test("Silero takes 512 samples at a time at 16,000 Hz, with the 64 before them, and counts 0.5 and over as speech", () => {
  assert.deepEqual([sileroChunk, sileroContext, sileroStateSize, sileroThreshold, sileroModelPath], [512, 64, 256, 0.5, "/app/models/silero_vad.onnx"]);
});

test("a tenth of a second's frame gives three chunks and keeps the rest for the next, so every eighth frame gives four", async () => {
  const { step, inputs } = recording();
  const detector = createDetector(step);
  const counts: number[] = [];
  for (let frame = 0; frame < 8; frame++) counts.push((await detector.frame(new Uint8Array(frameBytes))).length);
  assert.deepEqual(counts, [3, 3, 3, 3, 3, 3, 3, 4]);
  assert.equal(inputs.length, 25);
  assert.ok(inputs.every((input) => input.length === sileroContext + sileroChunk));
});

test("each chunk is the last 64 samples before it followed by its own 512, scaled to between -1 and 1, and the first starts from silence", async () => {
  const { step, inputs } = recording();
  const detector = createDetector(step);
  const values = Array.from({ length: 1100 }, (_, index) => (index % 2 === 0 ? 16384 : -32768));
  await detector.frame(samples(values));
  assert.equal(inputs.length, 2);
  assert.deepEqual([...inputs[0].subarray(0, sileroContext)], new Array(sileroContext).fill(0));
  assert.deepEqual([inputs[0][sileroContext], inputs[0][sileroContext + 1]], [0.5, -1]);
  assert.deepEqual([...inputs[1].subarray(0, sileroContext)], [...inputs[0].subarray(inputs[0].length - sileroContext)]);
  assert.deepEqual([inputs[1][sileroContext], inputs[1][sileroContext + 1]], [0.5, -1]);
});

test("the model's state is carried from each chunk to the next, starting from zeros", async () => {
  const { step, states } = recording();
  const detector = createDetector(step);
  await detector.frame(new Uint8Array(frameBytes));
  assert.deepEqual([states[0][0], states[1][0], states[2][0]], [0, 1, 2]);
  assert.ok(states.every((state) => state.length === sileroStateSize));
});

test("sound that arrives in odd pieces, an odd byte included, is judged the same as sound in whole frames", async () => {
  const values = Array.from({ length: 3000 }, (_, index) => Math.round(Math.sin(index / 7) * 9000));
  const whole = recording();
  await createDetector(whole.step).frame(samples(values));
  const pieces = recording();
  const pieced = createDetector(pieces.step);
  const sound = samples(values);
  await pieced.frame(sound.subarray(0, 701));
  await pieced.frame(sound.subarray(701, 1402));
  await pieced.frame(sound.subarray(1402, 2001));
  await pieced.frame(sound.subarray(2001));
  assert.deepEqual(pieces.inputs.map((input) => [...input]), whole.inputs.map((input) => [...input]));
});

test("frames asked for one after another without waiting are still judged in order, one chunk at a time", async () => {
  const order: number[] = [];
  let busy = false;
  const step: SileroStep = async (input, state) => {
    assert.equal(busy, false);
    busy = true;
    await new Promise((resolve) => setTimeout(resolve, 1));
    order.push(input[sileroContext]);
    busy = false;
    return { probability: 0, state };
  };
  const detector = createDetector(step);
  const first = detector.frame(samples(new Array(512).fill(3277)));
  const second = detector.frame(samples(new Array(512).fill(6554)));
  await Promise.all([first, second]);
  assert.deepEqual(order.map((value) => Math.round(value * 10)), [1, 2]);
});

test("a chunk the model fails on fails that frame, and the next frame is still judged", async () => {
  let calls = 0;
  const step: SileroStep = async (_input, state) => {
    calls++;
    if (calls === 1) throw new Error("model broke");
    return { probability: 0.9, state };
  };
  const detector = createDetector(step);
  await assert.rejects(detector.frame(samples(new Array(512).fill(1))), { message: "model broke" });
  assert.deepEqual(await detector.frame(samples(new Array(512).fill(1))), [0.9]);
});

test("a frame is speech when any of its chunks is at 0.5 or over", () => {
  assert.equal(heardSpeech([]), false);
  assert.equal(heardSpeech([0.1, 0.49]), false);
  assert.equal(heardSpeech([0.1, 0.5]), true);
  assert.equal(heardSpeech([0.99]), true);
  assert.equal(heardSpeech([0.6], 0.7), false);
});

function fakeRuntime(output: Record<string, { data: unknown }>, withDefault = false) {
  const made: { created: [string, Record<string, unknown>] | null; feeds: Record<string, { type: string; data: unknown; dims: number[] }>[] } = { created: null, feeds: [] };
  class Tensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
  }
  const ort = {
    Tensor,
    InferenceSession: {
      async create(path: string, options: Record<string, unknown>) {
        made.created = [path, options];
        return {
          async run(feeds: Record<string, { type: string; data: unknown; dims: number[] }>) {
            made.feeds.push(feeds);
            return output;
          },
        };
      },
    },
  };
  return { made, runtime: async () => (withDefault ? { default: ort } : ort) };
}

test("loading opens the model with one thread, and each step sends the chunk, the state and the rate the model wants", async () => {
  const state = new Float32Array(sileroStateSize).fill(0.25);
  const { made, runtime } = fakeRuntime({ output: { data: Float32Array.of(0.75) }, stateN: { data: state } });
  const step = await loadSilero("/models/x.onnx", runtime);
  assert.deepEqual(made.created, ["/models/x.onnx", { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: "sequential" }]);
  const input = new Float32Array(sileroContext + sileroChunk);
  const answer = await step(input, new Float32Array(sileroStateSize));
  assert.deepEqual(answer, { probability: 0.75, state });
  const feeds = made.feeds[0];
  assert.deepEqual([feeds.input.type, feeds.input.dims, feeds.state.type, feeds.state.dims, feeds.sr.type, feeds.sr.dims, [...(feeds.sr.data as BigInt64Array)]], ["float32", [1, 576], "float32", [2, 1, 128], "int64", [], [16000n]]);
  assert.equal(feeds.input.data, input);
});

test("onnxruntime's telemetry to Microsoft is switched off before the runtime is even loaded", async () => {
  const before = process.env.ORT_DISABLE_TELEMETRY;
  delete process.env.ORT_DISABLE_TELEMETRY;
  let seen: string | undefined = "not asked";
  const { runtime } = fakeRuntime({ output: { data: Float32Array.of(0.2) }, stateN: { data: new Float32Array(sileroStateSize) } });
  try {
    await loadSilero("/m.onnx", async () => ((seen = process.env.ORT_DISABLE_TELEMETRY), runtime()));
    assert.equal(seen, "1");
  } finally {
    if (before === undefined) delete process.env.ORT_DISABLE_TELEMETRY;
    else process.env.ORT_DISABLE_TELEMETRY = before;
  }
});

test("a runtime loaded as a CommonJS default export works the same", async () => {
  const { runtime } = fakeRuntime({ output: { data: Float32Array.of(0.2) }, stateN: { data: new Float32Array(sileroStateSize) } }, true);
  const step = await loadSilero("/m.onnx", runtime);
  assert.equal((await step(new Float32Array(576), new Float32Array(sileroStateSize))).probability.toFixed(1), "0.2");
});

test("a model that gives back anything but a probability and a whole state is refused", async () => {
  const outputs: Record<string, { data: unknown }>[] = [{}, { output: { data: Float32Array.of(Number.NaN) }, stateN: { data: new Float32Array(sileroStateSize) } }, { output: { data: Float32Array.of(0.1) }, stateN: { data: new Float32Array(10) } }, { output: { data: Float32Array.of(0.1) }, stateN: { data: [0] } }, { output: { data: new Float32Array(0) }, stateN: { data: new Float32Array(sileroStateSize) } }];
  for (const output of outputs) {
    const { runtime } = fakeRuntime(output);
    const step = await loadSilero("/m.onnx", runtime);
    await assert.rejects(step(new Float32Array(576), new Float32Array(sileroStateSize)), { message: "the speech detector's model gave back something other than a probability and its state" }, JSON.stringify(output));
  }
});

const realModel = process.env.EARS_SILERO_TEST_MODEL ?? "";

test("the real model, when one is given to test with, loads and takes none of silence, noise or a steady tone for speech", { skip: realModel === "" || !existsSync(realModel) ? "no model given in EARS_SILERO_TEST_MODEL" : false, timeout: 30_000 }, async () => {
  const lines: string[] = [];
  assert.equal(await sileroCheck(await loadSilero(realModel), (line) => void lines.push(line)), 0, lines.join("\n"));
});
