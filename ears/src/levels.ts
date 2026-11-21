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

export type Frames = { push(sound: Uint8Array): number[]; clear(): void };

export function createFrames(size = frameBytes): Frames {
  let partial = new Uint8Array(0);
  return {
    push(sound) {
      const joined = new Uint8Array(partial.length + sound.length);
      joined.set(partial, 0);
      joined.set(sound, partial.length);
      const levels: number[] = [];
      let at = 0;
      for (; at + size <= joined.length; at += size) levels.push(frameLevel(joined.subarray(at, at + size)));
      partial = joined.slice(at);
      return levels;
    },
    clear() {
      partial = new Uint8Array(0);
    },
  };
}

export type QuietEnded = { reason: string; spoke: boolean };

export type QuietEnd = { push(level: number): QuietEnded | null };

export type QuietOptions = { speakingAbove: number; settleMs?: number; startWithinMs?: number; quietForMs?: number };

function secondsOf(ms: number): string {
  const value = ms / 1000;
  return `${value} second${value === 1 ? "" : "s"}`;
}

export function createQuietEnd(options: QuietOptions): QuietEnd {
  const settle = options.settleMs ?? settleMs;
  const startWithin = options.startWithinMs ?? startWithinMs;
  const quietFor = options.quietForMs ?? quietForMs;
  let heard = 0;
  let lastLoud: number | null = null;
  return {
    push(level) {
      heard += frameMs;
      if (heard > settle && level > options.speakingAbove) lastLoud = heard;
      if (lastLoud !== null && heard - lastLoud >= quietFor) return { reason: `it went quiet for ${secondsOf(quietFor)} after you spoke`, spoke: true };
      if (lastLoud === null && heard >= startWithin) return { reason: `nothing loud enough to be speech came within ${secondsOf(startWithin)}, so it wasn't sent to Whisper`, spoke: false };
      return null;
    },
  };
}
