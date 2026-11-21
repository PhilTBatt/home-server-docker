import { createFrames, type QuietEnd } from "./levels.js";
import { bytesPerSecond, recordingLimitMs, type Recording, type Stopped } from "./recorder.js";

export type By = "push" | "wake";

export type Tap = Recording & { readonly by: By; push(sound: Uint8Array): void; fail(reason: string): void };

export type TapOptions = { by: By; limitMs?: number; maxBytes?: number; before?: Uint8Array; quiet?: QuietEnd | null; now?: () => number };

export function startTap(options: TapOptions): Tap {
  const now = options.now ?? (() => performance.now());
  const limitMs = options.limitMs ?? recordingLimitMs;
  const maxBytes = options.maxBytes ?? Math.ceil((limitMs / 1000) * bytesPerSecond * 1.25);
  const began = now();
  const before = options.before ?? new Uint8Array(0);
  const pieces: Uint8Array[] = [];
  const frames = createFrames();
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
    over = { reason, failed, bytes, ms: now() - began, sound: sound.subarray(0, sound.length - (sound.length % 2)), ...(unheard ? { unheard: true as const } : {}) };
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
