import { createCutter, createFrames, frameLevel, type Ender, type Pausing, type QuietEnd, type SpeechEnd, type SpeechHeard } from "./levels.js";
import { bytesPerSecond, recordingLimitMs, type Recording, type Stopped } from "./recorder.js";
import { heardSpeech, type Detector } from "./silero.js";
import { checkAfterMs, doneAfterMs, judgeWithinMs, judgeWords, moreAfterMs, type Verdict } from "./turn.js";

export const detectorBehindMs = 1_000;

export type By = "push" | "wake" | "follow" | "button";

export type Asking = { n: number; text: string };

export type Tap = Recording & { readonly by: By; push(sound: Uint8Array): void; fail(reason: string): void; asking(): Asking | null; judge(n: number, verdict: "done" | "more"): boolean };

export type Words = { toText: (sound: Uint8Array, signal: AbortSignal) => Promise<string>; usualMs: number; judging?: () => boolean; changed?: () => void };

export type Judged = { detector: Detector; end: SpeechEnd; fallback: (level: number) => boolean; failed?: (why: string) => void };

export type TapOptions = { by: By; limitMs?: number; maxBytes?: number; before?: Uint8Array; quiet?: QuietEnd | null; judged?: Judged | null; ender?: Ender; pauseMs?: number; now?: () => number; words?: Words | null };

function reasonOf(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error)).replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/ {2,}/g, " ").trim();
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

function speechOf(options: TapOptions): { speech?: SpeechHeard } {
  const speech = options.judged?.end.heard() ?? options.quiet?.heard() ?? null;
  return speech === null ? {} : { speech };
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
  const pausing: Pausing | null = options.judged?.end ?? options.quiet ?? null;
  const words = pausing === null ? null : (options.words ?? null);
  let verdict: Verdict | null = null;
  let judgedBy: "rules" | "chat" | null = null;
  let looked = false;
  let looking: AbortController | null = null;
  let looks = 0;
  let text: string | null = null;
  let ask: (Asking & { at: number }) | null = null;
  let asks = 0;

  function soundSoFar(): Uint8Array {
    const sound = new Uint8Array(before.length + kept);
    sound.set(before, 0);
    let at = before.length;
    for (const piece of pieces) {
      sound.set(piece, at);
      at += piece.length;
    }
    return sound.subarray(0, sound.length - (sound.length % 2));
  }

  function end(reason: string, failed: boolean, unheard = false): Promise<Stopped> {
    if (over !== null) return ended;
    clearTimeout(limit);
    looking?.abort();
    looking = null;
    const sound = soundSoFar();
    pieces.length = 0;
    over = { reason, failed, bytes, ms: now() - began, sound, ...(unheard ? { unheard: true as const } : {}), ...(options.ender === undefined ? {} : { ender: options.ender }), ...(options.pauseMs === undefined ? {} : { pauseMs: options.pauseMs }), ...speechOf(options), ...(words === null ? {} : { words: { looks, verdict, by: judgedBy } }), ...(text === null || failed ? {} : { text }) };
    finish(over);
    return ended;
  }

  function pauseFor(usual: number): number {
    if (verdict === "done") return Math.min(usual, doneAfterMs);
    if (verdict === "more") return Math.max(usual, moreAfterMs);
    return ask === null ? usual : Math.max(usual, ask.at + judgeWithinMs);
  }

  function look(listening: Words, timing: Pausing) {
    const calledOff = new AbortController();
    looking = calledOff;
    looks++;
    listening.toText(soundSoFar(), calledOff.signal).then(
      (heard) => {
        if (looking !== calledOff || over !== null) return;
        looking = null;
        text = heard.replace(/\s+/g, " ").trim();
        verdict = judgeWords(text);
        judgedBy = "rules";
        if (verdict === "unsure" && listening.judging?.() === true) {
          asks++;
          ask = { n: asks, text, at: timing.quietMs() ?? 0 };
        }
        timing.quietFor(pauseFor(listening.usualMs));
        listening.changed?.();
      },
      () => {
        if (looking === calledOff) looking = null;
      },
    );
  }

  function afterFrame() {
    if (words === null || pausing === null || over !== null) return;
    const quiet = pausing.quietMs();
    if (quiet === null) return;
    if (quiet === 0) {
      const asked = ask !== null;
      looking?.abort();
      looking = null;
      looked = false;
      verdict = null;
      judgedBy = null;
      text = null;
      ask = null;
      pausing.quietFor(words.usualMs);
      if (asked) words.changed?.();
      return;
    }
    if (looked || quiet < checkAfterMs) return;
    looked = true;
    look(words, pausing);
  }

  return {
    by: options.by,
    pid: undefined,
    ended,
    stop: (reason) => end(reason, false),
    fail: (reason) => void end(reason, true),
    speechHeard: () => (options.judged?.end.heard() ?? options.quiet?.heard() ?? null) !== null,
    asking: () => (ask === null || over !== null ? null : { n: ask.n, text: ask.text }),
    judge(n, given) {
      if (over !== null || ask === null || ask.n !== n || words === null || pausing === null) return false;
      verdict = given;
      judgedBy = "chat";
      ask = null;
      pausing.quietFor(pauseFor(words.usualMs));
      words.changed?.();
      return true;
    },
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
          else afterFrame();
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
        afterFrame();
      }
    },
  };
}
