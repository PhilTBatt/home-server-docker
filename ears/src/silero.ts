import { recordingRate } from "./recorder.js";

export const sileroModelPath = "/app/models/silero_vad.onnx";
export const sileroChunk = 512;
export const sileroContext = 64;
export const sileroStateSize = 2 * 128;
export const sileroThreshold = 0.5;

export type SileroStep = (input: Float32Array, state: Float32Array) => Promise<{ probability: number; state: Float32Array }>;

type OrtTensor = { data: unknown };
type Ort = {
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(path: string, options: Record<string, unknown>): Promise<{ run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> }> };
};

export async function loadSilero(path = sileroModelPath, runtime: () => Promise<unknown> = () => import("onnxruntime-node")): Promise<SileroStep> {
  process.env.ORT_DISABLE_TELEMETRY = "1";
  const loaded = (await runtime()) as Ort & { default?: Ort };
  const ort = loaded.InferenceSession === undefined && loaded.default !== undefined ? loaded.default : loaded;
  const session = await ort.InferenceSession.create(path, { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: "sequential" });
  const rate = new ort.Tensor("int64", BigInt64Array.of(BigInt(recordingRate)), []);
  return async (input, state) => {
    const out = await session.run({ input: new ort.Tensor("float32", input, [1, input.length]), state: new ort.Tensor("float32", state, [2, 1, 128]), sr: rate });
    const probability = (out.output?.data as Float32Array | undefined)?.[0];
    const next = out.stateN?.data;
    if (typeof probability !== "number" || !Number.isFinite(probability) || !(next instanceof Float32Array) || next.length !== sileroStateSize) throw new Error("the speech detector's model gave back something other than a probability and its state");
    return { probability, state: next };
  };
}

export type Detector = { frame(sound: Uint8Array): Promise<number[]> };

export function createDetector(step: SileroStep): Detector {
  let state: Float32Array = new Float32Array(sileroStateSize);
  let context = new Float32Array(sileroContext);
  let waiting = new Float32Array(0);
  let odd: number | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const judge = async (sound: Uint8Array): Promise<number[]> => {
    let bytes = sound;
    if (odd !== null) {
      bytes = new Uint8Array(sound.length + 1);
      bytes[0] = odd;
      bytes.set(sound, 1);
    }
    odd = bytes.length % 2 === 1 ? bytes[bytes.length - 1] : null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2));
    const samples = new Float32Array(waiting.length + view.byteLength / 2);
    samples.set(waiting, 0);
    for (let index = 0; index < view.byteLength / 2; index++) samples[waiting.length + index] = view.getInt16(index * 2, true) / 32768;
    const chances: number[] = [];
    let at = 0;
    for (; at + sileroChunk <= samples.length; at += sileroChunk) {
      const input = new Float32Array(sileroContext + sileroChunk);
      input.set(context, 0);
      input.set(samples.subarray(at, at + sileroChunk), sileroContext);
      const result = await step(input, state);
      state = result.state;
      context = input.slice(input.length - sileroContext);
      chances.push(result.probability);
    }
    waiting = samples.slice(at);
    return chances;
  };
  return {
    frame(sound) {
      const done = queue.then(() => judge(sound));
      queue = done.catch(() => {});
      return done;
    },
  };
}

export function heardSpeech(chances: readonly number[], threshold = sileroThreshold): boolean {
  return chances.some((chance) => chance >= threshold);
}
