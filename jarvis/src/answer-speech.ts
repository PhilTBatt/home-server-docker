import type { SpeechStart } from "./config.js";
import { shortError, type Player } from "./player.js";
import { createSentences } from "./sentences.js";
import { playSound, soundFor, type SpeechEngine } from "./speech.js";
import { speechSentenceLimit, startSpeechQueue, type SpeechQueueDeps, type SpeechReport } from "./speech-queue.js";

export type AnswerSpeech = {
  text(delta: string): void;
  gap(): void;
  restart(): void;
  end(): void;
  stop(): void;
  finish(): boolean;
  done(): Promise<void>;
  report(): SpeechReport;
};

export type AnswerSpeechDeps = Pick<SpeechQueueDeps, "make" | "play" | "now" | "ahead" | "limit" | "failureLimit" | "after"> & { start: SpeechStart };

export type Speaker = { engine: SpeechEngine; device: string; startPlayer: (options: { device: string; rate: number }) => Player };

export const playSpareMs = 10_000;

export const slowPlayerMessage = "A sentence's player didn't finish in time, so it was stopped";

export function playLimitMs(bytes: number, rate: number): number {
  return Math.ceil((bytes / 2 / rate) * 2000) + playSpareMs;
}

export function speakerParts(speaker: Speaker, limitMs: (bytes: number, rate: number) => number = playLimitMs): Pick<SpeechQueueDeps, "make" | "play"> {
  return {
    make: (sentence, signal) => soundFor(speaker.engine, sentence, signal),
    play: async (sound, signal) => {
      const tooLong = AbortSignal.timeout(limitMs(sound.length, speaker.engine.sampleRate));
      try {
        await playSound(sound, speaker.device, speaker.engine.sampleRate, speaker.startPlayer, AbortSignal.any([signal, tooLong]));
      } catch (error) {
        if (tooLong.aborted && !signal.aborted) throw new Error(slowPlayerMessage);
        throw error;
      }
    },
  };
}

export function startAnswerSpeech(deps: AnswerSpeechDeps): AnswerSpeech {
  const since = deps.now();
  const fresh = () => ({ sentences: createSentences({ start: deps.start }), queue: startSpeechQueue({ ...deps, since }) });
  let current = fresh();
  let closed = false;
  return {
    text(delta) {
      for (const sentence of current.sentences.push(delta)) current.queue.add(sentence);
    },
    gap() {
      for (const sentence of current.sentences.end()) current.queue.add(sentence);
    },
    restart() {
      if (closed) return;
      current.queue.stop();
      current = fresh();
    },
    end() {
      closed = true;
      for (const sentence of current.sentences.end()) current.queue.add(sentence);
      current.queue.end();
    },
    stop() {
      closed = true;
      current.queue.stop();
    },
    finish() {
      closed = true;
      return current.queue.finish();
    },
    done: () => current.queue.done,
    report: () => current.queue.report(),
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
