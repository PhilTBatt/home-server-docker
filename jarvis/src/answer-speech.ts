import type { SpeechStart } from "./config.js";
import { shortError, type Player } from "./player.js";
import { createSentences } from "./sentences.js";
import { playSound, soundFor, unlessCalledOff, type SpeechEngine } from "./speech.js";
import { speechSentenceLimit, startSpeechQueue, type SpeechQueueDeps, type SpeechReport } from "./speech-queue.js";

export type AnswerSpeech = {
  text(delta: string): void;
  gap(): void;
  tool(): void;
  restart(): void;
  end(): void;
  stop(): void;
  finish(): boolean;
  done(): Promise<void>;
  report(): SpeechReport;
};

export type Filler = { waitMs: number; checkMs: number; quiet(): boolean; play(signal: AbortSignal): Promise<void> };

export type AnswerSpeechDeps = Pick<SpeechQueueDeps, "make" | "play" | "beforePlay" | "now" | "ahead" | "limit" | "failureLimit" | "bundle" | "after"> & { start: SpeechStart; skipCode?: boolean; filler?: Filler };

export type Speaker = { engine: SpeechEngine; device: string; startPlayer: (options: { device: string; rate: number }) => Player; lastPlayer: { ended: Promise<void> } };

export const playSpareMs = 10_000;

export const playerGoneMs = 3000;

export const slowPlayerMessage = "A sentence's player didn't finish in time, so it was stopped";

export function playLimitMs(bytes: number, rate: number): number {
  return Math.ceil((bytes / 2 / rate) * 2000) + playSpareMs;
}

async function untilGone(ended: Promise<void>, ms: number, signal: AbortSignal): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const given = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
  try {
    await unlessCalledOff(Promise.race([ended, given]), signal);
  } finally {
    clearTimeout(timer);
  }
}

export function speakerParts(speaker: Speaker, limitMs: (bytes: number, rate: number) => number = playLimitMs, goneMs = playerGoneMs): Pick<SpeechQueueDeps, "make" | "play" | "beforePlay"> {
  const startPlayer = (options: { device: string; rate: number }) => {
    const player = speaker.startPlayer(options);
    speaker.lastPlayer.ended = player.ended ?? Promise.resolve();
    return player;
  };
  return {
    make: (sentence, signal) => soundFor(speaker.engine, sentence, signal),
    beforePlay: (signal) => untilGone(speaker.lastPlayer.ended, goneMs, signal),
    play: async (sound, signal) => {
      const tooLong = AbortSignal.timeout(limitMs(sound.length, speaker.engine.sampleRate));
      try {
        await playSound(sound, speaker.device, speaker.engine.sampleRate, startPlayer, AbortSignal.any([signal, tooLong]));
      } catch (error) {
        if (tooLong.aborted && !signal.aborted) throw new Error(slowPlayerMessage);
        throw error;
      }
    },
  };
}

export function startAnswerSpeech(deps: AnswerSpeechDeps): AnswerSpeech {
  const since = deps.now();
  const fresh = () => ({ sentences: createSentences({ start: deps.start, skipCode: deps.skipCode }), queue: startSpeechQueue({ ...deps, since }) });
  let current = fresh();
  let closed = false;
  const earlier = { requests: 0, requestedSentences: 0 };
  let cleared = deps.after === undefined;
  const clear = () => (cleared = true);
  void deps.after?.then(clear, clear);
  const hushed = new AbortController();
  let listening: AbortController | null = null;
  let filled: Promise<void> = Promise.resolve();
  let finished: { queue: Promise<void>; filled: Promise<void>; both: Promise<void> } | null = null;
  const calm = () => {
    listening?.abort();
    listening = null;
  };
  const fillSilence = (filler: Filler) => {
    calm();
    const mine = new AbortController();
    listening = mine;
    let quietSince: number | null = null;
    const check = () => {
      if (current.queue.report().gaveUp) {
        calm();
        return;
      }
      if (!cleared || !current.queue.quiet() || !filler.quiet()) {
        quietSince = null;
        return;
      }
      const at = deps.now();
      quietSince ??= at;
      if (at - quietSince < filler.waitMs) return;
      calm();
      filled = filler.play(hushed.signal).catch(() => {});
    };
    const timer = setInterval(check, filler.checkMs);
    timer.unref();
    mine.signal.addEventListener("abort", () => clearInterval(timer), { once: true });
  };
  return {
    text(delta) {
      if (delta.trim() !== "") calm();
      for (const sentence of current.sentences.push(delta)) current.queue.add(sentence);
    },
    gap() {
      calm();
      for (const sentence of current.sentences.end()) current.queue.add(sentence);
    },
    tool() {
      for (const sentence of current.sentences.end()) current.queue.add(sentence);
      if (closed || deps.filler === undefined) calm();
      else fillSilence(deps.filler);
    },
    restart() {
      calm();
      if (closed) return;
      current.queue.stop();
      const before = current.queue.report();
      earlier.requests += before.requests;
      earlier.requestedSentences += before.requestedSentences;
      current = fresh();
    },
    end() {
      closed = true;
      calm();
      for (const sentence of current.sentences.end()) current.queue.add(sentence);
      current.queue.end();
    },
    stop() {
      closed = true;
      calm();
      hushed.abort();
      current.queue.stop();
    },
    finish() {
      closed = true;
      calm();
      return current.queue.finish();
    },
    done: () => {
      const queue = current.queue.done;
      if (finished === null || finished.queue !== queue || finished.filled !== filled) finished = { queue, filled, both: Promise.all([queue, filled]).then(() => {}) };
      return finished.both;
    },
    report: () => {
      const latest = current.queue.report();
      return { ...latest, requests: earlier.requests + latest.requests, requestedSentences: earlier.requestedSentences + latest.requestedSentences };
    },
  };
}

export function speechNotes(report: SpeechReport, limit = speechSentenceLimit): string[] {
  const notes: string[] = [];
  const why = report.problem === null ? "" : `: ${shortError(report.problem)}`;
  if (report.gaveUp) notes.push(report.spoken === 0 ? `the last answer wasn't spoken${why}` : `the rest of the last answer wasn't spoken${why}`);
  else if (report.failed > 0) notes.push(`${report.failed} sentence${report.failed === 1 ? "" : "s"} of the last answer ${report.failed === 1 ? "wasn't" : "weren't"} spoken${why}`);
  if (report.tooLong && !report.gaveUp) notes.push(`only the first ${limit} sentences of the last answer were spoken`);
  return notes;
}
