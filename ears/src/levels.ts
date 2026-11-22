import { bytesPerSecond } from "./recorder.js";

export const frameMs = 100;
export const frameBytes = (bytesPerSecond * frameMs) / 1000;
export const quietestShare = 0.2;
export const speakingTimes = 3;
export const speakingAtLeast = 300;
export const settleMs = 800;
export const startWithinMs = 5_000;
export const quietForMs = 1_500;

export function frameLevel(frame: Uint8Array): number {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.length - (frame.length % 2));
  const samples = view.byteLength / 2;
  if (samples === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index++) {
    const sample = view.getInt16(index * 2, true);
    sum += sample * sample;
  }
  return Math.round(Math.sqrt(sum / samples));
}

export function backgroundLevel(levels: readonly number[]): number {
  if (levels.length === 0) return 0;
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * quietestShare)];
}

export function speakingLevel(background: number): number {
  return Math.max(speakingAtLeast, background * speakingTimes);
}

export type Cutter = { push(sound: Uint8Array): Uint8Array[]; clear(): void };

export function createCutter(size = frameBytes): Cutter {
  let partial = new Uint8Array(0);
  return {
    push(sound) {
      const joined = new Uint8Array(partial.length + sound.length);
      joined.set(partial, 0);
      joined.set(sound, partial.length);
      const frames: Uint8Array[] = [];
      let at = 0;
      for (; at + size <= joined.length; at += size) frames.push(joined.subarray(at, at + size));
      partial = joined.slice(at);
      return frames;
    },
    clear() {
      partial = new Uint8Array(0);
    },
  };
}

export type Frames = { push(sound: Uint8Array): number[]; clear(): void };

export function createFrames(size = frameBytes): Frames {
  const cutter = createCutter(size);
  return { push: (sound) => cutter.push(sound).map(frameLevel), clear: () => cutter.clear() };
}

export const enders = ["loudness", "silero"] as const;
export type Ender = (typeof enders)[number];

export type QuietEnded = { reason: string; spoke: boolean };

export type SpeechHeard = { firstMs: number; speechMs: number; longestPauseMs: number };

export type SpeechEnd = { push(speech: boolean, by?: Ender): QuietEnded | null; heard(): SpeechHeard | null };

export type SpeechEndOptions = { by?: Ender; settleMs?: number; startWithinMs?: number; quietForMs?: number };

export type QuietEnd = { push(level: number): QuietEnded | null; heard(): SpeechHeard | null };

export type QuietOptions = { speakingAbove: number; settleMs?: number; startWithinMs?: number; quietForMs?: number };

function secondsOf(ms: number): string {
  const value = ms / 1000;
  return `${value} second${value === 1 ? "" : "s"}`;
}

export function createSpeechEnd(options: SpeechEndOptions = {}): SpeechEnd {
  const settle = options.settleMs ?? settleMs;
  const startWithin = options.startWithinMs ?? startWithinMs;
  const quietFor = options.quietForMs ?? quietForMs;
  let heard = 0;
  let lastSpeech: number | null = null;
  let firstSpeech: number | null = null;
  let speechFrames = 0;
  let longestPause = 0;
  return {
    push(speech, by = options.by) {
      const detector = by === "silero";
      heard += frameMs;
      if (heard > settle && speech) {
        if (lastSpeech !== null) longestPause = Math.max(longestPause, heard - lastSpeech - frameMs);
        firstSpeech ??= heard;
        speechFrames++;
        lastSpeech = heard;
      }
      if (lastSpeech !== null && heard - lastSpeech >= quietFor) return { reason: detector ? `the speech detector heard no speech for ${secondsOf(quietFor)} after you spoke` : `it went quiet for ${secondsOf(quietFor)} after you spoke`, spoke: true };
      if (lastSpeech === null && heard >= startWithin) return { reason: detector ? `the speech detector heard no speech within ${secondsOf(startWithin)}, so it wasn't sent to Whisper` : `nothing loud enough to be speech came within ${secondsOf(startWithin)}, so it wasn't sent to Whisper`, spoke: false };
      return null;
    },
    heard: () => (firstSpeech === null ? null : { firstMs: firstSpeech, speechMs: speechFrames * frameMs, longestPauseMs: longestPause }),
  };
}

export function createQuietEnd(options: QuietOptions): QuietEnd {
  const end = createSpeechEnd(options);
  return { push: (level) => end.push(level > options.speakingAbove), heard: end.heard };
}
