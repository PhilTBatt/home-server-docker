import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultVoiceOwner, voiceNamePattern, type VoiceIdMode, type VoiceIdSettings } from "./config.js";
import { createFbank, fbankBins, samplesOf, subtractMean, type Fbank } from "./fbank.js";
import { frameBytes, frameLevel, frameMs, speakingAtLeast } from "./levels.js";
import { bytesPerSecond } from "./recorder.js";
import type { By } from "./tap.js";

export const voiceModelName = "wespeaker_en_voxceleb_CAM++";
export const voiceModelPath = "/app/models/voice-id.onnx";
export const voiceSize = 512;
export const voiceprintDir = "/voice";
export const voiceprintPath = `${voiceprintDir}/${defaultVoiceOwner}.json`;
export const mostVoiceprints = 20;
export const shortestSpeechMs = 1_000;
export const longestSpeechMs = 10_000;
export const marginFrames = 1;
export const mostClips = 20;

export type Embedder = (features: Float32Array, frames: number) => Promise<Float32Array>;

type OrtTensor = { data: unknown };
type Ort = {
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(path: string, options: Record<string, unknown>): Promise<{ run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> }> };
};

export const strangeAnswer = "the voice model gave back something other than a voice's numbers";

export async function loadVoiceModel(path = voiceModelPath, runtime: () => Promise<unknown> = () => import("onnxruntime-node")): Promise<Embedder> {
  process.env.ORT_DISABLE_TELEMETRY = "1";
  const loaded = (await runtime()) as Ort & { default?: Ort };
  const ort = loaded.InferenceSession === undefined && loaded.default !== undefined ? loaded.default : loaded;
  const session = await ort.InferenceSession.create(path, { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: "sequential" });
  let queue: Promise<unknown> = Promise.resolve();
  const run = async (features: Float32Array, frames: number): Promise<Float32Array> => {
    const out = await session.run({ feats: new ort.Tensor("float32", features, [1, frames, fbankBins]) });
    const numbers = out.embs?.data;
    if (!(numbers instanceof Float32Array) || numbers.length !== voiceSize || !numbers.every(Number.isFinite) || length(numbers) === 0) throw new Error(strangeAnswer);
    return numbers;
  };
  return (features, frames) => {
    const done = queue.then(() => run(features, frames));
    queue = done.catch(() => {});
    return done;
  };
}

function length(vector: ArrayLike<number>): number {
  let sum = 0;
  for (let index = 0; index < vector.length; index++) sum += vector[index] * vector[index];
  return Math.sqrt(sum);
}

export function unit(vector: ArrayLike<number>): Float32Array {
  const size = length(vector);
  if (size === 0 || !Number.isFinite(size)) throw new Error("a voice's numbers can't all be zero");
  return Float32Array.from(vector, (value) => value / size);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error("two voices' numbers can only be compared when there are as many of each");
  let dot = 0;
  for (let index = 0; index < a.length; index++) dot += a[index] * b[index];
  const sizes = length(a) * length(b);
  return sizes === 0 ? 0 : dot / sizes;
}

export type Speech = { from: number; to: number; spanMs: number };

export function findSpeech(sound: Uint8Array): Speech | null {
  const levels: number[] = [];
  for (let at = 0; at + frameBytes <= sound.length; at += frameBytes) levels.push(frameLevel(sound.subarray(at, at + frameBytes)));
  const first = levels.findIndex((level) => level > speakingAtLeast);
  if (first === -1) return null;
  const last = levels.findLastIndex((level) => level > speakingAtLeast);
  return { from: Math.max(0, first - marginFrames) * frameBytes, to: Math.min(levels.length, last + 1 + marginFrames) * frameBytes, spanMs: (last - first + 1) * frameMs };
}

export type Heard = { problem: "no speech" | "too short"; speechMs: number } | { problem: null; speechMs: number; vector: Float32Array };

export async function embedSpeech(sound: Uint8Array, embedder: Embedder, shortestMs = shortestSpeechMs, fbank: Fbank = createFbank()): Promise<Heard> {
  const speech = findSpeech(sound);
  if (speech === null) return { problem: "no speech", speechMs: 0 };
  if (speech.spanMs < shortestMs) return { problem: "too short", speechMs: speech.spanMs };
  const samples = samplesOf(sound.subarray(speech.from, Math.min(speech.to, speech.from + (longestSpeechMs / 1000) * bytesPerSecond)));
  const frames = fbank(samples);
  return { problem: null, speechMs: speech.spanMs, vector: unit(await embedder(subtractMean(frames), frames.length)) };
}

export type Voiceprint = { model: string; clips: number; made: string; vector: Float32Array };

export function makeVoiceprint(vectors: readonly ArrayLike<number>[], made: Date): Voiceprint {
  if (vectors.length === 0) throw new Error("a voiceprint needs at least one clip");
  if (vectors.length > mostClips) throw new Error(`a voiceprint is made from at most ${mostClips} clips`);
  const sum = new Float64Array(voiceSize);
  for (const vector of vectors) {
    if (vector.length !== voiceSize) throw new Error(`each clip's voice must be ${voiceSize} numbers`);
    const each = unit(vector);
    for (let index = 0; index < voiceSize; index++) sum[index] += each[index];
  }
  return { model: voiceModelName, clips: vectors.length, made: made.toISOString(), vector: unit(sum) };
}

export function voiceprintText(voiceprint: Voiceprint): string {
  return JSON.stringify({ model: voiceprint.model, clips: voiceprint.clips, made: voiceprint.made, vector: Array.from(voiceprint.vector, (value) => Number(value.toFixed(6))) });
}

export const notVoiceprint = "The voiceprint file isn't one ears made, so make it again with bash host/ears.sh voice-enrol";

export function readVoiceprint(text: string): Voiceprint {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(notVoiceprint);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(notVoiceprint);
  const { model, clips, made, vector } = parsed as Record<string, unknown>;
  if (typeof model === "string" && model !== voiceModelName) throw new Error("The voiceprint was made with a different voice model from the one ears has now, so make it again with bash host/ears.sh voice-enrol");
  if (model !== voiceModelName || typeof clips !== "number" || !Number.isInteger(clips) || clips < 1 || clips > mostClips) throw new Error(notVoiceprint);
  if (typeof made !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(made) || Number.isNaN(Date.parse(made))) throw new Error(notVoiceprint);
  if (!Array.isArray(vector) || vector.length !== voiceSize || !vector.every((value) => typeof value === "number" && Number.isFinite(value)) || length(vector as number[]) === 0) throw new Error(notVoiceprint);
  return { model, clips, made, vector: unit(vector as number[]) };
}

export async function loadVoiceprint(path = voiceprintPath, read: (path: string) => Promise<string> = (path) => readFile(path, "utf8")): Promise<Voiceprint> {
  let text: string;
  try {
    text = await read(path);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOENT") throw new Error("There's no voiceprint yet: make one with bash host/ears.sh voice-enrol");
    if (code === "EACCES") throw new Error("Ears isn't allowed to read the voiceprint file, so make it again with bash host/ears.sh voice-enrol, as the user that runs it");
    throw new Error(`Couldn't read the voiceprint file (${typeof code === "string" ? code : "an unexpected error"})`);
  }
  return readVoiceprint(text);
}

export type NamedVoiceprint = Voiceprint & { name: string };

export function enrolCommand(name: string, owner: string): string {
  return name === owner ? "bash host/ears.sh voice-enrol" : `bash host/ears.sh voice-enrol ${name}`;
}

export async function loadVoiceprints(owner = defaultVoiceOwner, dir = voiceprintDir, list: (dir: string) => Promise<string[]> = (path) => readdir(path), read: (path: string) => Promise<string> = (path) => readFile(path, "utf8")): Promise<NamedVoiceprint[]> {
  let names: string[];
  try {
    names = (await list(dir)).filter((file) => file.endsWith(".json") && voiceNamePattern.test(file.slice(0, -".json".length))).map((file) => file.slice(0, -".json".length));
  } catch {
    names = [];
  }
  if (!names.includes(owner)) {
    const code = await read(join(dir, `${owner}.json`)).then(
      () => null,
      (error: unknown) => (error as { code?: unknown }).code,
    );
    if (code === "EACCES") throw new Error(`Ears isn't allowed to read the voiceprint file, so make it again with ${enrolCommand(owner, owner)}, as the user that runs it`);
    throw new Error(owner === defaultVoiceOwner ? "There's no voiceprint yet: make one with bash host/ears.sh voice-enrol" : `There's no voiceprint called ${owner} (EARS_VOICE_OWNER) yet: make one with ${enrolCommand(owner, owner)}`);
  }
  const ordered = [owner, ...names.filter((name) => name !== owner).sort()];
  if (ordered.length > mostVoiceprints) throw new Error(`There are ${ordered.length} voiceprints in ears/voice, and ears scores at most ${mostVoiceprints}, so forget some with bash host/ears.sh voice-forget <name>`);
  const prints: NamedVoiceprint[] = [];
  for (const name of ordered) {
    try {
      prints.push({ ...(await loadVoiceprint(join(dir, `${name}.json`), read)), name });
    } catch (error) {
      throw new Error(`${name}'s voiceprint: ${(error instanceof Error ? error.message : String(error)).replace("bash host/ears.sh voice-enrol", enrolCommand(name, owner))}`);
    }
  }
  return prints;
}

export const verdicts = ["match", "different", "too short", "no speech"] as const;
export type Verdict = (typeof verdicts)[number];

export type VoiceResult = { verdict: Verdict; score: number | null; speechMs: number; who?: string | null; owner?: boolean; against?: number };

export type Scored = { name: string; score: number };

export function judgeVoice(heard: { problem: "no speech" | "too short" | null; speechMs: number }, scores: readonly Scored[] | null, threshold: number, owner = defaultVoiceOwner): VoiceResult {
  if (heard.problem !== null || scores === null || scores.length === 0) return { verdict: heard.problem ?? "no speech", score: null, speechMs: heard.speechMs, who: null, owner: false };
  const best = scores.reduce((top, each) => (each.score > top.score ? each : top));
  const who = best.score >= threshold ? best.name : null;
  return { verdict: who === null ? "different" : "match", score: best.score, speechMs: heard.speechMs, who, owner: who !== null && who === owner, against: scores.length };
}

export async function scoreVoice(sound: Uint8Array, voiceprints: readonly NamedVoiceprint[], embedder: Embedder, threshold: number, owner = defaultVoiceOwner, fbank?: Fbank): Promise<VoiceResult> {
  const heard = await embedSpeech(sound, embedder, shortestSpeechMs, fbank);
  return judgeVoice(heard, heard.problem === null ? voiceprints.map((print) => ({ name: print.name, score: cosine(heard.vector, print.vector) })) : null, threshold, owner);
}

export const checkedStarts = ["wake", "follow"] as const;

export function blocksRecording(mode: VoiceIdMode, result: VoiceResult | null, by: By | null, guests = false): boolean {
  return mode === "require" && !guests && (checkedStarts as readonly (By | null)[]).includes(by) && (result === null || result.verdict === "different" || result.verdict === "no speech");
}

export type VoiceCheck = (sound: Uint8Array) => Promise<VoiceResult>;

export type VoiceIdDeps = { loadModel?: () => Promise<Embedder>; loadPrints?: () => Promise<NamedVoiceprint[]> };

export async function loadVoiceId(settings: VoiceIdSettings, deps: VoiceIdDeps = {}): Promise<VoiceCheck | null> {
  if (settings.mode === "off") return null;
  const owner = settings.owner ?? defaultVoiceOwner;
  const voiceprints = await (deps.loadPrints ?? (() => loadVoiceprints(owner)))();
  const embedder = await (deps.loadModel ?? (() => loadVoiceModel()))();
  const fbank = createFbank();
  return (sound) => scoreVoice(sound, voiceprints, embedder, settings.threshold, owner, fbank);
}

export function describeVoice(result: VoiceResult, threshold: number): string {
  if (result.verdict === "no speech") return "No speech was heard, so there was nothing to compare.";
  if (result.verdict === "too short") return `Speech was heard for only ${(result.speechMs / 1000).toFixed(1)} seconds, under the ${shortestSpeechMs / 1000} second a voice needs to be compared fairly.`;
  const of = result.against === undefined ? "" : ` of ${result.against} voiceprint${result.against === 1 ? "" : "s"}`;
  if (result.verdict === "different") return `Best score${of}: ${(result.score ?? 0).toFixed(2)}. At the threshold of ${threshold}, that counts as nobody's voiceprint.`;
  const who = result.who ?? "a voiceprint";
  return `Best score${of}: ${(result.score ?? 0).toFixed(2)}, ${who}'s. At the threshold of ${threshold}, that counts as ${who}${result.owner === true ? ", the owner" : ""}.`;
}
