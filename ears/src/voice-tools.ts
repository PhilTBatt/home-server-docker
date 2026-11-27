import type { Writable } from "node:stream";
import { readMicSettings, readVoiceIdThreshold, readVoiceOwner } from "./config.js";
import { busyLine, readWait, secondsOf } from "./mic-test.js";
import { applyMicSettings, findMicCard, recorderArgs, recorderCommand, type MicCard, type MicSetters } from "./mic-card.js";
import { startRecording, type Recorder } from "./recorder.js";
import { cosine, describeVoice, embedSpeech, loadVoiceModel, loadVoiceprints, makeVoiceprint, scoreVoice, voiceprintText, type Embedder, type Heard, type NamedVoiceprint } from "./voice-id.js";

export const enrolSentences = [
  "Hey, what's the weather going to be like this afternoon?",
  "Put the kettle on, and remind me about the bins on Thursday.",
  "How long is it until the next train, and is it running late?",
  "Read me the last note I made, then play something quiet.",
  "Turn the volume down a bit, and tell me the time in Tokyo.",
] as const;
export const enrolClipMs = 6_000;
export const enrolReadyMs = 2_000;
export const enrolShortestMs = 1_500;
export const enrolTries = 3;
export const checkMs = 5_000;
export const voiceprintFollows = "voiceprint follows";

export type VoiceToolDeps = MicSetters & {
  env: Record<string, string | undefined>;
  say: (line: string) => void;
  loadModel?: () => Promise<Embedder>;
  findCard?: () => Promise<MicCard>;
  recorder?: (card: MicCard) => Recorder;
  sleep?: (ms: number) => Promise<void>;
  limitMs?: number;
};

export type EnrolDeps = VoiceToolDeps & { send: (text: string) => Promise<void>; now?: () => Date };

export type CheckDeps = VoiceToolDeps & { loadPrints?: (owner: string) => Promise<NamedVoiceprint[]> };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleeper(deps: VoiceToolDeps): (ms: number) => Promise<void> {
  return deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

async function prepare(deps: VoiceToolDeps): Promise<{ card: MicCard; level: string; embedder: Embedder; threshold: number }> {
  const settings = readMicSettings(deps.env);
  const threshold = readVoiceIdThreshold(deps.env.EARS_VOICE_ID_THRESHOLD);
  const embedder = await (deps.loadModel ?? (() => loadVoiceModel()))();
  const card = await (deps.findCard ?? (() => findMicCard()))();
  const level = await applyMicSettings(card.number, settings, deps);
  return { card, level, embedder, threshold };
}

async function record(deps: VoiceToolDeps, card: MicCard, limitMs: number): Promise<Uint8Array | string> {
  const stopped = await startRecording({ recorder: (deps.recorder ?? ((found) => ({ command: recorderCommand, args: recorderArgs(found) })))(card), limitMs }).ended;
  if (stopped.failed) return /busy/i.test(stopped.reason) ? busyLine : `The recording didn't work: ${stopped.reason}.`;
  return stopped.sound;
}

export function sendText(out: Writable): (text: string) => Promise<void> {
  return (text) => new Promise((resolve) => out.write(`${voiceprintFollows}\n${text}\n`, () => resolve()));
}

export function whyNot(heard: Heard): string {
  if (heard.problem === "no speech") return "No speech was heard in that one.";
  return `Speech was heard for only ${secondsOf(heard.speechMs)}, and a clip needs at least ${secondsOf(enrolShortestMs)}.`;
}

export function agreement(vectors: readonly Float32Array[]): number[] {
  return vectors.map((vector, index) => cosine(vector, makeVoiceprint(vectors.filter((_, other) => other !== index), new Date(0)).vector));
}

export async function runVoiceEnrol(deps: EnrolDeps): Promise<number> {
  let ready: Awaited<ReturnType<typeof prepare>>;
  try {
    ready = await prepare(deps);
  } catch (error) {
    deps.say(`The enrolment didn't start: ${messageOf(error)}.`);
    return 1;
  }
  const sleep = sleeper(deps);
  deps.say(`You'll read ${enrolSentences.length} short sentences, one at a time, into sound card ${ready.card.number}'s microphone (${ready.level}). Sit where you usually talk to Jarvis, with nobody else talking and the TV off. Nothing you say is kept: only the voiceprint made from it.`);
  const vectors: Float32Array[] = [];
  for (const [index, sentence] of enrolSentences.entries()) {
    let tries = 0;
    for (;;) {
      tries++;
      deps.say(`Sentence ${index + 1} of ${enrolSentences.length}. Read it at your normal speed when it says Go:`);
      deps.say(`  "${sentence}"`);
      await sleep(enrolReadyMs);
      deps.say(`Go (${secondsOf(deps.limitMs ?? enrolClipMs)}).`);
      const sound = await record(deps, ready.card, deps.limitMs ?? enrolClipMs);
      if (typeof sound === "string") {
        deps.say(sound);
        return 1;
      }
      let heard: Heard;
      try {
        heard = await embedSpeech(sound, ready.embedder, enrolShortestMs);
      } catch (error) {
        deps.say(`The voice model couldn't run: ${messageOf(error)}.`);
        return 1;
      }
      if (heard.problem === null) {
        vectors.push(heard.vector);
        break;
      }
      if (tries >= enrolTries) {
        deps.say(`${whyNot(heard)} That was ${enrolTries} tries at that sentence, so nothing was saved. Check the microphone with bash host/ears.sh mic-test, then run this again.`);
        return 1;
      }
      deps.say(`${whyNot(heard)} Let's try that sentence again.`);
    }
  }
  const scores = agreement(vectors);
  deps.say(`How much each clip sounds like the rest: ${scores.map((score) => score.toFixed(2)).join(", ")}.`);
  const odd = scores.findIndex((score) => score < ready.threshold);
  if (odd !== -1) {
    deps.say(`Clip ${odd + 1} sounds like a different voice from the others (under the threshold of ${ready.threshold}), so nothing was saved. Make sure only you are talking, somewhere quiet, and run this again.`);
    return 1;
  }
  const voiceprint = makeVoiceprint(vectors, (deps.now ?? (() => new Date()))());
  deps.say(`Made a voiceprint from ${vectors.length} clips.`);
  await deps.send(voiceprintText(voiceprint));
  return 0;
}

export async function runVoiceCheck(deps: CheckDeps): Promise<number> {
  let ready: Awaited<ReturnType<typeof prepare>>;
  let voiceprints: NamedVoiceprint[];
  let owner: string;
  let wait: number;
  try {
    wait = readWait(deps.env.EARS_VOICE_CHECK_WAIT);
    owner = readVoiceOwner(deps.env.EARS_VOICE_OWNER);
    voiceprints = await (deps.loadPrints ?? ((name) => loadVoiceprints(name)))(owner);
    ready = await prepare(deps);
  } catch (error) {
    deps.say(`The check didn't start: ${messageOf(error)}.`);
    return 1;
  }
  for (const print of voiceprints) deps.say(`${print.name}${print.name === owner ? " (the owner)" : ""}: made from ${print.clips} clip${print.clips === 1 ? "" : "s"} on ${print.made.slice(0, 10)}.`);
  if (wait > 0) {
    deps.say(`Waiting ${secondsOf(wait * 1000)} first.`);
    await sleeper(deps)(wait * 1000);
  }
  const limitMs = deps.limitMs ?? checkMs;
  deps.say(`Recording ${secondsOf(limitMs)} from sound card ${ready.card.number}'s microphone (${ready.level}). Talk as you would to Jarvis, or let whoever you're testing talk.`);
  const sound = await record(deps, ready.card, limitMs);
  if (typeof sound === "string") {
    deps.say(sound);
    return 1;
  }
  try {
    deps.say(describeVoice(await scoreVoice(sound, voiceprints, ready.embedder, ready.threshold, owner), ready.threshold));
  } catch (error) {
    deps.say(`The voice model couldn't run: ${messageOf(error)}.`);
    return 1;
  }
  return 0;
}
