import { unlessCalledOff } from "./speech.js";

export const speechAhead = 2;
export const speechSentenceLimit = 40;
export const speechFailureLimit = 2;
export const speechBundleLimit = 250;

export type SpeechReport = {
  firstSentenceMs: number | null;
  firstSoundMadeMs: number | null;
  firstSoundMs: number | null;
  longestSilenceMs: number | null;
  spoken: number;
  failed: number;
  failedMaking: number;
  failedPlaying: number;
  left: number;
  requests: number;
  requestedSentences: number;
  problem: string | null;
  gaveUp: boolean;
  tooLong: boolean;
  stopped: boolean;
};

export type SpeechQueueDeps = {
  make: (sentence: string, signal: AbortSignal) => Promise<Uint8Array>;
  play: (sound: Uint8Array, signal: AbortSignal) => Promise<void>;
  beforePlay?: (signal: AbortSignal) => Promise<void>;
  now: () => number;
  since: number;
  ahead?: number;
  limit?: number;
  failureLimit?: number;
  bundle?: boolean;
  bundleLimit?: number;
  after?: Promise<void>;
};

export type SpeechQueue = {
  add(sentence: string): void;
  end(): void;
  stop(): void;
  finish(): boolean;
  done: Promise<void>;
  report(): SpeechReport;
};

export function endsSentence(text: string): boolean {
  return /[.!?…]["'”’)\]]*$/.test(text.trimEnd());
}

export function startSpeechQueue(deps: SpeechQueueDeps): SpeechQueue {
  const ahead = deps.ahead ?? speechAhead;
  const limit = deps.limit ?? speechSentenceLimit;
  const failureLimit = deps.failureLimit ?? speechFailureLimit;
  const bundleLimit = deps.bundle === true ? (deps.bundleLimit ?? speechBundleLimit) : 0;
  const calledOff = new AbortController();
  const makingOff = new AbortController();
  const making = AbortSignal.any([calledOff.signal, makingOff.signal]);
  const waiting: string[] = [];
  const ready: { sound: Uint8Array; sentences: number }[] = [];
  const report: SpeechReport = { firstSentenceMs: null, firstSoundMadeMs: null, firstSoundMs: null, longestSilenceMs: null, spoken: 0, failed: 0, failedMaking: 0, failedPlaying: 0, left: 0, requests: 0, requestedSentences: 0, problem: null, gaveUp: false, tooLong: false, stopped: false };
  let taken = 0;
  let ended = false;
  let over = false;
  let madeAll = false;
  let playedAll = false;
  let makeFailures = 0;
  let playFailures = 0;
  let playing = false;
  let lastPiece = 0;
  let clear = deps.after === undefined;
  let waking: (() => void)[] = [];
  const sinceMs = () => deps.now() - deps.since;
  const changed = () => {
    const all = waking;
    waking = [];
    for (const wake of all) wake();
  };
  const change = () => new Promise<void>((resolve) => waking.push(resolve));
  const cleared = () => {
    clear = true;
    changed();
  };
  void deps.after?.then(cleared, cleared);

  const leaveWaiting = () => {
    report.left += waiting.length;
    waiting.length = 0;
    ended = true;
  };

  const leaveAll = () => {
    leaveWaiting();
    report.left += ready.reduce((sum, made) => sum + made.sentences, 0);
    ready.length = 0;
    over = true;
  };

  const failed = (error: unknown, stage: "failedMaking" | "failedPlaying", sentences: number) => {
    report.failed += sentences;
    report[stage] += sentences;
    report.problem ??= error instanceof Error ? error.message : String(error);
  };

  const nextPiece = (): { text: string; sentences: number; length: number } | undefined => {
    const first = waiting.shift();
    if (first === undefined) return undefined;
    const parts = [first];
    let length = first.length;
    const room = lastPiece === 0 ? 0 : Math.min(bundleLimit, lastPiece * 2);
    while (waiting.length > 0 && endsSentence(parts[parts.length - 1]) && length + 1 + waiting[0].length <= room) {
      length += 1 + waiting[0].length;
      parts.push(waiting.shift() as string);
    }
    return { text: parts.join(" "), sentences: parts.length, length };
  };

  async function makeAll(): Promise<void> {
    try {
      for (;;) {
        while (!over && ((waiting.length === 0 && !ended) || ready.length >= ahead)) await change();
        const piece = over ? undefined : nextPiece();
        if (piece === undefined) return;
        report.firstSentenceMs ??= sinceMs();
        report.requests++;
        report.requestedSentences += piece.sentences;
        try {
          const sound = await unlessCalledOff(deps.make(piece.text, making), making);
          if (over) {
            report.left += piece.sentences;
            return;
          }
          report.firstSoundMadeMs ??= sinceMs();
          makeFailures = 0;
          lastPiece = piece.length;
          ready.push({ sound, sentences: piece.sentences });
        } catch (error) {
          if (over) {
            report.left += piece.sentences;
            return;
          }
          failed(error, "failedMaking", piece.sentences);
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
        while (!over && (ready.length === 0 ? !madeAll : !clear)) await change();
        const made = over ? undefined : ready.shift();
        if (made === undefined) return;
        changed();
        playing = true;
        await deps.beforePlay?.(calledOff.signal).catch(() => {});
        if (calledOff.signal.aborted) {
          report.left += made.sentences;
          return;
        }
        const handed = sinceMs();
        try {
          await unlessCalledOff(deps.play(made.sound, calledOff.signal), calledOff.signal).finally(() => (playing = false));
          begun(handed);
          lastEnded = sinceMs();
          report.spoken += made.sentences;
          playFailures = 0;
        } catch (error) {
          if (calledOff.signal.aborted) {
            begun(handed);
            report.left += made.sentences;
            return;
          }
          failed(error, "failedPlaying", made.sentences);
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
    finish() {
      if (playedAll) return false;
      if (madeAll && ready.length === 0) return playing;
      report.stopped = true;
      leaveAll();
      makingOff.abort(new Error("Speech was stopped"));
      changed();
      return playing;
    },
    done,
    report: () => ({ ...report }),
  };
}
