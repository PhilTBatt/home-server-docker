import { createCutter, createFrames, frameLevel, type Ender, type QuietEnd, type SpeechEnd } from "./levels.js";
import { bytesPerSecond, recordingLimitMs, type Recording, type Stopped } from "./recorder.js";
import { heardSpeech, type Detector } from "./silero.js";

export const detectorBehindMs = 1_000;

export type By = "push" | "wake" | "follow";

export type Tap = Recording & { readonly by: By; push(sound: Uint8Array): void; fail(reason: string): void };

export type Judged = { detector: Detector; end: SpeechEnd; fallback: (level: number) => boolean; failed?: (why: string) => void };

export type TapOptions = { by: By; limitMs?: number; maxBytes?: number; before?: Uint8Array; quiet?: QuietEnd | null; judged?: Judged | null; ender?: Ender; pauseMs?: number; now?: () => number };

function reasonOf(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error)).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/ {2,}/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

export function startTap(options: TapOptions): Tap {
  const now = options.now ?? (() => performance.now());
  const limitMs = options.limitMs ?? recordingLimitMs;
  const maxBytes = options.maxBytes ?? Math.ceil((limitMs / 1000) * bytesPerSecond * 1.25);
  const began = now();
  const before = options.before ?? new Uint8Array(0);
  const pieces: Uint8Array[] = [];
  const frames = createFrames();
  const cutter = createCutter();
  let judging: Promise<void> = Promise.resolve();
  const waiting: { frame: Uint8Array; at: number }[] = [];
  let broken = false;
  let bytes = 0;
  let kept = 0;
  let over: Stopped | null = null;
  let finish: (stopped: Stopped) => void = () => {};
  const ended = new Promise<Stopped>((resolve) => (finish = resolve));
  const limit = setTimeout(() => void end(`it reached the ${limitMs / 1000}-second limit`, false), limitMs);

  function end(reason: string, failed: boolean, unheard = false): Promise<Stopped> {
    if (over !== null) return ended;
    clearTimeout(limit);
    const sound = new Uint8Array(before.length + kept);
    sound.set(before, 0);
    let at = before.length;
    for (const piece of pieces) {
      sound.set(piece, at);
      at += piece.length;
    }
    pieces.length = 0;
    over = { reason, failed, bytes, ms: now() - began, sound: sound.subarray(0, sound.length - (sound.length % 2)), ...(unheard ? { unheard: true as const } : {}), ...(options.ender === undefined ? {} : { ender: options.ender }), ...(options.pauseMs === undefined ? {} : { pauseMs: options.pauseMs }) };
    finish(over);
    return ended;
  }

  return {
    by: options.by,
    pid: undefined,
    ended,
    stop: (reason) => end(reason, false),
    fail: (reason) => void end(reason, true),
    push(sound) {
      if (over !== null) return;
      bytes += sound.length;
      if (bytes > maxBytes) {
        void end("more sound came than the time limit allows", false);
        return;
      }
      pieces.push(new Uint8Array(sound));
      kept += sound.length;
      const judged = options.judged;
      if (judged !== undefined && judged !== null) {
        const settle = (speech: boolean) => {
          const ended = judged.end.push(speech, broken ? "loudness" : "silero");
          if (ended !== null) void end(ended.reason, false, !ended.spoke);
        };
        const giveUp = (why: string) => {
          broken = true;
          judged.failed?.(why);
          for (const { frame } of waiting.splice(0)) if (over === null) settle(judged.fallback(frameLevel(frame)));
        };
        for (const frame of cutter.push(sound)) {
          if (over !== null) return;
          if (waiting.length > 0 && now() - waiting[0].at > detectorBehindMs) giveUp(`it fell more than ${detectorBehindMs / 1000} second behind`);
          if (broken) {
            settle(judged.fallback(frameLevel(frame)));
            continue;
          }
          waiting.push({ frame, at: now() });
          judging = judging.then(async () => {
            if (over !== null || broken) return;
            let speech: boolean;
            try {
              speech = heardSpeech(await judged.detector.frame(waiting[0].frame));
            } catch (error) {
              if (over === null && !broken) giveUp(reasonOf(error));
              return;
            }
            if (over !== null || broken) return;
            waiting.shift();
            settle(speech);
          });
        }
      }
      if (options.quiet === undefined || options.quiet === null) return;
      for (const level of frames.push(sound)) {
        const ended = options.quiet.push(level);
        if (ended !== null) {
          void end(ended.reason, false, !ended.spoke);
          return;
        }
      }
    },
  };
}
