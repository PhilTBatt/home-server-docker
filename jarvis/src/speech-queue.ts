import { unlessCalledOff } from "./speech.js";

export const speechAhead = 2;
export const speechSentenceLimit = 40;
export const speechFailureLimit = 2;

export type SpeechReport = {
  firstSentenceMs: number | null;
  firstSoundMadeMs: number | null;
  firstSoundMs: number | null;
  longestSilenceMs: number | null;
  spoken: number;
  failed: number;
  left: number;
  problem: string | null;
  gaveUp: boolean;
  tooLong: boolean;
  stopped: boolean;
};

export type SpeechQueueDeps = {
  make: (sentence: string, signal: AbortSignal) => Promise<Uint8Array>;
  play: (sound: Uint8Array, signal: AbortSignal) => Promise<void>;
  now: () => number;
  since: number;
  ahead?: number;
  limit?: number;
  failureLimit?: number;
};

export type SpeechQueue = {
  add(sentence: string): void;
  end(): void;
  stop(): void;
  done: Promise<void>;
  report(): SpeechReport;
};

export function startSpeechQueue(deps: SpeechQueueDeps): SpeechQueue {
  const ahead = deps.ahead ?? speechAhead;
  const limit = deps.limit ?? speechSentenceLimit;
  const failureLimit = deps.failureLimit ?? speechFailureLimit;
  const calledOff = new AbortController();
  const waiting: string[] = [];
  const ready: Uint8Array[] = [];
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, left: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  let taken = 0;
  let ended = false;
  let over = false;
  let madeAll = false;
  let playedAll = false;
  let makeFailures = 0;
  let playFailures = 0;
  let waking: (() => void)[] = [];
  const sinceMs = () => deps.now() - deps.since;
  const changed = () => {
    const all = waking;
    waking = [];
    for (const wake of all) wake();
  };
  const change = () => new Promise<void>((resolve) => waking.push(resolve));

  const leaveWaiting = () => {
    report.left += waiting.length;
    waiting.length = 0;
    ended = true;
  };

  const leaveAll = () => {
    leaveWaiting();
    report.left += ready.length;
    ready.length = 0;
    over = true;
  };

  const failed = (error: unknown) => {
    report.failed++;
    report.problem ??= error instanceof Error ? error.message : String(error);
  };

  async function makeAll(): Promise<void> {
    try {
      for (;;) {
        while (!over && ((waiting.length === 0 && !ended) || ready.length >= ahead)) await change();
        const sentence = over ? undefined : waiting.shift();
        if (sentence === undefined) return;
        report.firstSentenceMs ??= sinceMs();
        try {
          const sound = await unlessCalledOff(deps.make(sentence, calledOff.signal), calledOff.signal);
          if (over) {
            report.left++;
            return;
          }
          report.firstSoundMadeMs ??= sinceMs();
          makeFailures = 0;
          ready.push(sound);
        } catch (error) {
          if (over) {
            report.left++;
            return;
          }
          failed(error);
          makeFailures++;
          if (makeFailures >= failureLimit) {
            report.gaveUp = true;
            leaveWaiting();
          }
        }
        changed();
      }
    } finally {
      madeAll = true;
      changed();
    }
  }

  async function playAll(): Promise<void> {
    let lastEnded: number | null = null;
    const begun = (handed: number) => {
      report.firstSoundMs ??= handed;
      if (lastEnded !== null) report.longestSilenceMs = Math.max(report.longestSilenceMs ?? 0, handed - lastEnded);
    };
    try {
      for (;;) {
        while (!over && ready.length === 0 && !madeAll) await change();
        const sound = over ? undefined : ready.shift();
        if (sound === undefined) return;
        changed();
        const handed = sinceMs();
        try {
          await unlessCalledOff(deps.play(sound, calledOff.signal), calledOff.signal);
          begun(handed);
          lastEnded = sinceMs();
          report.spoken++;
          playFailures = 0;
        } catch (error) {
          if (over) {
            begun(handed);
            report.left++;
            return;
          }
          failed(error);
          playFailures++;
          if (playFailures >= failureLimit) {
            report.gaveUp = true;
            leaveAll();
            calledOff.abort(new Error("Speech was given up on"));
          }
        }
        changed();
      }
    } finally {
      playedAll = true;
    }
  }

  const done = Promise.all([makeAll(), playAll()]).then(() => {});

  return {
    add(sentence) {
      if (report.gaveUp) {
        report.left++;
        return;
      }
      if (ended) return;
      if (taken >= limit) {
        report.tooLong = true;
        report.left++;
        return;
      }
      taken++;
      waiting.push(sentence);
      changed();
    },
    end() {
      ended = true;
      changed();
    },
    stop() {
      if (playedAll) return;
      report.stopped = true;
      leaveAll();
      calledOff.abort(new Error("Speech was stopped"));
      changed();
    },
    done,
    report: () => ({ ...report }),
  };
}
